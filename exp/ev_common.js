// Event-scale inverse analysis: shared set-up.
// Window of each event: from WIN_BEFORE_H before its start to WIN_AFTER_H after its end (or to the next event start).
// Initial state from the MEASURED water content (Se of each sensor, converted with the layer curve used in the run),
// because during wetting the water mass is the state that matters and the suction sensor lags behind fast fronts.
// Soil in wetting: theta_r and n of the main drying curve of the layer, alpha_w = fA * alpha_d (Kool and Parker, 1987),
// theta_s_w = theta_r + g * (theta_s_d - theta_r): the drying theta_s is an extrapolation from suctions the TEROS 21 can
// measure, and during events the measured theta exceeds it (30% of event hours at 15 cm, peaks up to Se_d = 2).
// Se is always expressed on the DRYING scale of each sensor (observed) and of each layer (simulated), so it can exceed 1.
// Objective: RMSE of Se at the three sensors over the window (suction reported as a check only).
const fs = require('fs'), path = require('path'), { S, L, R2, KMAC_A1 } = require('./common.js');
const EV = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'sim', 'infiltration_events.json'))).events;
const CFG = { WIN_BEFORE_H: 6, WIN_AFTER_H: 48, SE_CLAMP: [0.002, 0.995], interception_evap: 'potential evaporation of the hour' };
const F = { NV: L.NV.F, V: L.V.F };
const t0 = Date.parse(F.NV.t0.replace(' ', 'T') + 'Z'), hix = t => Math.round((Date.parse(t.replace(' ', 'T') + 'Z') - t0) / 3.6e6);
function windows() {
  return EV.map((e, j) => { const i0 = hix(e.start) - CFG.WIN_BEFORE_H, iEnd = hix(e.end) + 1, nxt = j + 1 < EV.length ? hix(EV[j + 1].start) - CFG.WIN_BEFORE_H : Infinity;
    const i1 = Math.min(iEnd + CFG.WIN_AFTER_H, nxt, F.NV.n_hours); return { j, e, i0, iEnd, i1 }; }).filter(w => w.i0 > 0 && w.i1 - w.iEnd >= 12);
}
const seObs = (s, k, th) => { const p = L[s].fits.sensors[k]; return (th - p.theta_r) / (p.theta_s - p.theta_r); };
function soil(fA, log10K, g, mac) {    // fits object for buildConfig: layer curves alpha_w, theta_s_w; K multiplier relative to the drying calibration
  // mac (optional, bimodal variant): { gM: {A1, A2} macropore capacity in drying-Se units, alpha2 [1/kPa], n2 }
  if (!(fA >= 1) || !(g >= 1)) throw new Error('fA and g must be >= 1');
  const dry = JSON.parse(JSON.stringify(L.NV.fits)), f = JSON.parse(JSON.stringify(L.NV.fits));
  for (const k of ['A1', 'A2']) { f[k].alpha *= fA; f[k].theta_s = f[k].theta_r + g * (dry[k].theta_s - dry[k].theta_r);
    if (mac) { if (!(mac.gM[k] > 0)) throw new Error('missing macropore capacity for ' + k);
      Object.assign(f[k], { dts_macro: mac.gM[k] * (dry[k].theta_s - dry[k].theta_r), alpha2: mac.alpha2, n2: mac.n2 }); } }
  return { fits: f, dry, log10K, fA, g, mac: mac || null };
}
function thetaOf(q, s) {               // layer retention (unimodal or bimodal) at suction s [kPa]
  let t = q.theta_r + (q.theta_s - q.theta_r) * Math.pow(1 + Math.pow(q.alpha * s, q.n), -(1 - 1 / q.n));
  if (q.dts_macro) t += q.dts_macro * Math.pow(1 + Math.pow(q.alpha2 * s, q.n2), -(1 - 1 / q.n2));
  return t;
}
function suctionOf(q, th) {            // inverse by bisection in log s; s in [S_MIN, 1e6] kPa
  const S_MIN = 2 / S.CM_PER_KPA;      // air-entry head of the solver (hs = -2 cm)
  if (th >= thetaOf(q, S_MIN)) return S_MIN;
  let lo = Math.log(S_MIN), hi = Math.log(1e6);
  if (th <= thetaOf(q, 1e6)) return 1e6;   // drier than the curve at 1e6 kPa: clamped, as SE_CLAMP does in the unimodal case
  for (let i = 0; i < 80; i++) { const mid = 0.5 * (lo + hi); if (thetaOf(q, Math.exp(mid)) > th) lo = mid; else hi = mid; }
  return Math.exp(0.5 * (lo + hi));
}
function model(site, sl, extra) {      // column of the plot (vegetation of the plot), soil sl, outputs at the sensor depths
  const M = JSON.parse(JSON.stringify(L[site].M)); M.eFactor = R2.params[site].eFactor;
  M.zones.forEach(z => { z.Ks_cm_h *= Math.pow(10, R2.params.NV.log10_kmult + sl.log10K); if (z.name === 'A1' && KMAC_A1 != null) z.Kmac_cm_h = KMAC_A1; });
  M.outDepths_cm = Object.keys(F[site].obs).map(Number); M.profileHours = []; Object.assign(M, extra || {}); return M;
}
function initial(site, sl, i0) {       // equivalent suction at the sensors that reproduces the measured Se on the wetting curve
  const o = {};
  for (const k of Object.keys(F[site].obs)) { let th = F[site].obs[k][i0]; if (th == null) return null;
    const ly = L[site].fits.sensors[k].layer, q = sl.fits[ly], d = sl.dry[ly];
    const thL = d.theta_r + seObs(site, k, th) * (d.theta_s - d.theta_r);           // layer theta with the sensor's drying Se
    if (q.dts_macro) { o[k] = suctionOf(q, Math.max(thL, q.theta_r + CFG.SE_CLAMP[0] * (q.theta_s - q.theta_r))); continue; }
    const se = Math.min(CFG.SE_CLAMP[1], Math.max(CFG.SE_CLAMP[0], (thL - q.theta_r) / (q.theta_s - q.theta_r))), m = 1 - 1 / q.n;
    o[k] = Math.pow(Math.pow(se, -1 / m) - 1, 1 / q.n) / q.alpha; }      // kPa
  return o;
}
function score(site, sl, w, o) {       // RMSE of Se over the window, per sensor and mean; plus RMSE of log10 suction (check)
  const r = {}; let tot = 0, n = 0;
  for (const k of Object.keys(F[site].obs)) { const q = sl.dry[L[site].fits.sensors[k].layer]; let e = 0, c = 0, es = 0, cs = 0;
    for (let i = 0; i < w.i1 - w.i0 - 1; i++) { const ob = F[site].obs[k][w.i0 + 1 + i], os = F[site].obs_s[k][w.i0 + 1 + i], sim = o.theta[+k][i];
      if (ob != null) { const d = (sim - q.theta_r) / (q.theta_s - q.theta_r) - seObs(site, k, ob); e += d * d; c++; }
      if (os != null) { const ss = Math.max(0.1, -o.head_cm[+k][i] / S.CM_PER_KPA); es += (Math.log10(ss) - Math.log10(Math.max(0.1, os))) ** 2; cs++; } }
    r[k] = { rmse_Se: c ? Math.sqrt(e / c) : null, rmse_log10s: cs ? Math.sqrt(es / cs) : null }; if (c) { tot += r[k].rmse_Se; n++; } }
  r.mean = n ? tot / n : null; return r;
}
function forestInput(Pg, PE, C, tau) {   // gross rain -> interception store (capacity C, evaporates at PE) -> overflow -> linear reservoir (tau h) -> soil
  let st = 0, res = 0; const out = [];
  for (let i = 0; i < Pg.length; i++) { st += Pg[i]; const ev = Math.min(st, PE[i]); st -= ev; const over = Math.max(0, st - C); st -= over;
    if (tau > 0) { res += over; const q = res * (1 - Math.exp(-1 / tau)); res -= q; out.push(q); } else out.push(over); }
  return out;
}
function run(site, sl, w, input, extra) {
  const s0 = initial(site, sl, w.i0); if (!s0) return null;
  const cfg = S.buildConfig(model(site, sl, extra), sl.fits, s0);
  return S.run(cfg, { P_mm: input, PE_mm: F.NV.PE_mm.slice(w.i0 + 1, w.i1) });
}
module.exports = { S, L, F, EV, CFG, windows, soil, thetaOf, suctionOf, run, score, forestInput, seObs, hix };

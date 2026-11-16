// Inverse calibration of hydraulic parameters on the DRYING seasons, from in-situ theta and suction.
// Stage 1 (this script): for one site, simulate the 2025 drying window starting from the measured suction
//   profile and fit x = [log10 Ks(A1), log10 Ks(A2), eFactor, tFrac] by Nelder-Mead (3 starts).
//   Objective J = mean over sensors of [ RMSE(theta)/SIG_TH + RMSE(log10 s)/SIG_LS ].
//   Retention curves are the field drying fits (fixed); Ks(C1) stays at the laboratory value (below the sensors).
//   Validation: 2026 drying window with the same parameters.
// usage: node calib_drying.js SITE out.json
const fs = require('fs'), S = require('./solver.js');
const [,, site, fOut] = process.argv;
const CFG = { SIG_TH: 0.02, SIG_LS: 0.3, S_FLOOR_KPA: 0.1,
  windows: { calib: ['2025-04-26 12:00', '2025-08-28 12:00'], valid: ['2026-04-01 12:00', '2026-07-30 12:00'] },
  LB: [-3, -3, 0.1, 0.0], UB: [2, 2, 2.0, 1.0], maxEval: 220, tol: 1e-4 };
const F = JSON.parse(fs.readFileSync(`forcing_${site}.json`)), R = JSON.parse(fs.readFileSync(`../results_${site}.json`)), M0 = JSON.parse(fs.readFileSync(`model_${site}.json`));
const fits = {}; for (const k of Object.keys(R.depths)) fits[k] = R.depths[k].fits.drying.params;
const keys = Object.keys(F.obs), t0 = Date.parse(F.t0.replace(' ', 'T') + 'Z');
const idx = s => Math.round((Date.parse(s.replace(' ', 'T') + ':00Z') - t0) / 3.6e6);
const lab = { A1: M0.zones.find(z => z.name === 'A1').Ks_cm_h, A2: M0.zones.find(z => z.name === 'A2').Ks_cm_h };
function model(x) {
  const M = JSON.parse(JSON.stringify(M0)); M.profileHours = [];
  M.zones.forEach(z => { if (z.name === 'A1') z.Ks_cm_h = Math.pow(10, x[0]); else if (z.name === 'A2') z.Ks_cm_h = Math.pow(10, x[1]); });
  M.eFactor = x[2]; M.tFrac = x[3]; return M;
}
function runWindow(x, w) {
  const i0 = idx(w[0]), i1 = idx(w[1]);
  const s0 = {}; for (const k of keys) { s0[k] = F.obs_s[k][i0]; if (!(s0[k] > 0)) throw new Error('no initial suction at ' + k); }
  const f = { P_mm: F.P_mm.slice(i0 + 1, i1 + 1), PE_mm: F.PE_mm.slice(i0 + 1, i1 + 1) };
  const o = S.run(S.buildConfig(model(x), fits, s0), f);
  const m = {}; let J = 0;
  for (const k of keys) {
    let e = 0, n = 0, es = 0, ns = 0;
    for (let j = 0; j < f.P_mm.length; j++) {
      const ot = F.obs[k][i0 + 1 + j], os = F.obs_s[k][i0 + 1 + j];
      if (ot != null) { e += (o.theta[+k][j] - ot) ** 2; n++; }
      if (os != null) { const ss = Math.max(-o.head_cm[+k][j] / S.CM_PER_KPA, CFG.S_FLOOR_KPA); es += (Math.log10(ss) - Math.log10(Math.max(os, CFG.S_FLOOR_KPA))) ** 2; ns++; }
    }
    if (!n || !ns) throw new Error('no observations in window at ' + k);
    m[k] = { rmse_theta: Math.sqrt(e / n), rmse_log10s: Math.sqrt(es / ns) };
    J += m[k].rmse_theta / CFG.SIG_TH + m[k].rmse_log10s / CFG.SIG_LS;
  }
  return { J: J / keys.length, metrics: m, mb: o.massBalance, i0, i1, out: o };
}
const clip = x => x.map((v, j) => Math.min(CFG.UB[j], Math.max(CFG.LB[j], v)));
let nEval = 0;
const obj = x => { nEval++; return runWindow(clip(x), CFG.windows.calib).J + x.reduce((s, v, j) => s + Math.max(0, CFG.LB[j] - v) + Math.max(0, v - CFG.UB[j]), 0); };
function nm(f, x0, step) {
  const n = x0.length; let P = [x0.slice()]; for (let j = 0; j < n; j++) { const y = x0.slice(); y[j] += step[j]; P.push(y); }
  let V = P.map(f);
  while (nEval < CFG.maxEval) {
    const id = V.map((v, i) => i).sort((a, b) => V[a] - V[b]); P = id.map(i => P[i]); V = id.map(i => V[i]);
    if (V[n] - V[0] < CFG.tol) break;
    const c = Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += P[i][j] / n;
    const xr = c.map((cj, j) => 2 * cj - P[n][j]), fr = f(xr);
    if (fr < V[0]) { const xe = c.map((cj, j) => 3 * cj - 2 * P[n][j]), fe = f(xe); if (fe < fr) { P[n] = xe; V[n] = fe; } else { P[n] = xr; V[n] = fr; } }
    else if (fr < V[n - 1]) { P[n] = xr; V[n] = fr; }
    else { const xc = c.map((cj, j) => cj + 0.5 * (P[n][j] - cj)), fc = f(xc);
      if (fc < V[n]) { P[n] = xc; V[n] = fc; } else for (let i = 1; i <= n; i++) { P[i] = P[i].map((v, j) => P[0][j] + 0.5 * (v - P[0][j])); V[i] = f(P[i]); } }
  }
  const i = V.indexOf(Math.min(...V)); return { x: P[i], converged: Math.max(...V) - Math.min(...V) < CFG.tol };
}
const xLab = [Math.log10(lab.A1), Math.log10(lab.A2), M0.eFactor, M0.tFrac];
const starts = [xLab, [0.5, -0.5, 0.6, 0.3], [-1, 1, 1.0, 0.7]];
const pack = (x, w) => { const r = runWindow(x, w); return { J: r.J, metrics: r.metrics }; };
const res = [];
for (const x0 of starts) {
  nEval = 0; const r = nm(obj, x0, [0.5, 0.5, 0.2, 0.2]), x = clip(r.x);
  res.push({ start: x0, x, Ks_A1_cm_h: Math.pow(10, x[0]), Ks_A2_cm_h: Math.pow(10, x[1]), eFactor: x[2], tFrac: x[3], converged: r.converged, nEval,
    calib: pack(x, CFG.windows.calib), valid: pack(x, CFG.windows.valid) });
  console.log(site, JSON.stringify(res[res.length - 1]));
}
res.sort((a, b) => a.calib.J - b.calib.J);
const labRun = { calib: pack(xLab, CFG.windows.calib), valid: pack(xLab, CFG.windows.valid) };
// hourly series of the best run in both windows, for the dashboard
const series = {};
for (const [name, w] of Object.entries(CFG.windows)) {
  const r = runWindow(res[0].x, w); series[name] = { i0: r.i0, i1: r.i1, massBalance: r.mb, theta: {}, s_kPa: {} };
  for (const k of keys) { series[name].theta[k] = Array.from(r.out.theta[+k], v => Math.round(v * 1e4) / 1e4);
    series[name].s_kPa[k] = Array.from(r.out.head_cm[+k], h => Math.round(Math.max(-h / S.CM_PER_KPA, CFG.S_FLOOR_KPA) * 100) / 100); }
}
fs.writeFileSync(fOut, JSON.stringify({ site, config: CFG, lab_Ks_cm_h: lab, labRun, best: res[0], all: res.map(r => ({ ...r })), series }));

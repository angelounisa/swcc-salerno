// Sequential use of the drying calibration, then full-period check.
//  1. deforested plot (NV): eFactor and kmult = minimum of its drying-2025 grid (calibdry2_NV.json);
//  2. wooded plot (V): SAME soil multiplier kmult as NV (same soil layers); only eFactor is taken from the V grid
//     (minimum along the row log10_kmult = NV value);
//  3. full period (wetting included): the macropore conductivity of the topsoil A1 is scanned (Kmac_A1) on NV,
//     because the laboratory Ksat of A1 produces runoff that is not observed; the same value is applied to V.
// Outputs everything the dashboard needs, in effective saturation Se = (theta - theta_r)/(theta_s - theta_r).
// usage: node final4.js out.json
const fs = require('fs'), S = require('./solver.js');
const KMAC_A1 = [null, 1, 3, 10, 30];   // cm/h; null = laboratory value (Ksat_lab - Ks_matrix)
const r4 = a => Array.from(a, v => Math.round(v * 1e4) / 1e4);
const FITS = JSON.parse(fs.readFileSync('fits_main.json'));
const L = {}; for (const s of ['NV', 'V']) L[s] = { F: JSON.parse(fs.readFileSync(`forcing_${s}.json`)), M: JSON.parse(fs.readFileSync(`model_${s}.json`)), cd: JSON.parse(fs.readFileSync(`calibdry2_${s}.json`)), fits: FITS[s] };
// --- parameters
const nvBest = L.NV.cd.best, lk = nvBest.log10_kmult, iRow = L.V.cd.config.log10_kmult.indexOf(lk);
if (iRow < 0) throw new Error('NV kmult not on the V grid');
const rowV = L.V.cd.grid_J[iRow], jV = rowV.indexOf(Math.min(...rowV));
const par = { NV: { eFactor: nvBest.eFactor, log10_kmult: lk }, V: { eFactor: L.V.cd.config.eFactor[jV], log10_kmult: lk, J_grid: rowV[jV], free_fit_best: L.V.cd.best } };
const build = (s, kmac) => { const M = JSON.parse(JSON.stringify(L[s].M)); M.eFactor = par[s].eFactor;
  M.zones.forEach(z => { z.Ks_cm_h *= Math.pow(10, par[s].log10_kmult); if (z.name === 'A1' && kmac != null) z.Kmac_cm_h = kmac; }); return M; };
const seOf = (s, k, th) => (th - L[s].fits[k].theta_r) / (L[s].fits[k].theta_s - L[s].fits[k].theta_r);
const rmseSe = (s, o, i0, i1) => { const F = L[s].F, r = {}; let t = 0; for (const k of Object.keys(F.obs)) { let e = 0, b = 0, n = 0;
  for (let i = i0; i < i1; i++) { const v = F.obs[k][i]; if (v != null) { const d = seOf(s, k, o.theta[+k][i]) - seOf(s, k, v); e += d * d; b += d; n++; } }
  r[k] = { rmse: Math.sqrt(e / n), bias: b / n }; t += r[k].rmse; } r.mean = t / Object.keys(F.obs).length; return r; };
// --- full-period scan of the topsoil macropore conductivity
const scan = { NV: [], V: [] };
for (const kmac of KMAC_A1) for (const s of ['NV', 'V']) { const M = build(s, kmac); M.profileHours = [];
  const o = S.run(S.buildConfig(M, L[s].fits, L[s].F.s0_kPa), L[s].F);
  scan[s].push({ Kmac_A1_cm_h: M.zones[0].Kmac_cm_h, rmse_Se_mean: rmseSe(s, o, 0, L[s].F.n_hours).mean, runoff_mm: o.massBalance.runoff_mm });
  console.log(s, 'Kmac_A1', M.zones[0].Kmac_cm_h.toFixed(2), 'RMSE Se', scan[s][scan[s].length - 1].rmse_Se_mean.toFixed(4), 'runoff', o.massBalance.runoff_mm.toFixed(0)); }
// the error barely changes with Kmac_A1, so it cannot choose; the field observation that runoff is negligible can:
// smallest scanned Kmac_A1 giving runoff <= RUNOFF_MAX_FRAC of the rain on the deforested plot
const RUNOFF_MAX_FRAC = 0.02, PgNV = L.NV.F.totals.P_gross_mm;
const iK = scan.NV.findIndex(c => c.runoff_mm <= RUNOFF_MAX_FRAC * PgNV); if (iK < 0) throw new Error('no Kmac_A1 meets the runoff criterion');
const kmacBest = KMAC_A1[iK];
// --- final runs
const out = { sites: {}, kmacScan: scan, kmacChosenIndex: iK, kmacCriterion: { runoff_max_fraction: RUNOFF_MAX_FRAC }, params: par };
for (const s of ['NV', 'V']) {
  const { F, cd, fits } = L[s], M = build(s, kmacBest), keys = Object.keys(F.obs);
  const o = S.run(S.buildConfig(M, fits, F.s0_kPa), F);
  const t0 = Date.parse(F.t0.replace(' ', 'T') + 'Z'), ix = q => Math.round((Date.parse(q.replace(' ', 'T') + ':00Z') - t0) / 3.6e6);
  const series = {}, dry = {};
  for (const [name, w] of Object.entries(cd.config.windows)) {
    const i0 = ix(w[0]), i1 = ix(w[1]), s0 = {}; for (const k of keys) s0[k] = F.obs_s[k][i0];
    const Mw = build(s, kmacBest); Mw.profileHours = [];
    const ow = S.run(S.buildConfig(Mw, fits, s0), { P_mm: F.P_mm.slice(i0 + 1, i1 + 1), PE_mm: F.PE_mm.slice(i0 + 1, i1 + 1) });
    series[name] = { i0, i1, massBalance: ow.massBalance, Se: {}, s_kPa: {} }; dry[name] = {};
    for (const k of keys) { series[name].Se[k] = r4(Array.from(ow.theta[+k], v => seOf(s, k, v)));
      series[name].s_kPa[k] = Array.from(ow.head_cm[+k], h => Math.round(Math.max(-h / S.CM_PER_KPA, cd.config.S_FLOOR_KPA) * 100) / 100);
      let e = 0, n = 0, es = 0, ns = 0; for (let j = 0; j < i1 - i0; j++) { const ot = F.obs[k][i0 + 1 + j], os = F.obs_s[k][i0 + 1 + j];
        if (ot != null) { e += (seOf(s, k, ow.theta[+k][j]) - seOf(s, k, ot)) ** 2; n++; }
        if (os != null) { es += (Math.log10(series[name].s_kPa[k][j]) - Math.log10(Math.max(os, cd.config.S_FLOOR_KPA))) ** 2; ns++; } }
      dry[name][k] = { rmse_Se: Math.sqrt(e / n), rmse_log10s: Math.sqrt(es / ns) }; }
  }
  const prof = {}; for (const [hr, p] of Object.entries(o.profiles)) {
    const zoneKey = z => { const zn = M.zones.find(q => z >= q.zTop_cm && z < q.zBot_cm) || M.zones[M.zones.length - 1]; return zn.ret; };
    prof[hr] = { Se: r4(p.theta.map((v, i) => seOf(s, zoneKey(o.z_cm[i]), v))), s_kPa: p.h_cm.map(h => h < 0 ? Math.round(-h / S.CM_PER_KPA * 100) / 100 : 0),
      obs: Object.fromEntries(keys.map(k => [k, { Se: F.obs[k][+hr] == null ? null : Math.round(seOf(s, k, F.obs[k][+hr]) * 1e4) / 1e4, s: F.obs_s[k][+hr] }])) }; }
  const full = rmseSe(s, o, 0, F.n_hours);
  out.sites[s] = { model: M, fits, s0_kPa: F.s0_kPa, t_init: F.t_init, forcing: { totals: F.totals, air_temperature: F.air_temperature, interception_capacity_mm: F.config.interception_capacity_mm },
    calib: { config: cd.config, grid_J: cd.grid_J, free_best: cd.best, chosen: par[s], prior: cd.prior, own_curves_at_best: cd.own_curves_at_best, dry, series, full },
    Se: Object.fromEntries(keys.map(k => [k, r4(Array.from(o.theta[+k], v => seOf(s, k, v)))])),
    obsSe: Object.fromEntries(keys.map(k => [k, F.obs[k].map(v => v == null ? null : Math.round(seOf(s, k, v) * 1e4) / 1e4)])), obs_s: F.obs_s,
    z_cm: o.z_cm, profiles: prof, massBalance: o.massBalance };
  if (!out.t0) { out.t0 = F.t0; out.n_hours = F.n_hours; out.rain_missing = F.rain_missing;
    out.P_daily = (() => { const d = {}; for (let i = 0; i < F.n_hours; i++) { const k = new Date(t0 + i * 3.6e6).toISOString().slice(0, 10); d[k] = (d[k] || 0) + F.P_gross_mm[i]; } return d; })(); }
  console.log(s, 'chosen', JSON.stringify(par[s]), 'dry', JSON.stringify(Object.fromEntries(Object.entries(dry).map(([w, m]) => [w, Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [+v.rmse_Se.toFixed(3), +v.rmse_log10s.toFixed(2)]]))]))), 'full', full.mean.toFixed(3), JSON.stringify(Object.fromEntries(Object.entries(o.massBalance).map(([k, v]) => [k, +v.toFixed(1)]))));
}
fs.writeFileSync(process.argv[2], JSON.stringify(out));

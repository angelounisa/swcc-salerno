// Drying-season calibration with the main-curve Se retention (fits_main.json), matrix K from night drainage
// (model_SITE.json) and vegetation parameters from the ALERT 2025 slides. Only two factors are free:
//   eFactor = multiplier of the potential evapotranspiration, kmult = multiplier of the matrix Ks (all layers).
// Full grid (no optimiser) -> the J surface shows how well each factor is identified.
// J = mean over sensors of [ RMSE(Se)/SIG_SE + RMSE(log10 s)/SIG_LS ]  on the 2025 drying window; 2026 = validation.
// usage: node calib_dry2.js SITE out.json
const fs = require('fs'), S = require('./solver.js');
const [,, site, fOut] = process.argv;
const CFG = { SIG_SE: 0.1, SIG_LS: 0.3, S_FLOOR_KPA: 0.1,
  windows: { calib: ['2025-04-26 12:00', '2025-08-28 12:00'], valid: ['2026-04-01 12:00', '2026-07-30 12:00'] },
  eFactor: [0.2, 0.35, 0.5, 0.65, 0.8, 0.95, 1.1, 1.25, 1.4, 1.55, 1.7, 1.85, 2.0],
  log10_kmult: [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1, 1.25, 1.5] };
const F = JSON.parse(fs.readFileSync(`forcing_${site}.json`)), M0 = JSON.parse(fs.readFileSync(`model_${site}.json`)), FITS = JSON.parse(fs.readFileSync('fits_main.json'));
const keys = Object.keys(F.obs), t0 = Date.parse(F.t0.replace(' ', 'T') + 'Z');
const idx = s => Math.round((Date.parse(s.replace(' ', 'T') + ':00Z') - t0) / 3.6e6);
function runWindow(eF, lk, w, fits) {
  const M = JSON.parse(JSON.stringify(M0)); M.profileHours = []; M.eFactor = eF; M.zones.forEach(z => { z.Ks_cm_h *= Math.pow(10, lk); });
  const i0 = idx(w[0]), i1 = idx(w[1]); const s0 = {}; for (const k of keys) { s0[k] = F.obs_s[k][i0]; if (!(s0[k] > 0)) throw new Error('no initial suction ' + k); }
  const f = { P_mm: F.P_mm.slice(i0 + 1, i1 + 1), PE_mm: F.PE_mm.slice(i0 + 1, i1 + 1) };
  const o = S.run(S.buildConfig(M, fits, s0), f); const m = {}; let J = 0;
  for (const k of keys) { const p = fits[k], rng = p.theta_s - p.theta_r; let e = 0, n = 0, es = 0, ns = 0;
    for (let j = 0; j < f.P_mm.length; j++) { const ot = F.obs[k][i0 + 1 + j], os = F.obs_s[k][i0 + 1 + j];
      if (ot != null) { e += ((o.theta[+k][j] - ot) / rng) ** 2; n++; }
      if (os != null) { const ss = Math.max(-o.head_cm[+k][j] / S.CM_PER_KPA, CFG.S_FLOOR_KPA); es += (Math.log10(ss) - Math.log10(Math.max(os, CFG.S_FLOOR_KPA))) ** 2; ns++; } }
    if (!n || !ns) throw new Error('no observations ' + k);
    m[k] = { rmse_Se: Math.sqrt(e / n), rmse_log10s: Math.sqrt(es / ns) }; J += m[k].rmse_Se / CFG.SIG_SE + m[k].rmse_log10s / CFG.SIG_LS; }
  return { J: J / keys.length, metrics: m, mb: o.massBalance };
}
const grid = []; let best = null;
for (const lk of CFG.log10_kmult) { const row = [];
  for (const eF of CFG.eFactor) { const r = runWindow(eF, lk, CFG.windows.calib, FITS[site]); row.push(+r.J.toFixed(4)); if (!best || r.J < best.J) best = { J: r.J, eFactor: eF, log10_kmult: lk }; }
  grid.push(row); console.log(site, 'log10 kmult', lk, row.join(' ')); }
const onEdge = best.eFactor === CFG.eFactor[0] || best.eFactor === CFG.eFactor[CFG.eFactor.length - 1] || best.log10_kmult === CFG.log10_kmult[0] || best.log10_kmult === CFG.log10_kmult[CFG.log10_kmult.length - 1];
const pack = (w, fits, eF, lk) => { const r = runWindow(eF, lk, w, fits); return { J: r.J, metrics: r.metrics, massBalance: r.mb }; };
const out = { site, config: CFG, grid_J: grid, best: Object.assign(best, { kmult: Math.pow(10, best.log10_kmult), on_grid_edge: onEdge }),
  calib: pack(CFG.windows.calib, FITS[site], best.eFactor, best.log10_kmult), valid: pack(CFG.windows.valid, FITS[site], best.eFactor, best.log10_kmult),
  prior: { calib: pack(CFG.windows.calib, FITS[site], 1.0, 0), valid: pack(CFG.windows.valid, FITS[site], 1.0, 0) },      // no calibration at all
  own_curves_at_best: { calib: pack(CFG.windows.calib, FITS[site + '_own'], best.eFactor, best.log10_kmult), valid: pack(CFG.windows.valid, FITS[site + '_own'], best.eFactor, best.log10_kmult) } };
fs.writeFileSync(fOut, JSON.stringify(out));
console.log(site, 'best', JSON.stringify(out.best), 'Jc', out.calib.J.toFixed(3), 'Jv', out.valid.J.toFixed(3), 'prior Jc', out.prior.calib.J.toFixed(3), 'Jv', out.prior.valid.J.toFixed(3), 'own Jc', out.own_curves_at_best.calib.J.toFixed(3));

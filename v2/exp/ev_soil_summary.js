// Summary of the wetting-soil calibration (step 1) for the dashboard: all grid points evaluated (unimodal theta_s_w
// variant and bimodal variant), persistence baseline, per-sensor errors at the chosen point.
// usage: node ev_soil_summary.js out.json
const fs = require('fs'), { F, windows, seObs } = require('./ev_common.js');
const rd = f => JSON.parse(fs.readFileSync(f));
const uni = ['ev_soil_a.json', 'ev_soil_b.json'].flatMap(f => rd(f).res);   // v2 grids
const bi = ['ev_bi_1.json', 'ev_bi_2.json'].flatMap(f => rd(f).res);
const SB = rd('ev_soil_final.json').best, key = r => [r.g, r.fA, r.log10K].join('/');
const seen = new Map(); for (const r of uni) if (!seen.has(key(r))) seen.set(key(r), r);
const rows = [...seen.values()];
const best = rows.find(r => r.g === SB.g && r.fA === SB.fA && r.log10K === SB.log10K); if (!best) throw new Error('chosen point not in the grids');
const per = {}; for (const k of ['15', '30', '60']) { const v = best.events.filter(e => e && e.score[k].rmse_Se != null);
  per[k] = { rmse_Se: v.reduce((a, e) => a + e.score[k].rmse_Se, 0) / v.length, rmse_log10s: v.filter(e => e.score[k].rmse_log10s != null).reduce((a, e) => a + e.score[k].rmse_log10s, 0) / v.length }; }
// persistence: Se kept at its value at the start of the window
const W = windows(), pers = { 15: [], 30: [], 60: [] };
for (const w of W) for (const k of [15, 30, 60]) { const x0 = F.NV.obs[k][w.i0]; if (x0 == null) continue; const s0 = seObs('NV', k, x0); let e = 0, c = 0;
  for (let i = w.i0 + 1; i < w.i1; i++) { const x = F.NV.obs[k][i]; if (x != null) { e += (seObs('NV', k, x) - s0) ** 2; c++; } } if (c) pers[k].push(Math.sqrt(e / c)); }
const pm = k => pers[k].reduce((a, b) => a + b, 0) / pers[k].length;
// share of event hours with Se above 1 on the drying scale (why theta_s_w is needed)
const above = {}; for (const k of [15, 30, 60]) { let a = 0, n = 0; for (const w of W) for (let i = w.i0; i < w.i1; i++) { const x = F.NV.obs[k][i]; if (x != null) { n++; if (seObs('NV', k, x) > 1) a++; } } above[k] = a / n; }
const out = { chosen: SB, n_events: W.length, grid: rows.map(r => ({ g: r.g, fA: r.fA, log10K: r.log10K, J: r.J })), bimodal: bi.map(r => ({ fA: r.fA, alpha2: r.alpha2, log10K: r.log10K, J: r.J })),
  bimodal_gM: rd('ev_bi_1.json').gM, perSensor: per, persistence: { 15: pm(15), 30: pm(30), 60: pm(60), J: (pm(15) + pm(30) + pm(60)) / 3 }, aboveThetaS: above,
  unimodal_g1: rows.filter(r => r.g === 1).reduce((a, b) => b.J < a.J ? b : a, { J: Infinity }) };
out.unimodal_g1 = { fA: out.unimodal_g1.fA, log10K: out.unimodal_g1.log10K, J: out.unimodal_g1.J };
fs.writeFileSync(process.argv[2], JSON.stringify(out)); console.log(JSON.stringify({ per, pers: out.persistence, above, g1: out.unimodal_g1, nrows: rows.length }));

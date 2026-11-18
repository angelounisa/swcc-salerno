// Step 1: soil in wetting from the clear-cut plot, where the input is the measured rain.
// Grid over fA (alpha_wetting / alpha_drying) and log10K (K multiplier on top of the drying calibration).
// Global optimum = minimum of the mean over events of the RMSE of Se; per-event optima reported for variability.
// usage: node ev_soil.js out.json
const fs = require('fs'), { F, windows, soil, run, score } = require('./ev_common.js');
const G = process.argv[3] ? JSON.parse(process.argv[3]) : { g: [1, 1.25, 1.5, 2], fA: [1, 2, 4], log10K: [-2, -1.5, -1, -0.5, 0] }, W = windows(), res = [];
const t = Date.now();
for (const g of G.g) for (const fA of G.fA) for (const lk of G.log10K) { const sl = soil(fA, lk, g), row = { g, fA, log10K: lk, events: [] };
  for (const w of W) { const o = run('NV', sl, w, F.NV.P_gross_mm.slice(w.i0 + 1, w.i1)); row.events.push(o ? { j: w.j, score: score('NV', sl, w, o), runoff_mm: o.massBalance.runoff_mm, massErr_mm: o.massBalance.error_mm } : null); }
  const v = row.events.filter(x => x && x.score.mean != null).map(x => x.score.mean); row.J = v.reduce((a, b) => a + b, 0) / v.length; row.n = v.length;
  res.push(row); console.log('g', g, 'fA', fA, 'log10K', lk, 'J', row.J.toFixed(4), ((Date.now() - t) / 1000).toFixed(0) + 's'); }
const best = res.reduce((a, b) => b.J < a.J ? b : a);
const perEvent = W.map((w, i) => { const c = res.map(r => ({ g: r.g, fA: r.fA, log10K: r.log10K, J: r.events[i] && r.events[i].score.mean })).filter(x => x.J != null);
  return { j: w.j, start: w.e.start, P_mm: w.e.P_mm, best: c.reduce((a, b) => b.J < a.J ? b : a), J_at_global: res.find(r => r === best).events[i].score }; });
fs.writeFileSync(process.argv[2], JSON.stringify({ grid: G, windows: W.map(w => ({ j: w.j, start: w.e.start, end: w.e.end, P_mm: w.e.P_mm, i0: w.i0, i1: w.i1 })), res, best: { g: best.g, fA: best.fA, log10K: best.log10K, J: best.J }, perEvent }));
console.log('best', best.g, best.fA, best.log10K, best.J);

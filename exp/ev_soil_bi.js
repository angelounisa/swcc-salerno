// Step 1b: bimodal soil in wetting (matrix = drying curve with alpha_w = fA alpha_d; macropore domain of capacity
// gM (drying-Se units, fixed from the data: 99.9th percentile of event-hour Se_d minus 1, per layer) with air entry 1/alpha2).
// Grid over fA, alpha2, log10K; same objective as ev_soil.js (mean over events of mean RMSE of Se_d at the 3 sensors).
// usage: node ev_soil_bi.js out.json '<grid json>'
const fs = require('fs'), { F, windows, soil, run, score, seObs } = require('./ev_common.js');
const G = JSON.parse(process.argv[3]), W = windows(), res = [];
if (!(G.n2 > 1 && G.fA && G.alpha2 && G.log10K)) throw new Error('grid needs n2, fA, alpha2, log10K');
// macropore capacity from the data: per layer, the 99.9th percentile of Se_d in event windows at its shallowest sensor
const q999 = k => { const v = []; for (const w of W) for (let i = w.i0; i < w.i1; i++) { const x = F.NV.obs[k][i]; if (x != null) v.push(seObs('NV', k, x)); }
  v.sort((a, b) => a - b); return v[Math.floor(0.999 * v.length)]; };
const gM = { A1: q999(15) - 1, A2: q999(30) - 1 };
console.log('gM', gM);
const t = Date.now();
for (const fA of G.fA) for (const a2 of G.alpha2) for (const lk of G.log10K) {
  const mac = { gM, alpha2: a2, n2: G.n2 }, sl = soil(fA, lk, 1, mac), row = { fA, alpha2: a2, log10K: lk, events: [] };
  for (const w of W) { const o = run('NV', sl, w, F.NV.P_gross_mm.slice(w.i0 + 1, w.i1)); row.events.push(o ? { j: w.j, score: score('NV', sl, w, o), runoff_mm: o.massBalance.runoff_mm, massErr_mm: o.massBalance.error_mm } : null); }
  const v = row.events.filter(x => x && x.score.mean != null).map(x => x.score.mean); row.J = v.reduce((a, b) => a + b, 0) / v.length; row.n = v.length;
  res.push(row); console.log('fA', fA, 'alpha2', a2, 'log10K', lk, 'J', row.J.toFixed(4), ((Date.now() - t) / 1000).toFixed(0) + 's'); }
const best = res.reduce((a, b) => b.J < a.J ? b : a);
fs.writeFileSync(process.argv[2], JSON.stringify({ grid: G, gM, res, best: { fA: best.fA, alpha2: best.alpha2, log10K: best.log10K, n2: G.n2, gM, J: best.J } }));
console.log('best', best.fA, best.alpha2, best.log10K, best.J);

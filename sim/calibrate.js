// Calibrate Ks (3 layers) and the evaporation factor with Nelder-Mead on the calibration period,
// then report RMSE on the validation period. Same solver.js as the dashboard.
// usage: node calibrate.js forcing.json results_NV.json model_defaults.json calib_end(YYYY-MM-DD) out.json
const fs = require('fs'), S = require('./solver.js');
const [,, fF, fR, fM, calibEnd, fOut] = process.argv;
const F = JSON.parse(fs.readFileSync(fF)), R = JSON.parse(fs.readFileSync(fR)), M0 = JSON.parse(fs.readFileSync(fM));
const fits = {}; for (const k of M0.layerDepthKeys) fits[k] = R.depths[k].fits.drying.params;
const s0 = {}; for (const k of M0.layerDepthKeys) s0[k] = F.s0_kPa[k];
const t0 = Date.parse(F.t0.replace(' ', 'T') + 'Z');
const iCal = Math.round((Date.parse(calibEnd + 'T00:00:00Z') - t0) / 3.6e6); // first validation hour
if (!(iCal > 0 && iCal < F.n_hours)) throw new Error('calibration end outside period');

// parameter vector x = [log10 Ks1, log10 Ks2, log10 Ks3, eFactor]; bounds enforced by penalty-free clipping
const LB = [-3, -3, -3, 0.2], UB = [2, 2, 2, 1.5];
const clip = x => x.map((v, j) => Math.min(UB[j], Math.max(LB[j], v)));
function simulate(x) {
  const M = Object.assign({}, M0, { Ks_cm_h: x.slice(0, 3).map(v => Math.pow(10, v)), eFactor: x[3] });
  return S.run(S.buildConfig(M, fits, s0), F);
}
function rmse(out, i0, i1) {
  const r = {}; let tot = 0;
  for (const k of M0.layerDepthKeys) {
    let e = 0, n = 0;
    for (let i = i0; i < i1; i++) { const o = F.obs[k][i]; if (o != null) { e += (out.theta[+k][i] - o) ** 2; n++; } }
    if (n === 0) throw new Error('no observations at ' + k);
    r[k] = Math.sqrt(e / n); tot += r[k];
  }
  r.mean = tot / M0.layerDepthKeys.length; return r;
}
let nEval = 0;
function obj(x) {
  nEval++;
  let out;
  try { out = simulate(clip(x)); }
  catch (err) { console.log('eval failed', clip(x), err.message); return 1e3; } // a failed run is not a candidate; logged, never used as result
  const v = rmse(out, 0, iCal).mean;
  // out-of-bounds proposals are penalised by their distance to the box
  const pen = x.reduce((s, v, j) => s + Math.max(0, LB[j] - v) + Math.max(0, v - UB[j]), 0);
  return v + pen;
}
function nelderMead(f, x0, step, maxEval, tol) {
  const n = x0.length; let P = [x0.slice()];
  for (let j = 0; j < n; j++) { const y = x0.slice(); y[j] += step[j]; P.push(y); }
  let V = P.map(f);
  while (nEval < maxEval) {
    const idx = V.map((v, i) => i).sort((a, b) => V[a] - V[b]); P = idx.map(i => P[i]); V = idx.map(i => V[i]);
    if (V[n] - V[0] < tol) break;
    const c = Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += P[i][j] / n;
    const xr = c.map((cj, j) => cj + (cj - P[n][j])), fr = f(xr);
    if (fr < V[0]) { const xe = c.map((cj, j) => cj + 2 * (cj - P[n][j])), fe = f(xe); if (fe < fr) { P[n] = xe; V[n] = fe; } else { P[n] = xr; V[n] = fr; } }
    else if (fr < V[n - 1]) { P[n] = xr; V[n] = fr; }
    else {
      const xc = c.map((cj, j) => cj + 0.5 * (P[n][j] - cj)), fc = f(xc);
      if (fc < V[n]) { P[n] = xc; V[n] = fc; }
      else { for (let i = 1; i <= n; i++) { P[i] = P[i].map((v, j) => P[0][j] + 0.5 * (v - P[0][j])); V[i] = f(P[i]); } }
    }
    if (nEval % 20 < 2) console.log('eval', nEval, 'best', V[0].toFixed(5), P[0].map(v => v.toFixed(3)).join(' '));
  }
  const i = V.indexOf(Math.min(...V)); return { x: P[i], f: V[i] };
}
const ALLSTARTS = [[0, -0.3, -0.3, 0.8], [1, 0.5, 0, 0.5], [-1, -1, -1, 1.0]];
const starts = process.argv[7] !== undefined ? [ALLSTARTS[+process.argv[7]]] : ALLSTARTS;
const results = [];
for (const x0 of starts) {
  nEval = 0;
  const r = nelderMead(obj, x0, [0.5, 0.5, 0.5, 0.2], 250, 1e-5);
  const xb = clip(r.x), out = simulate(xb);
  results.push({ start: x0, x: xb, Ks_cm_h: xb.slice(0, 3).map(v => Math.pow(10, v)), eFactor: xb[3],
    calib: rmse(out, 0, iCal), valid: rmse(out, iCal, F.n_hours), massBalance: out.massBalance, nEval });
  console.log('start', x0, '->', JSON.stringify(results[results.length - 1]));
}
results.sort((a, b) => a.calib.mean - b.calib.mean);
fs.writeFileSync(fOut, JSON.stringify({ calibEnd, iCal, best: results[0], all: results }, null, 1));

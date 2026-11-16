// Calibrate eFactor (PET multiplier) and tFrac (transpiration share of PET) for one site, Ks fixed from lab tests.
// Calibration: hours before calibEnd; validation: after. Same solver.js as the dashboard.
// usage: node calibrate2.js SITE calibEnd(YYYY-MM-DD) out.json
const fs = require('fs'), S = require('./solver.js');
const [,, site, calibEnd, fOut] = process.argv;
const F = JSON.parse(fs.readFileSync(`forcing_${site}.json`)), R = JSON.parse(fs.readFileSync(`../results_${site}.json`)), M0 = JSON.parse(fs.readFileSync(`model_${site}.json`));
const fits = {}; for (const k of Object.keys(R.depths)) fits[k] = R.depths[k].fits.drying.params;
const keys = Object.keys(F.obs);
const t0 = Date.parse(F.t0.replace(' ', 'T') + 'Z');
const iCal = Math.round((Date.parse(calibEnd + 'T00:00:00Z') - t0) / 3.6e6);
if (!(iCal > 0 && iCal < F.n_hours)) throw new Error('calibration end outside period');
const LB = [0.2, 0.0], UB = [2.0, 1.0];
const clip = x => x.map((v, j) => Math.min(UB[j], Math.max(LB[j], v)));
const sim = x => S.run(S.buildConfig(Object.assign({}, M0, { eFactor: x[0], tFrac: x[1] }), fits, F.s0_kPa), F);
function rmse(o, i0, i1) { const r = {}; let t = 0; for (const k of keys) { let e = 0, n = 0;
  for (let i = i0; i < i1; i++) { const v = F.obs[k][i]; if (v != null) { e += (o.theta[+k][i] - v) ** 2; n++; } }
  if (!n) throw new Error('no obs ' + k); r[k] = Math.sqrt(e / n); t += r[k]; } r.mean = t / keys.length; return r; }
let nEval = 0;
const obj = x => { nEval++; const xc = clip(x); const v = rmse(sim(xc), 0, iCal).mean;
  return v + x.reduce((s, v, j) => s + Math.max(0, LB[j] - v) + Math.max(0, v - UB[j]), 0); };
function nm(f, x0, step, maxEval, tol) {
  const n = x0.length; let P = [x0.slice()]; for (let j = 0; j < n; j++) { const y = x0.slice(); y[j] += step[j]; P.push(y); }
  let V = P.map(f);
  while (nEval < maxEval) {
    const idx = V.map((v, i) => i).sort((a, b) => V[a] - V[b]); P = idx.map(i => P[i]); V = idx.map(i => V[i]);
    if (V[n] - V[0] < tol) break;
    const c = Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += P[i][j] / n;
    const xr = c.map((cj, j) => 2 * cj - P[n][j]), fr = f(xr);
    if (fr < V[0]) { const xe = c.map((cj, j) => 3 * cj - 2 * P[n][j]), fe = f(xe); if (fe < fr) { P[n] = xe; V[n] = fe; } else { P[n] = xr; V[n] = fr; } }
    else if (fr < V[n - 1]) { P[n] = xr; V[n] = fr; }
    else { const xc = c.map((cj, j) => cj + 0.5 * (P[n][j] - cj)), fc = f(xc);
      if (fc < V[n]) { P[n] = xc; V[n] = fc; } else for (let i = 1; i <= n; i++) { P[i] = P[i].map((v, j) => P[0][j] + 0.5 * (v - P[0][j])); V[i] = f(P[i]); } }
  }
  const i = V.indexOf(Math.min(...V)); return { x: P[i], f: V[i], converged: V[n] - V[0] < tol };
}
const res = [];
for (const x0 of [[1.0, 0.5], [0.6, 0.2]]) {
  nEval = 0; const r = nm(obj, x0, [0.3, 0.25], 80, 1e-5), x = clip(r.x), o = sim(x);
  res.push({ start: x0, eFactor: x[0], tFrac: x[1], converged: r.converged, nEval, calib: rmse(o, 0, iCal), valid: rmse(o, iCal, F.n_hours), massBalance: o.massBalance });
  console.log(site, JSON.stringify(res[res.length - 1]));
}
res.sort((a, b) => a.calib.mean - b.calib.mean);
fs.writeFileSync(fOut, JSON.stringify({ site, calibEnd, iCal, calibrated: ['eFactor', 'tFrac'], bounds: { lower: LB, upper: UB }, best: res[0], all: res }, null, 1));

// Experiment 1: which forest factor explains the wetter state of the clear-cut plot in the wet season?
// Full factorial over the five factors (32 runs) on the wet season 1 Oct 2025 - 30 Apr 2026, real hourly forcing.
// Contribution of each factor = Shapley value (average marginal effect over all orders, interactions shared fairly).
// usage: node attribution.js out.json
const fs = require('fs'), { S, L, FACTORS, column, idx } = require('./common.js');
const CFG = { start: '2025-10-01 00:00:00', end: '2026-04-30 23:00:00', s_crit_kPa: 10, chi_s_crit_kPa: 0.5, outDepths_cm: [15, 30, 35, 60, 100, 140] };
const F = { NV: L.NV.F, V: L.V.F }; if (F.NV.t0 !== F.V.t0) throw new Error('forcing t0 differ');
const i0 = idx(F.NV, CFG.start), i1 = idx(F.NV, CFG.end) + 1; if (!(i0 > 0 && i1 <= F.NV.n_hours)) throw new Error('window outside forcing');
const s0 = s => { const o = {}; for (const k of Object.keys(F[s].obs_s)) { const v = F[s].obs_s[k][i0]; if (!(v > 0)) throw new Error('no initial suction ' + s + k); o[k] = v; } return o; };
const s0NV = s0('NV'), s0V = s0('V');
const lay = z => z < 20 ? L.NV.fits.A1 : L.NV.fits.A2;
const keys = Object.keys(FACTORS), runs = {};
const t = Date.now();
for (let m = 0; m < 32; m++) {
  const on = keys.filter((k, j) => m & (1 << j)), cfg = column(on, s0NV, s0V, CFG.outDepths_cm);
  const forc = { P_mm: (on.includes('I') ? F.V : F.NV).P_mm.slice(i0, i1), PE_mm: F.NV.PE_mm.slice(i0, i1) };
  const o = S.run(cfg, forc), met = {};
  for (const d of CFG.outDepths_cm) {
    const h = o.head_cm[d], th = o.theta[d], q = lay(d); let nb = 0, nc = 0, smin = Infinity;
    for (let i = 0; i < h.length; i++) { const s = Math.max(0, -h[i] / S.CM_PER_KPA), se = (th[i] - q.theta_r) / (q.theta_s - q.theta_r);
      if (s < CFG.s_crit_kPa) nb++; if (se * s < CFG.chi_s_crit_kPa) nc++; smin = Math.min(smin, s); }
    met[d] = { frac_below_s_crit: nb / h.length, frac_chi_s_below: nc / h.length, s_min_kPa: smin };
  }
  runs[on.join('') || '0'] = { on, metrics: met, massBalance: o.massBalance };
  console.log(on.join('') || '0', 'massErr', o.massBalance.error_mm.toFixed(3), CFG.outDepths_cm.map(d => (met[d].frac_below_s_crit * 100).toFixed(1)).join(' '), ((Date.now() - t) / 1000).toFixed(0) + 's');
}
// Shapley values
const fact = n => n <= 1 ? 1 : n * fact(n - 1), n = keys.length;
const key = arr => keys.filter(k => arr.includes(k)).join('') || '0';
const val = (set, d, m) => runs[key(set)].metrics[d][m];
const shapley = {};
for (const m of ['frac_below_s_crit', 'frac_chi_s_below']) { shapley[m] = {};
  for (const d of CFG.outDepths_cm) { shapley[m][d] = {};
    for (const i of keys) { let phi = 0; const others = keys.filter(k => k !== i);
      for (let b = 0; b < (1 << others.length); b++) { const Sset = others.filter((k, j) => b & (1 << j));
        phi += fact(Sset.length) * fact(n - Sset.length - 1) / fact(n) * (val([...Sset, i], d, m) - val(Sset, d, m)); }
      shapley[m][d][i] = phi; }
    const tot = val(keys, d, m) - val([], d, m), sum = Object.values(shapley[m][d]).reduce((a, b) => a + b, 0);
    if (Math.abs(tot - sum) > 1e-9) throw new Error('Shapley values do not add up');
  } }
// observed counterpart (same window, measured suction)
const obs = {}; for (const s of ['NV', 'V']) { obs[s] = {}; for (const k of Object.keys(F[s].obs_s)) { const v = F[s].obs_s[k].slice(i0, i1).filter(x => x != null);
  obs[s][k] = { frac_below_s_crit: v.filter(x => x < CFG.s_crit_kPa).length / v.length, n: v.length }; } }
fs.writeFileSync(process.argv[2], JSON.stringify({ config: CFG, factors: FACTORS, s0: { NV: s0NV, V: s0V }, rain_mm: { gross: F.NV.P_mm.slice(i0, i1).reduce((a, b) => a + b, 0), net_forest: F.V.P_mm.slice(i0, i1).reduce((a, b) => a + b, 0) },
  runs, shapley, observed: obs }));

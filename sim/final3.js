// Stage 2: full-period runs with the hydraulic parameters calibrated on the drying seasons (calibdry_SITE.json).
// For the wooded plot the constant throughfall fraction tau is then chosen on the FULL period (grid search on the
// mean RMSE of theta), all other parameters fixed; tau = 1 for the deforested plot.
// Writes everything the dashboard needs.   usage: node final3.js out.json
const fs = require('fs'), S = require('./solver.js');
const r4 = a => Array.from(a, v => Math.round(v * 1e4) / 1e4);
const out = { sites: {} };
for (const site of ['NV', 'V']) {
  const F = JSON.parse(fs.readFileSync(`forcing_${site}.json`)), R = JSON.parse(fs.readFileSync(`../results_${site}.json`)), M = JSON.parse(fs.readFileSync(`model_${site}.json`));
  const cd = JSON.parse(fs.readFileSync(`calibdry_${site}.json`));
  const fits = {}; for (const k of Object.keys(R.depths)) fits[k] = R.depths[k].fits.drying.params;
  const rmseAll = o => { let t = 0; const ks = Object.keys(F.obs); for (const k of ks) { let e = 0, n = 0; F.obs[k].forEach((v, i) => { if (v != null) { e += (o.theta[+k][i] - v) ** 2; n++; } }); t += Math.sqrt(e / n); } return t / ks.length; };
  const withPars = (c, tau) => { const Mt = JSON.parse(JSON.stringify(M)); Mt.zones.forEach(z => { if (z.name === 'A1') z.Ks_cm_h = c.Ks_A1_cm_h; else if (z.name === 'A2') z.Ks_cm_h = c.Ks_A2_cm_h; });
    Mt.eFactor = c.eFactor; Mt.tFrac = c.tFrac; Mt.throughfall = tau; return Mt; };
  // every parameter set found on the drying season (they fit it about equally well) is tested on the full period;
  // the set with the lowest full-period RMSE of theta is used. For V, tau is scanned for each set.
  const taus = site === 'V' ? [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0] : [1.0];
  const cands = cd.all.map(c => {
    let best = null; const scan = [];
    for (const tau of taus) { const Mt = withPars(c, tau); Mt.profileHours = []; const o = S.run(S.buildConfig(Mt, fits, F.s0_kPa), F), r = rmseAll(o); scan.push([tau, r]);
      if (!best || r < best.rmse) best = { tau, rmse: r, mb: o.massBalance }; }
    console.log(site, 'cand', c.Ks_A1_cm_h.toPrecision(3), c.Ks_A2_cm_h.toPrecision(3), c.eFactor.toFixed(2), c.tFrac.toFixed(2), 'full rmse', best.rmse.toFixed(4), 'tau', best.tau);
    return { Ks_A1_cm_h: c.Ks_A1_cm_h, Ks_A2_cm_h: c.Ks_A2_cm_h, eFactor: c.eFactor, tFrac: c.tFrac, converged: c.converged, J_calib: c.calib.J, J_valid: c.valid.J,
      dry_metrics: { calib: c.calib.metrics, valid: c.valid.metrics }, full_rmse: best.rmse, tau: best.tau, tauScan: scan, full_massBalance: best.mb };
  });
  const iBest = cands.reduce((a, c, i) => c.full_rmse < cands[a].full_rmse ? i : a, 0), ch = cands[iBest];
  Object.assign(M, withPars(ch, ch.tau));
  // drying-window series recomputed with the chosen set
  const series = {};
  for (const [name, w] of Object.entries(cd.config.windows)) {
    const t0w = Date.parse(F.t0.replace(' ', 'T') + 'Z'), ix = s => Math.round((Date.parse(s.replace(' ', 'T') + ':00Z') - t0w) / 3.6e6), i0 = ix(w[0]), i1 = ix(w[1]);
    const s0 = {}; for (const k of Object.keys(F.obs)) s0[k] = F.obs_s[k][i0];
    const Mw = withPars(ch, ch.tau); Mw.profileHours = [];
    const ow = S.run(S.buildConfig(Mw, fits, s0), { P_mm: F.P_mm.slice(i0 + 1, i1 + 1), PE_mm: F.PE_mm.slice(i0 + 1, i1 + 1) });
    series[name] = { i0, i1, massBalance: ow.massBalance, theta: {}, s_kPa: {} };
    for (const k of Object.keys(F.obs)) { series[name].theta[k] = r4(ow.theta[+k]); series[name].s_kPa[k] = Array.from(ow.head_cm[+k], h => Math.round(Math.max(-h / S.CM_PER_KPA, cd.config.S_FLOOR_KPA) * 100) / 100); }
  }
  const calib = { drying: { config: cd.config, lab_Ks_cm_h: cd.lab_Ks_cm_h, labRun: cd.labRun, candidates: cands, chosen: iBest, series } };
  const o = S.run(S.buildConfig(M, fits, F.s0_kPa), F);
  const prof = {}; for (const [hr, p] of Object.entries(o.profiles)) prof[hr] = { theta: r4(p.theta), s_kPa: p.h_cm.map(h => h < 0 ? Math.round(-h / S.CM_PER_KPA * 100) / 100 : 0),
    obs: Object.fromEntries(Object.keys(F.obs).map(k => [k, { theta: F.obs[k][+hr], s: F.obs_s[k][+hr] }])) };
  out.sites[site] = { model: M, calib, fits, s0_kPa: F.s0_kPa, t_init: F.t_init,
    theta: Object.fromEntries(Object.entries(o.theta).map(([k, v]) => [k, r4(v)])), obs: F.obs, obs_s: F.obs_s,
    z_cm: o.z_cm, profiles: prof, massBalance: o.massBalance, PE_total_mm: F.totals.PE_mm,
    monthly: (() => { const m = {}; const t0 = Date.parse(F.t0.replace(' ', 'T') + 'Z');
      for (let i = 0; i < F.n_hours; i++) { const d = new Date(t0 + i * 3.6e6), k = d.toISOString().slice(0, 7);
        const e = m[k] || (m[k] = { P: 0, I: 0, E: 0, T: 0, R: 0, D: 0 });
        e.P += F.P_mm[i]; e.I += (1 - M.throughfall) * F.P_mm[i]; e.E += o.evap_mm[i]; e.T += o.transp_mm[i]; e.R += o.runoff_mm[i]; e.D += o.drainage_mm[i]; }
      for (const e of Object.values(m)) for (const k in e) e[k] = Math.round(e[k] * 10) / 10; return m; })() };
  if (!out.t0) { out.t0 = F.t0; out.n_hours = F.n_hours; out.rain_missing = F.rain_missing;
    out.P_daily = (() => { const t0 = Date.parse(F.t0.replace(' ', 'T') + 'Z'), d = {}; for (let i = 0; i < F.n_hours; i++) { const k = new Date(t0 + i * 3.6e6).toISOString().slice(0, 10); d[k] = (d[k] || 0) + F.P_mm[i]; } return d; })(); }
  console.log(site, JSON.stringify(o.massBalance));
}
fs.writeFileSync(process.argv[2], JSON.stringify(out));

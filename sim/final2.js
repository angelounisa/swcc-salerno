// Run both sites with their calibrated parameters and write everything the dashboard needs.
// usage: node final2.js out.json   (reads calib2_NV.json, calib2_V.json if present, else model defaults)
const fs = require('fs'), S = require('./solver.js');
const r4 = a => Array.from(a, v => Math.round(v * 1e4) / 1e4);
const out = { sites: {} };
for (const site of ['NV', 'V']) {
  const F = JSON.parse(fs.readFileSync(`forcing_${site}.json`)), R = JSON.parse(fs.readFileSync(`../results_${site}.json`)), M = JSON.parse(fs.readFileSync(`model_${site}.json`));
  let calib = null;
  if (fs.existsSync(`calib2_${site}.json`)) { calib = JSON.parse(fs.readFileSync(`calib2_${site}.json`)); M.eFactor = calib.best.eFactor; M.tFrac = calib.best.tFrac; }
  const fits = {}; for (const k of Object.keys(R.depths)) fits[k] = R.depths[k].fits.drying.params;
  const o = S.run(S.buildConfig(M, fits, F.s0_kPa), F);
  const prof = {}; for (const [hr, p] of Object.entries(o.profiles)) prof[hr] = { theta: r4(p.theta), s_kPa: p.h_cm.map(h => h < 0 ? Math.round(-h / S.CM_PER_KPA * 100) / 100 : 0),
    obs: Object.fromEntries(Object.keys(F.obs).map(k => [k, { theta: F.obs[k][+hr], s: F.obs_s[k][+hr] }])) };
  out.sites[site] = { model: M, calib, fits, s0_kPa: F.s0_kPa, t_init: F.t_init,
    theta: Object.fromEntries(Object.entries(o.theta).map(([k, v]) => [k, r4(v)])), obs: F.obs,
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

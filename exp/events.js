// Experiment 2: design storms on columns with the SAME antecedent suction, with and without forest.
//  - initial state: uniform suction s0 over the whole column;
//  - storm: P mm spread uniformly over 24 h, then 48 h without rain; potential evaporation = mean hourly PE of the
//    wet season (Nov-Feb) of the measured forcing, constant;
//  - forest: interception bucket (capacity C, emptied by evaporation at PE) + forest transpiration share, roots and
//    calibrated demand factor; clear-cut: no interception, clear-cut values.
// Outputs: minimum suction in the 72 h at each depth; critical rain P_crit giving s_min < 10 kPa (bisection);
// model equivalent-rain factor k = P_crit(clear-cut) / P_crit(forest), the analogue of the measured one;
// minimum factor of safety of an infinite slope at each depth (beta of the model, chi = Se, c' = 0).
// usage: node events.js out.json
const fs = require('fs'), { S, L, R2, column } = require('./common.js');
const CFG = { s0_kPa: [10, 30, 100], P_mm: [10, 20, 40, 80, 120], storm_h: 24, after_h: 48, s_crit_kPa: 10, depths_cm: [15, 30, 35, 60, 100, 120],
  interception_capacity_mm: 16.75, interception_capacity_range_mm: [8.5, 25.0], pe_months: [11, 12, 1, 2], bisect_mm: [1, 400], bisect_tol_mm: 0.5,
  stability: { phi_deg: 38.5, c_kPa: 0, gamma_w: 9.81, gamma_d: { A1: 9.30, A2: 10.80 }, A1_bottom_cm: 20 } };
const F = L.NV.F, t0 = Date.parse(F.t0.replace(' ', 'T') + 'Z');
let pe = 0, npe = 0; for (let i = 0; i < F.n_hours; i++) if (CFG.pe_months.includes(new Date(t0 + i * 3.6e6).getUTCMonth() + 1)) { pe += F.PE_mm[i]; npe++; }
const PE_h = pe / npe;                 // mm/h, wet-season mean
const beta = L.NV.M.slope_deg * Math.PI / 180, tphi = Math.tan(CFG.stability.phi_deg * Math.PI / 180);
const lay = z => z < CFG.stability.A1_bottom_cm ? 'A1' : 'A2';
function forcing(P, forest, C) {
  const n = CFG.storm_h + CFG.after_h, Pg = Array.from({ length: n }, (_, i) => i < CFG.storm_h ? P / CFG.storm_h : 0), PE = Array(n).fill(PE_h);
  if (!forest) return { P_mm: Pg, PE_mm: PE, net_mm: P };
  let store = 0; const Pn = Pg.map((p, i) => { store += p; const ev = Math.min(store, PE[i]); store -= ev; const over = Math.max(0, store - C); store -= over; return over; });
  return { P_mm: Pn, PE_mm: PE, net_mm: Pn.reduce((a, b) => a + b, 0) };
}
const all = ['I', 'T', 'R', 'E'];      // forest factors (the initial state is imposed equal on purpose)
function storm(P, s0, forest, C) {
  const dz = L.NV.M.dz_cm, deps = Array.from({ length: Math.round(L.NV.M.L_cm / dz) + 1 }, (_, i) => i * dz).filter(z => z <= 140 && Math.abs(z / 5 - Math.round(z / 5)) < 1e-9);
  const cfg = column(forest ? all : [], { 15: s0, 60: s0 }, { 15: s0, 60: s0 }, deps);
  const f = forcing(P, forest, C), o = S.run(cfg, f), res = { net_mm: f.net_mm, depth: {} };
  const q = { A1: L.NV.fits.A1, A2: L.NV.fits.A2 };
  for (const d of CFG.depths_cm) { const h = o.head_cm[d]; let smin = Infinity, fsmin = Infinity;
    for (let t = 0; t < h.length; t++) {
      smin = Math.min(smin, -h[t] / S.CM_PER_KPA);
      let W = 0; for (const z of deps) { if (z >= d) break; const th = o.theta[z][t]; W += (CFG.stability.gamma_d[lay(z)] + th * CFG.stability.gamma_w) * 0.05; }   // 5 cm slices, kN/m2
      const p = q[lay(d)], th = o.theta[d][t], se = Math.min(1, Math.max(0, (th - p.theta_r) / (p.theta_s - p.theta_r))), s = -h[t] / S.CM_PER_KPA;
      const fs_ = tphi / Math.tan(beta) + (CFG.stability.c_kPa + (s > 0 ? se : 1) * s * tphi) / (W * Math.sin(beta) * Math.cos(beta));
      fsmin = Math.min(fsmin, fs_); }
    res.depth[d] = { s_min_kPa: smin, fs_min: fsmin }; }
  return res;
}
function pcrit(s0, d, forest, C) {        // smallest rain that brings s_min below s_crit at depth d
  let [a, b] = CFG.bisect_mm; if (storm(b, s0, forest, C).depth[d].s_min_kPa >= CFG.s_crit_kPa) return null;
  if (storm(a, s0, forest, C).depth[d].s_min_kPa < CFG.s_crit_kPa) return a;
  while (b - a > CFG.bisect_tol_mm) { const m = (a + b) / 2; if (storm(m, s0, forest, C).depth[d].s_min_kPa < CFG.s_crit_kPa) b = m; else a = m; }
  return (a + b) / 2;
}
const out = { config: CFG, PE_h_mm: PE_h, slope_deg: L.NV.M.slope_deg, grid: [], pcrit: [] };
for (const s0 of CFG.s0_kPa) for (const P of CFG.P_mm) for (const forest of [false, true]) { const r = storm(P, s0, forest, CFG.interception_capacity_mm); out.grid.push({ s0, P, forest, ...r });
  console.log('grid s0', s0, 'P', P, forest ? 'F' : 'CC', 'net', r.net_mm.toFixed(1), CFG.depths_cm.map(d => r.depth[d].s_min_kPa.toFixed(1) + '/' + r.depth[d].fs_min.toFixed(2)).join(' ')); }
for (const s0 of CFG.s0_kPa) for (const d of [15, 30, 60, 100, 120]) {
  const pc = pcrit(s0, d, false, null), row = { s0, depth: d, P_crit_CC_mm: pc, forest: {} };
  for (const C of [CFG.interception_capacity_range_mm[0], CFG.interception_capacity_mm, CFG.interception_capacity_range_mm[1]]) {
    const pf = pcrit(s0, d, true, C); row.forest[C] = { P_crit_F_mm: pf, k: (pc != null && pf != null) ? pc / pf : null }; }
  out.pcrit.push(row); console.log('pcrit s0', s0, 'z', d, 'CC', pc, JSON.stringify(row.forest)); }
fs.writeFileSync(process.argv[2], JSON.stringify(out));

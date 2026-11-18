// Check of the model on the autumn 2025 wetting: from the measured profiles of 15 Aug 2025 with the real rain,
// monthly median simulated vs measured suction at the sensor depths of each plot (clear-cut column for NV,
// forest column for V). Used to decide that the model is not reliable for wetting.
// usage: node autumn_check.js out.json
const fs = require('fs'), { S, L, column, idx } = require('./common.js');
const F = { NV: L.NV.F, V: L.V.F }, i0 = idx(F.NV, '2025-08-15 00:00:00'), i1 = idx(F.NV, '2026-01-31 23:00:00') + 1;
const s0 = s => { const o = {}; for (const k of Object.keys(F[s].obs_s)) o[k] = F[s].obs_s[k][i0]; return o; };
const med = a => { a = a.slice().sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; }, out = { monthly: {} };
for (const [s, on] of [['NV', []], ['V', ['I', 'T', 'R', 'E']]]) {
  const deps = Object.keys(F[s].obs_s).map(Number), o = S.run(column(on, s0(s), s0(s), deps), { P_mm: F[s].P_mm.slice(i0, i1), PE_mm: F.NV.PE_mm.slice(i0, i1) });
  for (const d of deps) { const sim = Array.from(o.head_cm[d], h => -h / S.CM_PER_KPA), ob = F[s].obs_s[String(d)].slice(i0, i1), mon = {};
    for (let i = 0; i < sim.length; i++) { if (ob[i] == null) continue; const m = new Date(Date.parse('2025-08-15T00:00:00Z') + i * 3.6e6).toISOString().slice(0, 7); (mon[m] = mon[m] || { s: [], o: [] }); mon[m].s.push(sim[i]); mon[m].o.push(ob[i]); }
    out.monthly[`${s}_${d}`] = Object.fromEntries(Object.entries(mon).map(([m, v]) => [m, { sim_kPa: med(v.s), obs_kPa: med(v.o) }])); } }
const g = (k, m, w) => Math.round(out.monthly[k][m][w]);
Object.assign(out, { V60_oct: g('V_60', '2025-10', 'sim_kPa'), V60_oct_obs: g('V_60', '2025-10', 'obs_kPa'), V60_nov: g('V_60', '2025-11', 'sim_kPa'), V60_nov_obs: g('V_60', '2025-11', 'obs_kPa'),
  NV15_jan: g('NV_15', '2026-01', 'sim_kPa'), NV15_jan_obs: g('NV_15', '2026-01', 'obs_kPa') });
fs.writeFileSync(process.argv[2], JSON.stringify(out)); console.log(JSON.stringify(Object.fromEntries(Object.entries(out).filter(([k]) => k !== 'monthly'))));

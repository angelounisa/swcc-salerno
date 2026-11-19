// Experiment 3: memory of the dry season. 2 x 2 design on the autumn 2025:
//   initial state = suction profile measured on 15 Aug 2025 in the clear-cut (sNV) or in the forest (sV)
//   column        = clear-cut (CC) or forest (F: interception, transpiration share, roots, demand factor)
// with the real hourly rain (gross for CC, net of the interception bucket for F). Rewetting date at each depth =
// first day from which the daily median suction stays below 30 kPa for 3 days (same rule as the data analysis),
// with the gross rain accumulated since 15 Aug. The effect of the initial deficit and of the autumn forest fluxes
// are read from the 2 x 2 table (main effects and interaction).
// usage: node memory.js out.json
const fs = require('fs'), { S, L, column, idx } = require('./common.js');
const CFG = { start: '2025-08-15 00:00:00', end: '2026-01-31 23:00:00', rewet_kPa: 30, rewet_days: 3, outDepths_cm: [15, 30, 35, 60, 100, 120] };
const F = { NV: L.NV.F, V: L.V.F }, i0 = idx(F.NV, CFG.start), i1 = idx(F.NV, CFG.end) + 1;
const s0 = s => { const o = {}; for (const k of Object.keys(F[s].obs_s)) { const v = F[s].obs_s[k][i0]; if (!(v > 0)) throw new Error('no initial suction ' + s + k); o[k] = v; } return o; };
const t0 = Date.parse(CFG.start.replace(' ', 'T') + 'Z'), Pg = F.NV.P_gross_mm.slice(i0, i1);
function rewet(sh) {           // hourly suction -> first day of a run of rewet_days days with daily median < rewet_kPa
  const nd = Math.floor(sh.length / 24), med = []; for (let d = 0; d < nd; d++) { const a = sh.slice(d * 24, d * 24 + 24).filter(x => x != null && isFinite(x)).sort((x, y) => x - y); med.push(a.length ? a[Math.floor(a.length / 2)] : null); }
  for (let d = 0; d + CFG.rewet_days <= nd; d++) { let ok = true; for (let j = 0; j < CFG.rewet_days; j++) if (!(med[d + j] != null && med[d + j] < CFG.rewet_kPa)) { ok = false; break; } if (ok) return d; }
  return null;
}
const res = (d) => d == null ? null : { date: new Date(t0 + d * 864e5).toISOString().slice(0, 10), days: d, rain_mm: Pg.slice(0, d * 24).reduce((a, b) => a + b, 0) };
const out = { config: CFG, s0: { NV: s0('NV'), V: s0('V') }, runs: {}, observed: {} };
for (const st of ['NV', 'V']) for (const col of ['CC', 'F']) {
  const on = col === 'F' ? ['I', 'T', 'R', 'E'] : [], cfg = column(on, s0(st), s0(st), CFG.outDepths_cm);
  const o = S.run(cfg, { P_mm: (col === 'F' ? F.V : F.NV).P_mm.slice(i0, i1), PE_mm: F.NV.PE_mm.slice(i0, i1) }), r = {};
  for (const d of CFG.outDepths_cm) r[d] = res(rewet(Array.from(o.head_cm[d], h => Math.max(0, -h / S.CM_PER_KPA))));
  const lay = z => z < 20 ? L.NV.fits.A1 : L.NV.fits.A2;
  out.runs[`${st}_${col}`] = { initial: st, column: col, rewet: r, massBalance: o.massBalance };
  console.log('initial', st, 'column', col, JSON.stringify(Object.fromEntries(Object.entries(r).map(([d, v]) => [d, v && [v.date, Math.round(v.rain_mm)]]))), 'T', o.massBalance.transpiration_mm.toFixed(0), 'D', o.massBalance.drainage_mm.toFixed(0));
}
// which forest factor delays the rewetting: clear-cut column with ONE forest factor, clear-cut initial state
out.single = {};
for (const f of ['I', 'T', 'R', 'E']) { const cfg = column([f], s0('NV'), s0('NV'), CFG.outDepths_cm);
  const o = S.run(cfg, { P_mm: (f === 'I' ? F.V : F.NV).P_mm.slice(i0, i1), PE_mm: F.NV.PE_mm.slice(i0, i1) }), r = {};
  for (const d of CFG.outDepths_cm) r[d] = res(rewet(Array.from(o.head_cm[d], h => Math.max(0, -h / S.CM_PER_KPA))));
  out.single[f] = r; console.log('single', f, JSON.stringify(Object.fromEntries(Object.entries(r).map(([d, v]) => [d, v && [v.date, Math.round(v.rain_mm)]])))); }
for (const s of ['NV', 'V']) { out.observed[s] = {}; for (const k of Object.keys(F[s].obs_s)) out.observed[s][k] = res(rewet(F[s].obs_s[k].slice(i0, i1))); }
console.log('observed', JSON.stringify(out.observed));
fs.writeFileSync(process.argv[2], JSON.stringify(out));

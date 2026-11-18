// Step 2: input to the soil under the forest, event by event, with the soil calibrated on the clear-cut plot.
// Gross rain -> interception store of capacity C [mm] (evaporating at the potential rate) -> overflow -> linear
// reservoir with time constant tau [h] (spreads the input in time, as stemflow/dripping/litter drainage) -> soil.
// For each event: grid over (C, tau); optimum and set of acceptable pairs (J <= Jmin + TOL); net input and peak
// input intensity of the optimum and of the acceptable set; diagnostics of the gross rain.
// usage: node ev_forest.js ev_soil.json out.json
const fs = require('fs'), { F, windows, soil, run, score, forestInput } = require('./ev_common.js');
// argv[5] = site whose sensors are fitted (V = forest; NV = control: the clear-cut, where the method should return C ~ 0)
const SITE = process.argv[5] || 'V';
if (!['V', 'NV'].includes(SITE)) throw new Error('site must be V or NV');
const G = { C_mm: [0, 2, 4, 7, 10, 15, 20, 30, 40, 60], tau_h: [0, 3, 6, 12, 24, 48] }, TOL = 0.01;
const SB = JSON.parse(fs.readFileSync(process.argv[2])).best, sl = soil(SB.fA, SB.log10K, SB.g), [SH, NSH] = (process.argv[4] || '0/1').split('/').map(Number), W = windows().filter((w, i) => i % NSH === SH), out = [];
const t = Date.now();
for (const w of W) {
  const Pg = F.NV.P_gross_mm.slice(w.i0 + 1, w.i1), PE = F.NV.PE_mm.slice(w.i0 + 1, w.i1), cells = [];
  for (const C of G.C_mm) for (const tau of G.tau_h) { const inp = forestInput(Pg, PE, C, tau), o = run(SITE, sl, w, inp, { throughfall: 1 });
    if (!o) continue; const sc = score(SITE, sl, w, o);
    cells.push({ C, tau, J: sc.mean, sc, net_mm: inp.reduce((a, b) => a + b, 0), peak_mm_h: Math.max(...inp) }); }
  if (!cells.length) { out.push({ j: w.j, start: w.e.start, missing: true }); continue; }
  const b = cells.reduce((a, c) => c.J < a.J ? c : a), ok = cells.filter(c => c.J <= b.J + TOL);
  const rng = k => [Math.min(...ok.map(c => c[k])), Math.max(...ok.map(c => c[k]))];
  // reference: clear-cut column with the measured gross rain, same soil and window (how good is the soil model there)
  const oN = run('NV', sl, w, Pg);
  out.push({ j: w.j, start: w.e.start, end: w.e.end, P_mm: Pg.reduce((a, c) => a + c, 0), P_event_mm: w.e.P_mm, imax_mm_h: Math.max(...Pg), PE_mm: PE.reduce((a, c) => a + c, 0),
    best: b, acceptable: { n: ok.length, C_mm: rng('C'), tau_h: rng('tau'), net_mm: rng('net_mm'), peak_mm_h: rng('peak_mm_h') },
    J_no_interception: cells.find(c => c.C === 0 && c.tau === 0).J, NV_score: oN ? score('NV', sl, w, oN) : null, grid: cells.map(c => [c.C, c.tau, +c.J.toFixed(4)]) });
  console.log(w.e.start, 'P', w.e.P_mm, 'best C', b.C, 'tau', b.tau, 'J', b.J.toFixed(3), 'C range', rng('C'), 'net', b.net_mm.toFixed(1), ((Date.now() - t) / 1000).toFixed(0) + 's');
}
fs.writeFileSync(process.argv[3], JSON.stringify({ site: SITE, grid: G, tol: TOL, soil: SB, events: out }));

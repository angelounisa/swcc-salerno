// Summary of the event-scale inversion for the dashboard: per-event net input to the soil (forest V and clear-cut
// control NV), quality flags, loss = P - net, relation with event characteristics, check with the throughfall gauge,
// example time series. usage: node ev_summary.js out.json
const fs = require('fs'), { F, windows, soil, run, score, forestInput, seObs, L } = require('./ev_common.js');
const Q = { J_MAX: 0.10 };   // event kept only if the best fit at BOTH plots has mean RMSE Se <= J_MAX (model able to follow the sensors)
const TF = { start: '2026-01-15', end: '2026-02-14', ratio: 0.49 };   // throughfall gauge period and measured ratio
const ld = (p, s) => [0, 1].flatMap(sh => JSON.parse(fs.readFileSync(`${p}_${s}_${sh}.json`)).events).filter(e => !e.missing);
const SB = JSON.parse(fs.readFileSync('ev_soil_final.json')).best, SA = JSON.parse(fs.readFileSync('ev_soil_alt.json')).best;
const V = ld('evf', 'V'), N = ld('evf', 'NV'), VA = ld('evfalt', 'V'), NA = ld('evfalt', 'NV');
const by = a => Object.fromEntries(a.map(e => [e.start, e]));
const n = by(N), va = by(VA), na = by(NA), W = Object.fromEntries(windows().map(w => [w.e.start, w]));
const month = s => +s.slice(5, 7), season = m => [12, 1, 2].includes(m) ? 'inverno' : [3, 4, 5].includes(m) ? 'primavera' : [6, 7, 8].includes(m) ? 'estate' : 'autunno';
const ev = V.filter(e => n[e.start]).sort((a, b) => a.start < b.start ? -1 : 1).map(e => {
  const c = n[e.start], w = W[e.start], o0 = {}; for (const k of [15, 35, 60]) { const x = F.V.obs[k][w.i0]; o0[k] = x == null ? null : seObs('V', k, x); }
  const bad = []; if (e.best.J > Q.J_MAX) bad.push('V'); if (c.best.J > Q.J_MAX) bad.push('NV');
  return { start: e.start, end: e.end, P: e.P_mm, imax: e.imax_mm_h, PE: e.PE_mm, season: season(month(e.start)), dur_h: (Date.parse(e.end) - Date.parse(e.start)) / 3.6e6 + 1,
    Se0_V15: o0[15], V: { C: e.best.C, tau: e.best.tau, J: e.best.J, J0: e.J_no_interception, net: e.best.net_mm, peak: e.best.peak_mm_h, acc: e.acceptable },
    NV: { C: c.best.C, tau: c.best.tau, J: c.best.J, J0: c.J_no_interception, net: c.best.net_mm, peak: c.best.peak_mm_h, acc: c.acceptable },
    alt: va[e.start] && na[e.start] ? { netV: va[e.start].best.net_mm, netNV: na[e.start].best.net_mm } : null, bad }; });
const ok = ev.filter(e => !e.bad.length), sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
// loss model: net_V = max(0, P - Ceff) fitted by least squares over Ceff (1-parameter threshold), on good events
const fitC = (a, f) => { let best = null; for (let C = 0; C <= 80; C += 0.5) { const r = sum(a, e => (f(e) - Math.max(0, e.P - C)) ** 2); if (!best || r < best.r) best = { C, r }; }
  return { C: best.C, rmse: Math.sqrt(best.r / a.length) }; };
// Spearman correlation
const rank = v => { const s = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]), r = new Array(v.length); s.forEach((p, i) => r[p[1]] = i); return r; };
const pear = (x, y) => { const mx = sum(x, a => a) / x.length, my = sum(y, a => a) / y.length; let a = 0, b = 0, c = 0; for (let i = 0; i < x.length; i++) { a += (x[i] - mx) * (y[i] - my); b += (x[i] - mx) ** 2; c += (y[i] - my) ** 2; } return a / Math.sqrt(b * c); };
const spear = (x, y) => pear(rank(x), rank(y));
const lossV = e => e.NV.net - e.V.net;   // forest loss relative to the clear-cut control (same method, same soil)
const drivers = {}; for (const [k, f] of [['P', e => e.P], ['imax', e => e.imax], ['dur_h', e => e.dur_h], ['PE', e => e.PE], ['Se0_V15', e => e.Se0_V15]]) {
  const a = ok.filter(e => f(e) != null); drivers[k] = { rho_loss: spear(a.map(f), a.map(lossV)), rho_fracV: spear(a.map(f), a.map(e => e.V.net / e.P)), n: a.length }; }
const tf = ok.filter(e => e.start >= TF.start && e.start < TF.end);
// uncertainty of Ceff: bootstrap over events (seeded Park-Miller generator, B resamples)
const BOOT = { B: 1000, seed: 20261118 };
const bootC = f => { let sd = BOOT.seed; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647, cs = [];
  for (let b = 0; b < BOOT.B; b++) { const smp = ok.map(() => ok[Math.floor(rnd() * ok.length)]); cs.push(fitC(smp, f).C); }
  cs.sort((x, y) => x - y); return [cs[Math.floor(0.025 * BOOT.B)], cs[Math.floor(0.975 * BOOT.B)]]; };
const seasonFit = ['autunno', 'inverno', 'primavera', 'estate'].map(k => { const a = ok.filter(e => e.season === k); return { season: k, n: a.length, Pmax: Math.max(...a.map(e => e.P)), ...fitC(a, e => e.V.net) }; });
// residual of the threshold model for the forest vs event characteristics
const CV = fitC(ok, e => e.V.net).C, resid = ok.map(e => (e.P - e.V.net) - Math.min(e.P, CV));
const residRho = {}; for (const [k, f] of [['imax', e => e.imax], ['dur_h', e => e.dur_h], ['PE', e => e.PE], ['Se0_V15', e => e.Se0_V15]]) residRho[k] = spear(ok.map(f), resid);
const out = { soil: SB, soilAlt: SA, Q, n_events: ev.length, n_ok: ok.length,
  totals: { P: sum(ok, e => e.P), netV: sum(ok, e => e.V.net), netNV: sum(ok, e => e.NV.net), netV_alt: sum(ok, e => e.alt ? e.alt.netV : NaN), netNV_alt: sum(ok, e => e.alt ? e.alt.netNV : NaN) },
  thresholdFit: { V: { ...fitC(ok, e => e.V.net), ci95: bootC(e => e.V.net) }, NV: { ...fitC(ok, e => e.NV.net), ci95: bootC(e => e.NV.net) }, boot: BOOT }, seasonFit, residRho,
  bySize: [[0, 20], [20, 40], [40, 1e9]].map(([a, b]) => { const s = ok.filter(e => e.P >= a && e.P < b); return { range: [a, b], n: s.length, P: sum(s, e => e.P), netV: sum(s, e => e.V.net), netNV: sum(s, e => e.NV.net) }; }),
  bySeason: ['autunno', 'inverno', 'primavera', 'estate'].map(k => { const s = ok.filter(e => e.season === k); return { season: k, n: s.length, P: sum(s, e => e.P), netV: sum(s, e => e.V.net), netNV: sum(s, e => e.NV.net) }; }),
  drivers, throughfall: { period: TF, events: tf.map(e => e.start), P: sum(tf, e => e.P), netV: sum(tf, e => e.V.net), netNV: sum(tf, e => e.NV.net) }, events: ev };
// example time series: measured Se vs simulated with gross rain (C = 0) and with the calibrated input, forest and clear-cut
const sl = soil(SB.fA, SB.log10K, SB.g), ex = {};
for (const st of ['2026-01-24 04:00:00', '2025-03-26 14:00:00', '2025-12-23 16:00:00', '2025-04-14 16:00:00']) {
  const e = ev.find(x => x.start === st); if (!e) throw new Error('example event not found ' + st);
  const w = W[st], Pg = F.NV.P_gross_mm.slice(w.i0 + 1, w.i1), PE = F.NV.PE_mm.slice(w.i0 + 1, w.i1), r = { start: st, P: Pg, t0: w.i0 + 1 };
  for (const site of ['V', 'NV']) { const b = e[site], inp = forestInput(Pg, PE, b.C, b.tau), o1 = run(site, sl, w, inp, { throughfall: 1 }), o0 = run(site, sl, w, forestInput(Pg, PE, 0, 0), { throughfall: 1 });
    const depths = Object.keys(F[site].obs).map(Number), toSe = (k, th) => { const q = sl.dry[L[site].fits.sensors[k].layer]; return (th - q.theta_r) / (q.theta_s - q.theta_r); };
    r[site] = { input: inp, obs: {}, sim: {}, sim0: {} };
    for (const k of depths) { r[site].obs[k] = Pg.map((_, i) => { const x = F[site].obs[k][w.i0 + 1 + i]; return x == null ? null : +seObs(site, k, x).toFixed(4); });
      r[site].sim[k] = Array.from(o1.theta[k], x => +toSe(k, x).toFixed(4)); r[site].sim0[k] = Array.from(o0.theta[k], x => +toSe(k, x).toFixed(4)); } }
  ex[st] = r; }
out.examples = ex;
// sensitivity of the quality rule (v2): keep events where only the FOREST fit is acceptable (the clear-cut control
// fails on the large events with the user's calibration: theta at 15 cm reaches Se_d ~ 4 and is not reproduced)
{ const okV = ev.filter(e => e.V.J <= Q.J_MAX);
  out.qcForestOnly = { n: okV.length, P: sum(okV, e => e.P), netV: sum(okV, e => e.V.net), netNV: sum(okV, e => e.NV.net), thresholdV: fitC(okV, e => e.V.net),
    bySize: [[0, 20], [20, 40], [40, 1e9]].map(([a, b]) => { const q = okV.filter(e => e.P >= a && e.P < b); return { range: [a, b], n: q.length, P: sum(q, e => e.P), netV: sum(q, e => e.V.net), netNV: sum(q, e => e.NV.net) }; }),
    censored: okV.filter(e => e.V.acc.C_mm[0] === Math.max(...JSON.parse(fs.readFileSync('evf_V_0.json')).grid.C_mm)).map(e => e.start) }; }
fs.writeFileSync(process.argv[2], JSON.stringify(out));
console.log(JSON.stringify({ n: out.n_events, ok: out.n_ok, bad: ev.filter(e => e.bad.length).map(e => e.start.slice(0, 10) + ':' + e.bad), totals: out.totals, thr: out.thresholdFit, bySize: out.bySize, bySeason: out.bySeason, drivers, tf: out.throughfall }, null, 1));

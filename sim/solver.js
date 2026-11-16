/* 1D Richards equation, mixed form, implicit finite differences with modified Picard
 * iteration (Celia, Bouloutas & Zarba, 1990, WRR 26(7)).
 * z positive downward [cm], pressure head h [cm] (negative = suction), time [h].
 * Retention: van Genuchten (m = 1 - 1/n); conductivity: Mualem, l = 0.5, with the air-entry
 * modification of Vogel, van Genuchten & Cislerova (2001, Adv. Water Resour. 24) at h_s (cfg.hs_cm, e.g. -2 cm):
 * for h < h_s theta is the fitted VG curve and K = Ks sqrt(S/S_s) [F(S)/F(S_s)]^2, F(S) = 1-(1-S^(1/m))^m,
 * S = (1+(a|h|)^n)^-m, S_s = S(h_s); for h >= h_s theta = theta(h_s) (+ elastic storage Ss (h - h_s)), K = Ks.
 * Without it, Mualem K with n < ~1.3 drops by an order of magnitude within 1 cm of saturation
 * and the solver stalls during rain.
 * Top: atmospheric BC (flux P - E) switching to h = 0 (ponding, excess = runoff) or
 *      h = hCrit (surface too dry to sustain potential evaporation).
 * Bottom: free drainage (unit gradient, q = K(h_N)).
 * Same file runs in the browser (window.RichardsSolver) and in Node (module.exports).
 */
(function (root) {
  'use strict';
  const CM_PER_KPA = 10.1972; // 1 kPa = 10.1972 cm of water

  function vgTheta(h, p) {
    if (h >= 0) return p.ts;
    return p.tr + (p.ts - p.tr) * Math.pow(1 + Math.pow(p.a * -h, p.n), -p.m);
  }
  function vgC(h, p) { // d theta / d h  [1/cm]
    if (h >= 0) return 0;
    const ah = p.a * -h, an = Math.pow(ah, p.n);
    return (p.ts - p.tr) * p.m * p.n * p.a * Math.pow(ah, p.n - 1) * Math.pow(1 + an, -p.m - 1);
  }
  function vgK(h, p) { // [cm/h]
    if (h >= 0) return p.Ks;
    const se = Math.pow(1 + Math.pow(p.a * -h, p.n), -p.m);
    const f = 1 - Math.pow(1 - Math.pow(se, 1 / p.m), p.m);
    return p.Ks * Math.sqrt(se) * f * f;
  }
  function hFromTheta(th, p) { // inverse retention, for initial conditions
    if (th >= p.ts) return 0;
    const se = (th - p.tr) / (p.ts - p.tr);
    if (!(se > 0)) throw new Error('theta below theta_r in hFromTheta');
    return -Math.pow(Math.pow(se, -1 / p.m) - 1, 1 / p.n) / p.a;
  }

  // Thomas algorithm, overwrites d
  function tridiag(a, b, c, d, x, n) {
    const cp = new Float64Array(n);
    let beta = b[0];
    if (beta === 0) throw new Error('singular tridiagonal system');
    x[0] = d[0] / beta;
    for (let i = 1; i < n; i++) {
      cp[i] = c[i - 1] / beta;
      beta = b[i] - a[i] * cp[i];
      if (beta === 0) throw new Error('singular tridiagonal system');
      x[i] = (d[i] - a[i] * x[i - 1]) / beta;
    }
    for (let i = n - 2; i >= 0; i--) x[i] -= cp[i + 1] * x[i + 1];
  }

  /**
   * run(cfg, forcing)
   * cfg: { L_cm, dz_cm, layers:[{zTop_cm, zBot_cm, tr, ts, alpha_per_kPa, n, Ks_cm_h}],
   *        hCrit_cm, Ss_per_cm, eFactor, dtMin_h, dtMax_h, maxIter, tolTheta, itGrow, itShrink,
   *        outDepths_cm:[...], h0_cm: array(N+1) initial head }
   * forcing: { P_mm:[], PE_mm:[] }  hourly (hour i ends at t = i+1 h)
   * returns { theta: {depth: Float64Array(nHours)}, fluxes per hour, massBalance }
   */
  function run(cfg, forcing) {
    for (const k of ['L_cm', 'dz_cm', 'layers', 'hCrit_cm', 'Ss_per_cm', 'eFactor', 'dtMin_h', 'dtMax_h',
      'maxIter', 'tolTheta', 'tolHsat_cm', 'hs_cm', 'itGrow', 'itShrink', 'outDepths_cm', 'h0_cm']) {
      if (cfg[k] === undefined) throw new Error('missing cfg.' + k);
    }
    const dz = cfg.dz_cm, N = Math.round(cfg.L_cm / dz);
    if (Math.abs(N * dz - cfg.L_cm) > 1e-9) throw new Error('L must be a multiple of dz');
    const nn = N + 1;
    if (cfg.h0_cm.length !== nn) throw new Error('h0 length must be N+1');
    // node parameters
    const P = new Array(nn);
    for (let i = 0; i < nn; i++) {
      const z = i * dz;
      const L = cfg.layers.find(l => z >= l.zTop_cm && z < l.zBot_cm) || (z >= cfg.L_cm - 1e-9 ? cfg.layers[cfg.layers.length - 1] : null);
      if (!L) throw new Error('no layer covers z = ' + z);
      if (!(L.n > 1 && L.ts > L.tr && L.Ks_cm_h > 0 && L.alpha_per_kPa > 0)) throw new Error('bad layer params');
      const q = { tr: L.tr, ts: L.ts, a: L.alpha_per_kPa / CM_PER_KPA, n: L.n, m: 1 - 1 / L.n, Ks: L.Ks_cm_h };
      if (!(cfg.hs_cm < 0)) throw new Error('hs_cm must be negative');
      const ans = Math.pow(q.a * -cfg.hs_cm, q.n);
      q.Ss_ = Math.pow(1 + ans, -q.m);                 // S at h_s
      q.Fs = 1 - Math.pow(ans / (1 + ans), q.m);         // F(S_s)
      q.ths = q.tr + (q.ts - q.tr) * q.Ss_;              // theta at h_s (max water content used by the model)
      P[i] = q;
    }
    const outIdx = cfg.outDepths_cm.map(d => { const i = Math.round(d / dz); if (Math.abs(i * dz - d) > 1e-9) throw new Error('output depth not on grid'); return i; });
    const nH = forcing.P_mm.length;
    if (forcing.PE_mm.length !== nH) throw new Error('forcing length mismatch');

    let h = Float64Array.from(cfg.h0_cm);
    const th = new Float64Array(nn), thOld = new Float64Array(nn), hk = new Float64Array(nn), hNew = new Float64Array(nn);
    const K = new Float64Array(nn), C = new Float64Array(nn), thk = new Float64Array(nn);
    const a = new Float64Array(nn), b = new Float64Array(nn), c = new Float64Array(nn), d = new Float64Array(nn);
    const Kh = new Float64Array(nn); // interface conductivity i+1/2 (arithmetic mean)
    const Ss = cfg.Ss_per_cm;
    const hs = cfg.hs_cm;
    const wc = (hh, p) => hh >= hs ? p.ths + Ss * (hh - hs) : vgTheta(hh, p);
    const kOf = (hh, p) => {
      if (hh >= hs) return p.Ks;
      const an = Math.pow(p.a * -hh, p.n), se = Math.pow(1 + an, -p.m), f = 1 - Math.pow(an / (1 + an), p.m);
      return p.Ks * Math.sqrt(se / p.Ss_) * (f / p.Fs) * (f / p.Fs);
    };
    for (let i = 0; i < nn; i++) th[i] = wc(h[i], P[i]);
    const storage = () => { let s = 0; for (let i = 0; i < nn; i++) s += th[i] * (i === 0 || i === N ? dz / 2 : dz); return s; };
    const S0 = storage();

    const out = {}; cfg.outDepths_cm.forEach(z => out[z] = new Float64Array(nH));
    const qTopH = new Float64Array(nH), runoffH = new Float64Array(nH), drainH = new Float64Array(nH);
    let cumInf = 0, cumDrain = 0, cumRunoff = 0, steps = 0, iters = 0;
    let dt = Math.min(cfg.dtMax_h, 0.1), lastMode = 'flux';

    // one implicit step; mode: 'flux' | 'head'; returns {ok, it}
    function step(dtS, mode, qTop, hTop) {
      hk.set(h);
      for (let it = 1; it <= cfg.maxIter; it++) {
        for (let i = 0; i < nn; i++) {
          const p = P[i], hh = hk[i];
          if (hh >= hs) { thk[i] = p.ths + Ss * (hh - hs); C[i] = Ss; K[i] = p.Ks; continue; }  // above air entry: elastic storage only
          // one pass: theta, C = dtheta/dh, K (Mualem); uses Se^(1/m) = 1/(1+(a|h|)^n)
          const ah = p.a * -hh, an = Math.pow(ah, p.n), se = Math.pow(1 + an, -p.m);
          const t = p.tr + (p.ts - p.tr) * se;
          thk[i] = t;
          C[i] = (p.ts - p.tr) * p.m * p.n * p.a * (an / ah) * se / (1 + an);
          const f = 1 - Math.pow(an / (1 + an), p.m);
          K[i] = p.Ks * Math.sqrt(se / p.Ss_) * (f / p.Fs) * (f / p.Fs);
        }
        for (let i = 0; i < N; i++) Kh[i] = 0.5 * (K[i] + K[i + 1]);
        // interior
        for (let i = 1; i < N; i++) {
          const Km = Kh[i - 1], Kp = Kh[i];
          a[i] = -Km / (dz * dz); c[i] = -Kp / (dz * dz);
          b[i] = C[i] / dtS + (Km + Kp) / (dz * dz);
          d[i] = C[i] * hk[i] / dtS - (thk[i] - thOld[i]) / dtS - (Kp - Km) / dz;
        }
        // top
        if (mode === 'flux') {
          const w = dz / 2;
          a[0] = 0; c[0] = -Kh[0] / dz;
          b[0] = w * C[0] / dtS + Kh[0] / dz;
          d[0] = qTop - Kh[0] + w * (C[0] * hk[0] - (thk[0] - thOld[0])) / dtS;
        } else { a[0] = 0; b[0] = 1; c[0] = 0; d[0] = hTop; }
        // bottom: free drainage
        { const w = dz / 2, Km = Kh[N - 1];
          a[N] = -Km / dz; c[N] = 0;
          b[N] = w * C[N] / dtS + Km / dz;
          d[N] = Km - K[N] + w * (C[N] * hk[N] - (thk[N] - thOld[N])) / dtS; }
        tridiag(a, b, c, d, hNew, nn);
        // converged when the water content stops changing at every node (mass-based criterion:
        // the Celia scheme is mass-conservative only to the extent that theta(h^{k+1}) - theta(h^k) -> 0)
        let conv = true;
        for (let i = 0; i < nn; i++) {
          if (!isFinite(hNew[i])) return { ok: false, it };
          if (!conv) continue;
          if (hNew[i] >= hs || hk[i] >= hs) { if (Math.abs(hNew[i] - hk[i]) > cfg.tolHsat_cm) conv = false; } // saturated: theta is flat, test head
          else if (Math.abs(vgTheta(hNew[i], P[i]) - thk[i]) > cfg.tolTheta) conv = false;
        }
        hk.set(hNew);
        if (conv) return { ok: true, it };
      }
      return { ok: false, it: cfg.maxIter };
    }

    for (let hr = 0; hr < nH; hr++) {
      const qP = forcing.P_mm[hr] / 10;                  // cm/h, downward
      const qE = cfg.eFactor * forcing.PE_mm[hr] / 10;   // cm/h, upward potential
      const qPot = qP - qE;
      let tIn = 0, hrInf = 0, hrRun = 0, hrDrain = 0;
      while (tIn < 1 - 1e-12) {
        const dtS = Math.min(dt, 1 - tIn);
        thOld.set(th);
        // atmospheric BC with switching (HYDRUS-like): keep the previous limiting mode while it still
        // limits the flux, otherwise use the potential flux and switch if the surface head leaves [hCrit, 0]
        const surfFlux = () => (dz / 2) * (wc(hk[0], P[0]) - thOld[0]) / dtS
          - 0.5 * (kOf(hk[0], P[0]) + kOf(hk[1], P[1])) * ((hk[1] - hk[0]) / dz - 1);
        let mode = null, hTop = 0, r = null;
        if (lastMode === 'dry' && qPot < 0) {
          r = step(dtS, 'head', 0, cfg.hCrit_cm);
          if (r.ok && surfFlux() >= qPot) { mode = 'head'; hTop = cfg.hCrit_cm; } else r = null;
        } else if (lastMode === 'pond' && qPot > 0) {
          r = step(dtS, 'head', 0, 0);
          if (r.ok && surfFlux() <= qPot) { mode = 'head'; hTop = 0; } else r = null;
        }
        if (!mode) {
          r = step(dtS, 'flux', qPot, 0); mode = 'flux';
          if (r.ok && hk[0] > 0) { mode = 'head'; hTop = 0; r = step(dtS, 'head', 0, 0); }
          else if ((r.ok && hk[0] < cfg.hCrit_cm) || (!r.ok && qPot < 0)) { mode = 'head'; hTop = cfg.hCrit_cm; r = step(dtS, 'head', 0, cfg.hCrit_cm); }
        }
        if (!r.ok) {
          dt = dtS / 3;
          if (dt < cfg.dtMin_h) throw new Error('time step below dtMin at hour ' + hr + ' (no convergence)');
          continue;
        }
        // accept
        lastMode = mode === 'flux' ? 'flux' : (hTop === 0 ? 'pond' : 'dry');
        h.set(hk);
        for (let i = 0; i < nn; i++) th[i] = wc(h[i], P[i]);
        const K0 = kOf(h[0], P[0]), K1 = kOf(h[1], P[1]), KN = kOf(h[N], P[N]);
        const q12 = -0.5 * (K0 + K1) * ((h[1] - h[0]) / dz - 1);   // downward flux at z = dz/2
        let qTop;
        if (mode === 'flux') qTop = qPot;
        else qTop = (dz / 2) * (th[0] - thOld[0]) / dtS + q12;       // actual flux through surface
        const qBot = KN;
        // partition the actual surface flux into infiltration / runoff / evaporation
        hrInf += qTop * dtS;   // net surface flux: + infiltration, - evaporation
        if (mode === 'head' && hTop === 0) hrRun += Math.max(0, qPot - qTop) * dtS;  // ponding excess
        hrDrain += qBot * dtS;
        tIn += dtS; steps++; iters += r.it;
        // adapt from the nominal dt (a step shortened only to hit the hour boundary must not shrink dt)
        const base = dtS < dt ? dt : dtS;
        if (r.it <= cfg.itGrow) dt = Math.min(cfg.dtMax_h, base * 1.3);
        else if (r.it > cfg.itShrink) dt = Math.max(cfg.dtMin_h, base * 0.7);
        else dt = base;
      }
      cumInf += hrInf; cumDrain += hrDrain; cumRunoff += hrRun;
      qTopH[hr] = hrInf * 10; runoffH[hr] = hrRun * 10; drainH[hr] = hrDrain * 10;
      for (let j = 0; j < outIdx.length; j++) out[cfg.outDepths_cm[j]][hr] = th[outIdx[j]];
    }
    const S1 = storage();
    // mass balance (cm): storage change must equal net surface flux - drainage
    const err = (S1 - S0) - (cumInf - cumDrain);
    return {
      theta: out,
      netSurface_mm: qTopH, runoff_mm: runoffH, drainage_mm: drainH,
      massBalance: { dS_mm: (S1 - S0) * 10, netSurface_mm: cumInf * 10, drainage_mm: cumDrain * 10, runoff_mm: cumRunoff * 10,
        error_mm: err * 10, relError: Math.abs(err) / Math.max(1e-9, Math.abs(cumInf) + Math.abs(cumDrain)) },
      stats: { steps, iters, finalH: Array.from(h) }
    };
  }

  /**
   * buildConfig(model, fits, s0_kPa)
   * model: { L_cm, dz_cm, layerBounds_cm:[0,b1,b2,L], layerDepthKeys:['15','30','60'], Ks_cm_h:[k1,k2,k3], eFactor,
   *          hCrit_cm, Ss_per_cm, dtMin_h, dtMax_h, maxIter, tolTheta, itGrow, itShrink, outDepths_cm }
   * fits: {'15': {theta_r, theta_s, alpha, n}, ...}  (alpha in 1/kPa)
   * s0_kPa: {'15': s, '30': s, '60': s} observed suction at t0, interpolated linearly in z for h0
   */
  function buildConfig(model, fits, s0_kPa) {
    const b = model.layerBounds_cm, keys = model.layerDepthKeys;
    if (b.length !== keys.length + 1 || model.Ks_cm_h.length !== keys.length) throw new Error('layer definition mismatch');
    const layers = keys.map((k, j) => ({ zTop_cm: b[j], zBot_cm: b[j + 1], tr: fits[k].theta_r, ts: fits[k].theta_s,
      alpha_per_kPa: fits[k].alpha, n: fits[k].n, Ks_cm_h: model.Ks_cm_h[j] }));
    const N = Math.round(model.L_cm / model.dz_cm), zs = keys.map(Number);
    const hs = keys.map(k => { const s = s0_kPa[k]; if (!(s > 0)) throw new Error('missing initial suction at ' + k); return -s * CM_PER_KPA; });
    const h0 = new Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const z = i * model.dz_cm;
      if (z <= zs[0]) h0[i] = hs[0];
      else if (z >= zs[zs.length - 1]) h0[i] = hs[hs.length - 1];
      else { let j = 0; while (z > zs[j + 1]) j++; const f = (z - zs[j]) / (zs[j + 1] - zs[j]); h0[i] = hs[j] + f * (hs[j + 1] - hs[j]); }
    }
    return Object.assign({}, model, { layers, h0_cm: h0 });
  }

  const api = { run, buildConfig, vgTheta, vgK, vgC, hFromTheta, CM_PER_KPA };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RichardsSolver = api;
})(typeof window !== 'undefined' ? window : globalThis);

/* 1D Richards equation, mixed form, implicit finite differences with modified Picard
 * iteration (Celia, Bouloutas & Zarba, 1990, WRR 26(7)).
 * z positive downward [cm], pressure head h [cm] (negative = suction), time [h].
 * Retention: van Genuchten (m = 1 - 1/n); conductivity: Mualem, l = 0.5, with the air-entry
 * modification of Vogel, van Genuchten & Cislerova (2001, Adv. Water Resour. 24) at h_s (cfg.hs_cm, e.g. -2 cm):
 * for h < h_s theta is the fitted VG curve and K = Ks sqrt(S/S_s) [F(S)/F(S_s)]^2, F(S) = 1-(1-S^(1/m))^m,
 * S = (1+(a|h|)^n)^-m, S_s = S(h_s); for h >= h_s theta = theta(h_s) (+ elastic storage Ss (h - h_s)), K = Ks.
 * Without it, Mualem K with n < ~1.3 drops by an order of magnitude within 1 cm of saturation
 * and the solver stalls during rain.
 * Top: atmospheric BC (flux tau*P - Ep) switching to h = 0 (ponding, excess = runoff) or
 *      h = hCrit (surface too dry to sustain potential evaporation).
 *      tau = throughfall fraction (canopy interception = (1 - tau) P, removed before reaching the soil).
 * Potential evapotranspiration PET = eFactor * PE is split into soil evaporation Ep = (1 - tFrac) PET (top BC)
 * and transpiration Tp = tFrac PET, extracted as a sink S(z,h) = aF(h) b(z) Tp (Feddes et al., 1978),
 * b(z) = normalised root density (piecewise linear), aF = Feddes reduction (h1 > h2 > h3 > h4).
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
      'maxIter', 'tolTheta', 'tolHsat_cm', 'hs_cm', 'itGrow', 'itShrink', 'outDepths_cm', 'h0_cm',
      'throughfall', 'tFrac', 'roots', 'feddes_cm', 'profileHours']) {
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
    // root density b(z) [1/cm], normalised so that sum(b_i w_i) = 1 (w_i = cell length)
    if (!(cfg.throughfall > 0 && cfg.throughfall <= 1)) throw new Error('throughfall must be in (0,1]');
    if (!(cfg.tFrac >= 0 && cfg.tFrac <= 1)) throw new Error('tFrac must be in [0,1]');
    const F4 = cfg.feddes_cm; // [h1, h2, h3, h4], 0 > h1 > h2 > h3 > h4
    if (!(F4.length === 4 && 0 >= F4[0] && F4[0] > F4[1] && F4[1] > F4[2] && F4[2] > F4[3])) throw new Error('bad Feddes heads');
    const bz = new Float64Array(N + 1);
    { const R = cfg.roots; let tot = 0;
      for (let i = 0; i < nn; i++) {
        const z = i * dz; let v = 0;
        for (let j = 0; j < R.length - 1; j++) if (z >= R[j][0] && z <= R[j + 1][0]) { const f = (z - R[j][0]) / (R[j + 1][0] - R[j][0]); v = R[j][1] + f * (R[j + 1][1] - R[j][1]); break; }
        if (v < 0) throw new Error('negative root density');
        bz[i] = v; tot += v * (i === 0 || i === N ? dz / 2 : dz);
      }
      if (cfg.tFrac > 0 && !(tot > 0)) throw new Error('transpiration requested but no roots in the domain');
      if (tot > 0) for (let i = 0; i < nn; i++) bz[i] /= tot; }
    const feddes = hh => hh > F4[0] ? 0 : hh > F4[1] ? (F4[0] - hh) / (F4[0] - F4[1]) : hh >= F4[2] ? 1 : hh > F4[3] ? (hh - F4[3]) / (F4[2] - F4[3]) : 0;
    const Sk = new Float64Array(nn); // sink at current iterate [1/h]
    let TpNow = 0;                   // potential transpiration of the current hour [cm/h]
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

    const out = {}, outH = {}; cfg.outDepths_cm.forEach(z => { out[z] = new Float64Array(nH); outH[z] = new Float64Array(nH); });
    const qTopH = new Float64Array(nH), runoffH = new Float64Array(nH), drainH = new Float64Array(nH);
    const transpH = new Float64Array(nH), evapH = new Float64Array(nH);
    let cumInf = 0, cumDrain = 0, cumRunoff = 0, cumT = 0, cumE = 0, steps = 0, iters = 0;
    const profSet = new Set(cfg.profileHours), profiles = {};
    for (const ph of cfg.profileHours) if (!(Number.isInteger(ph) && ph >= 0 && ph < nH)) throw new Error('profile hour outside the run: ' + ph);
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
        for (let i = 0; i < nn; i++) Sk[i] = TpNow > 0 && bz[i] > 0 ? feddes(hk[i]) * bz[i] * TpNow : 0;  // lagged (Picard)
        // interior
        for (let i = 1; i < N; i++) {
          const Km = Kh[i - 1], Kp = Kh[i];
          a[i] = -Km / (dz * dz); c[i] = -Kp / (dz * dz);
          b[i] = C[i] / dtS + (Km + Kp) / (dz * dz);
          d[i] = C[i] * hk[i] / dtS - (thk[i] - thOld[i]) / dtS - (Kp - Km) / dz - Sk[i];
        }
        // top
        if (mode === 'flux') {
          const w = dz / 2;
          a[0] = 0; c[0] = -Kh[0] / dz;
          b[0] = w * C[0] / dtS + Kh[0] / dz;
          d[0] = qTop - Kh[0] + w * (C[0] * hk[0] - (thk[0] - thOld[0])) / dtS - w * Sk[0];
        } else { a[0] = 0; b[0] = 1; c[0] = 0; d[0] = hTop; }
        // bottom: free drainage
        { const w = dz / 2, Km = Kh[N - 1];
          a[N] = -Km / dz; c[N] = 0;
          b[N] = w * C[N] / dtS + Km / dz;
          d[N] = Km - K[N] + w * (C[N] * hk[N] - (thk[N] - thOld[N])) / dtS - w * Sk[N]; }
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
      const qP = cfg.throughfall * forcing.P_mm[hr] / 10;                 // cm/h reaching the soil
      const pet = cfg.eFactor * forcing.PE_mm[hr] / 10;                   // cm/h
      const qE = (1 - cfg.tFrac) * pet;                                   // potential soil evaporation
      TpNow = cfg.tFrac * pet;                                            // potential transpiration
      const qPot = qP - qE;
      let tIn = 0, hrInf = 0, hrRun = 0, hrDrain = 0, hrT = 0, hrE = 0;
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
        let sT = 0; for (let i = 0; i < nn; i++) sT += Sk[i] * (i === 0 || i === N ? dz / 2 : dz);  // sink used in the accepted solve
        hrT += sT * dtS;
        hrE += (mode === 'head' && hTop !== 0 ? Math.max(0, qP - qTop) : qE) * dtS;
        tIn += dtS; steps++; iters += r.it;
        // adapt from the nominal dt (a step shortened only to hit the hour boundary must not shrink dt)
        const base = dtS < dt ? dt : dtS;
        if (r.it <= cfg.itGrow) dt = Math.min(cfg.dtMax_h, base * 1.3);
        else if (r.it > cfg.itShrink) dt = Math.max(cfg.dtMin_h, base * 0.7);
        else dt = base;
      }
      cumInf += hrInf; cumDrain += hrDrain; cumRunoff += hrRun; cumT += hrT; cumE += hrE;
      qTopH[hr] = hrInf * 10; runoffH[hr] = hrRun * 10; drainH[hr] = hrDrain * 10; transpH[hr] = hrT * 10; evapH[hr] = hrE * 10;
      for (let j = 0; j < outIdx.length; j++) { out[cfg.outDepths_cm[j]][hr] = th[outIdx[j]]; outH[cfg.outDepths_cm[j]][hr] = h[outIdx[j]]; }
      if (profSet.has(hr)) profiles[hr] = { h_cm: Array.from(h), theta: Array.from(th) };
    }
    const S1 = storage();
    // mass balance (cm): storage change must equal net surface flux - drainage - transpiration
    const err = (S1 - S0) - (cumInf - cumDrain - cumT);
    let Ptot = 0; for (let i = 0; i < nH; i++) Ptot += forcing.P_mm[i];
    return {
      theta: out, head_cm: outH, profiles, z_cm: Array.from({ length: nn }, (_, i) => i * dz),
      netSurface_mm: qTopH, runoff_mm: runoffH, drainage_mm: drainH, transp_mm: transpH, evap_mm: evapH,
      massBalance: { rain_mm: Ptot, interception_mm: (1 - cfg.throughfall) * Ptot, dS_mm: (S1 - S0) * 10, netSurface_mm: cumInf * 10,
        drainage_mm: cumDrain * 10, runoff_mm: cumRunoff * 10, transpiration_mm: cumT * 10, evaporation_mm: cumE * 10,
        error_mm: err * 10, relError: Math.abs(err) / Math.max(1e-9, Math.abs(cumInf) + Math.abs(cumDrain) + cumT) },
      stats: { steps, iters, finalH: Array.from(h) }
    };
  }

  /**
   * buildConfig(model, fits, s0_kPa)
   * model.zones: [{ name, zTop_cm, zBot_cm, ret: '15' (key of fits), Ks_cm_h }] covering [0, L_cm]
   * fits: {'15': {theta_r, theta_s, alpha, n}, ...}  (drying fits, alpha in 1/kPa)
   * s0_kPa: observed suction at t0 per sensor depth; initial head interpolated linearly in z,
   *         constant above the shallowest and below the deepest sensor
   */
  function buildConfig(model, fits, s0_kPa) {
    const Z = model.zones;
    if (!(Z.length > 0 && Z[0].zTop_cm === 0 && Z[Z.length - 1].zBot_cm === model.L_cm)) throw new Error('zones must cover [0, L]');
    for (let j = 1; j < Z.length; j++) if (Z[j].zTop_cm !== Z[j - 1].zBot_cm) throw new Error('zones must be contiguous');
    const layers = Z.map(zn => { const f = fits[zn.ret]; if (!f) throw new Error('no retention curve ' + zn.ret);
      return { zTop_cm: zn.zTop_cm, zBot_cm: zn.zBot_cm, tr: f.theta_r, ts: f.theta_s, alpha_per_kPa: f.alpha, n: f.n, Ks_cm_h: zn.Ks_cm_h }; });
    const keys = Object.keys(s0_kPa).sort((x, y) => +x - +y), zs = keys.map(Number);
    const hs = keys.map(k => { const s = s0_kPa[k]; if (!(s > 0)) throw new Error('missing initial suction at ' + k); return -s * CM_PER_KPA; });
    const N = Math.round(model.L_cm / model.dz_cm), h0 = new Array(N + 1);
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

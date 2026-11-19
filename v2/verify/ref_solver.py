"""Independent reference solution of the same boundary-value problem, to check sim/solver.js.
Written separately from the JS code: pressure-head form  C(h) dh/dt = -dq/dz - S, method of lines on a FINE grid,
time integration with scipy BDF (adaptive, tight tolerances) instead of the mixed-form Picard scheme.
Cases (constant forcing, no boundary switching unless stated):
  T1  drying by root uptake only (zero surface flux), layered NV profile, 40 d
  T2  infiltration of constant rain 2 mm/h for 24 h + 72 h redistribution into a dry layered profile
  T3  stage-2 evaporation: surface held at hCrit (Dirichlet), 20 d
Usage: python ref_solver.py ../sim/sim2_results.json ../sim/fits_main.json out_ref.json
"""
import json, sys
import numpy as np
from scipy.integrate import solve_ivp
CM = 10.1972
R = json.load(open(sys.argv[1])); FITS = json.load(open(sys.argv[2]))["NV"]; M = R["sites"]["NV"]["model"]
DZ = 0.25; L = M["L_cm"]; N = int(round(L / DZ)); z = np.arange(N + 1) * DZ
w = np.full(N + 1, DZ); w[0] = w[-1] = DZ / 2
beta = np.deg2rad(M["slope_deg"]); c2 = np.cos(beta) ** 2; hs = M["hs_cm"]; Ss = M["Ss_per_cm"]
# node parameters
par = {k: np.empty(N + 1) for k in ["tr", "ts", "a", "n", "Ks", "Kmac", "hmac"]}
for i, zi in enumerate(z):
    zn = next((q for q in M["zones"] if q["zTop_cm"] <= zi < q["zBot_cm"]), M["zones"][-1]); f = FITS[zn["ret"]]
    par["tr"][i], par["ts"][i], par["a"][i], par["n"][i] = f["theta_r"], f["theta_s"], f["alpha"] / CM, f["n"]
    par["Ks"][i], par["Kmac"][i], par["hmac"][i] = zn["Ks_cm_h"], zn["Kmac_cm_h"], zn["hmac_cm"]
m = 1 - 1 / par["n"]
def SF(h):                                    # S and Mualem F at suction head |h|
    an = (par["a"] * -h) ** par["n"]; return (1 + an) ** -m, 1 - (an / (1 + an)) ** m
S_s, F_s = SF(np.full(N + 1, hs))
def theta(h):
    S, _ = SF(np.minimum(h, hs)); th = par["tr"] + (par["ts"] - par["tr"]) * S
    return np.where(h >= hs, th + Ss * (h - hs), th)
def cap(h):
    hh = np.minimum(h, hs - 1e-12); ah = par["a"] * -hh; an = ah ** par["n"]
    c = (par["ts"] - par["tr"]) * m * par["n"] * par["a"] * (an / ah) * (1 + an) ** -m / (1 + an)
    return np.where(h >= hs, Ss, c)
def cond(h):
    S, F = SF(np.minimum(h, hs)); k = par["Ks"] * np.sqrt(S / S_s) * (F / F_s) ** 2
    return np.where(h >= hs, par["Ks"], k) + par["Kmac"] * np.exp(np.minimum(h, 0) / par["hmac"])
# roots
rz = np.array([r[0] for r in M["roots"]]); rv = np.array([r[1] for r in M["roots"]]); b = np.interp(z, rz, rv); b = b / np.sum(b * w)
F4 = M["feddes_cm"]
def feddes(h):
    return np.where(h > F4[0], 0, np.where(h > F4[1], (F4[0] - h) / (F4[0] - F4[1]), np.where(h >= F4[2], 1.0, np.where(h > F4[3], (h - F4[3]) / (F4[2] - F4[3]), 0.0))))
def rhs_factory(qtop_of_t, Tp, dirichlet=None):
    def rhs(t, y):
        h = y[:-2].copy()                                       # last two states: cumulative surface flux (in) and base drainage
        if dirichlet is not None: h[0] = dirichlet
        K = cond(h); Kh = 0.5 * (K[:-1] + K[1:]) / c2
        q = -Kh * ((h[1:] - h[:-1]) / DZ - c2)                  # flux at i+1/2, per unit horizontal area
        qin = np.empty(N + 1); qout = np.empty(N + 1)
        qin[1:] = q; qout[:-1] = q; qin[0] = qtop_of_t(t); qout[-1] = K[-1]
        dth = (qin - qout) / w - feddes(h) * b * Tp
        dh = dth / cap(h)
        if dirichlet is not None: dh[0] = 0.0; qin[0] = q[0]     # with a fixed surface head the surface flux equals the flux below it
        return np.concatenate([dh, [qin[0], qout[-1]]])
    return rhs
def solve(h0, rhs, t_out, breaks=()):
    out = {}; t0 = 0.0; h = np.concatenate([h0, [0.0, 0.0]]); seg = sorted(set(list(breaks) + [t_out[-1]]))
    for t1 in seg:
        te = [t for t in t_out if t0 < t <= t1]
        sol = solve_ivp(rhs, (t0, t1), h, method="BDF", t_eval=te if te else None, rtol=1e-7, atol=1e-5, lband=1, uband=1, max_step=2.0)
        assert sol.success, sol.message
        for k, t in enumerate(te): out[t] = sol.y[:-2, k]; out[('flux', t)] = sol.y[-2:, k]
        h = sol.y[:, -1] if not te or te[-1] != t1 else sol.y[:, -1]; t0 = t1
    return out
def h_init_from_s0(s0):
    ks = sorted(s0, key=float); zs = np.array([float(k) for k in ks]); hsv = np.array([-s0[k] * CM for k in ks]); return np.interp(z, zs, hsv)
cases = {}
# T1
h0 = h_init_from_s0({"15": 20.0, "30": 30.0, "60": 30.0}); Tp = 0.02
o = solve(h0, rhs_factory(lambda t: 0.0, Tp), [240.0, 480.0, 960.0])
cases["T1"] = {"desc": "root uptake only, Tp = 0.02 cm/h", "s0": {"15": 20.0, "30": 30.0, "60": 30.0}, "hours": [240, 480, 960], "profiles": {str(int(t)): v[::4].tolist() for t, v in o.items() if not isinstance(t, tuple)}, "cum_surface_in_mm": {str(int(t[1])): float(v[0] * 10) for t, v in o.items() if isinstance(t, tuple)}, "cum_drain_mm": {str(int(t[1])): float(v[1] * 10) for t, v in o.items() if isinstance(t, tuple)}}
# T2
h0 = np.full(N + 1, -5000.0)
o = solve(h0, rhs_factory(lambda t: 0.2 if t < 24 else 0.0, 0.0), [12.0, 24.0, 48.0, 96.0], breaks=[24.0])
cases["T2"] = {"desc": "rain 0.2 cm/h for 24 h then redistribution", "h0": -5000.0, "hours": [12, 24, 48, 96], "profiles": {str(int(t)): v[::4].tolist() for t, v in o.items() if not isinstance(t, tuple)}, "cum_surface_in_mm": {str(int(t[1])): float(v[0] * 10) for t, v in o.items() if isinstance(t, tuple)}, "cum_drain_mm": {str(int(t[1])): float(v[1] * 10) for t, v in o.items() if isinstance(t, tuple)}}
assert max(v[0] for t, v in o.items() if not isinstance(t, tuple)) < 0, "T2 ponded: not a pure flux problem"
# T3
h0 = np.full(N + 1, -300.0); h0[0] = M["hCrit_cm"]
o = solve(h0, rhs_factory(lambda t: 0.0, 0.0, dirichlet=M["hCrit_cm"]), [120.0, 480.0])
cases["T3"] = {"desc": "surface at hCrit", "h0": -300.0, "hours": [120, 480], "profiles": {str(int(t)): v[::4].tolist() for t, v in o.items() if not isinstance(t, tuple)}, "cum_surface_in_mm": {str(int(t[1])): float(v[0] * 10) for t, v in o.items() if isinstance(t, tuple)}, "cum_drain_mm": {str(int(t[1])): float(v[1] * 10) for t, v in o.items() if isinstance(t, tuple)}}
json.dump({"dz_ref": DZ, "z_cm": z[::4].tolist(), "cases": cases}, open(sys.argv[3], "w"))
print("reference done", {k: (v["cum_surface_in_mm"], v["cum_drain_mm"]) for k, v in cases.items()})

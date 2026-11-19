"""Main drying curve in terms of effective saturation Se = (theta - theta_r) / (theta_s - theta_r).

For each sensor pair (theta, suction):
  1. drying hours are selected with the same rule as analysis.py (classify);
  2. the MAIN drying curve is taken as the upper envelope of the drying points in the (log10 s, theta) plane:
     in each log10(s) bin the ENV_QUANTILE of theta, then made non-increasing with suction (running maximum
     from the dry end). Drying from the wettest states lies on top of all scanning curves;
  3. van Genuchten (m = 1 - 1/n) is fitted to the envelope -> theta_r, theta_s, alpha, n;  Se follows.
Uncertainty: block bootstrap on drying episodes (contiguous drying runs), N_BOOT resamples.
Shared-shape test: sensors in the same soil layer fitted with common (alpha, n) and own (theta_r, theta_s).
Units: theta [m3/m3], s [kPa], alpha [1/kPa].
Usage: python swcc_main.py meterNV.xlsx meterV.xlsx results_NV.json out.json
"""
import json, sys
import numpy as np, pandas as pd, scipy
from scipy.optimize import curve_fit, least_squares
from analysis import classify, vg

CONFIG = {
    "sites": {"NV": {"file": sys.argv[1], "depths_cm": [15, 30, 60]}, "V": {"file": sys.argv[2], "depths_cm": [15, 35, 60]}},
    "classification_config_from": sys.argv[3],   # same drying rule as the first analysis
    "out": sys.argv[4],
    "s_min_kPa": 1.0,            # below ~1 kPa the TEROS 21 reading is not reliable (accuracy +-(10% + 2 kPa))
    "bin_width_log10": 0.1,
    "bin_min_count": 10,         # hourly drying points per bin
    "env_quantile": 0.95,        # upper envelope (not the maximum: robust to isolated spikes)
    "theta_s_bounds": [0.05, 0.65],   # upper bound = largest laboratory porosity
    "alpha_bounds": [1e-4, 10.0],
    "n_bounds": [1.05, 8.0],
    "n_boot": 300, "seed": 20261116,
    "layer_groups": {"A1": [["NV", 15], ["V", 15]], "A2": [["NV", 30], ["NV", 60], ["V", 35], ["V", 60]]},
    "cloud_every_h": 3,
}

def se_vg(s, alpha, n):
    return (1.0 + (alpha * s) ** n) ** -(1.0 - 1.0 / n)

def envelope(s, th, c):
    b = np.floor(np.log10(s) / c["bin_width_log10"])
    g = pd.DataFrame({"b": b, "s": s, "th": th}).groupby("b")
    a = g.agg(s=("s", "median"), th=("th", lambda v: np.quantile(v, c["env_quantile"])), n=("th", "size"))
    a = a[a.n >= c["bin_min_count"]].sort_index()
    env = np.maximum.accumulate(a.th.values[::-1])[::-1]     # non-increasing with suction
    return a.s.values, env, a.n.values

def fit_vg(xs, ys, c, th_min):
    """th_min = lowest theta observed by the sensor while drying: theta_r cannot exceed it (Se >= 0 for every datum)"""
    lo = [0.0, c["theta_s_bounds"][0], c["alpha_bounds"][0], c["n_bounds"][0]]
    hi = [th_min, c["theta_s_bounds"][1], c["alpha_bounds"][1], c["n_bounds"][1]]
    p0 = [0.5 * th_min, ys.max(), 0.05, 1.5]
    popt, _ = curve_fit(vg, xs, ys, p0=p0, bounds=(lo, hi), maxfev=20000)
    names = ["theta_r", "theta_s", "alpha", "n"]
    at_bound = [nm for nm, v, l, h in zip(names, popt, lo, hi) if np.isclose(v, l, rtol=1e-3, atol=1e-6) or np.isclose(v, h, rtol=1e-3)]
    return dict(zip(names, map(float, popt))), at_bound

def main(c):
    cls = json.load(open(c["classification_config_from"]))["config"]
    rng = np.random.default_rng(c["seed"])
    out = {"config": c, "classification": {k: cls[k] for k in ["resample", "diff_window_h", "dtheta_min", "dlogs_min"]},
           "versions": {"numpy": np.__version__, "pandas": pd.__version__, "scipy": scipy.__version__}, "sensors": {}}
    env_store = {}
    for site, sc in c["sites"].items():
        df = pd.read_excel(sc["file"]).set_index("Time").resample(cls["resample"]).mean()
        for d in sc["depths_cm"]:
            th, s = df[f"VWC {d}"], df[f"s {d}"]
            lab = classify(th, np.log10(s), cls)
            m = (lab == "drying") & th.notna() & s.notna() & (s >= c["s_min_kPa"])
            sd, td = s[m].values, th[m].values
            # drying episodes = runs of consecutive drying hours (for the block bootstrap)
            idx = np.flatnonzero(m.values); ep = np.cumsum(np.r_[1, np.diff(idx) > 1])
            xs, ys, cnt = envelope(sd, td, c)
            assert len(xs) >= 8, f"too few envelope bins at {site} {d}"
            th_min = float(td.min())
            p, at_bound = fit_vg(xs, ys, c, th_min)
            se_env = (ys - p["theta_r"]) / (p["theta_s"] - p["theta_r"])
            res_se = se_env - se_vg(xs, p["alpha"], p["n"])
            # bootstrap
            boot = []
            ids = np.unique(ep)
            for _ in range(c["n_boot"]):
                pick = rng.choice(ids, size=len(ids), replace=True)
                sel = np.concatenate([np.flatnonzero(ep == k) for k in pick])
                bx, by, _n = envelope(sd[sel], td[sel], c)
                if len(bx) < 8: continue          # resample without enough suction range: not a valid replicate
                bp, _ = fit_vg(bx, by, c, th_min); boot.append([bp[k] for k in ["theta_r", "theta_s", "alpha", "n"]])
            boot = np.array(boot); assert len(boot) >= 0.8 * c["n_boot"], "too many failed bootstrap replicates"
            ci = {k: [float(np.percentile(boot[:, j], 2.5)), float(np.percentile(boot[:, j], 97.5))] for j, k in enumerate(["theta_r", "theta_s", "alpha", "n"])}
            sv = np.logspace(0, np.log10(5000), 100)
            thin = slice(None, None, c["cloud_every_h"])
            key = f"{site}_{d}"
            env_store[key] = (xs, ys, p, th_min)
            out["sensors"][key] = {
                "site": site, "depth_cm": d, "n_drying_hours": int(m.sum()), "n_episodes": int(len(ids)),
                "params": p, "params_at_bound": at_bound, "ci95": ci, "n_boot_ok": int(len(boot)),
                "air_entry_kPa_1_over_alpha": 1.0 / p["alpha"],
                "rmse_theta_env": float(np.sqrt(np.mean((ys - vg(xs, **p)) ** 2))), "rmse_Se_env": float(np.sqrt(np.mean(res_se ** 2))),
                "envelope": {"s": xs.round(3).tolist(), "theta": ys.round(4).tolist(), "Se": se_env.round(4).tolist(), "count": cnt.astype(int).tolist()},
                "curve": {"s": sv.round(3).tolist(), "Se": se_vg(sv, p["alpha"], p["n"]).round(4).tolist()},
                "cloud": {"s": sd[thin].round(2).tolist(), "Se": ((td[thin] - p["theta_r"]) / (p["theta_s"] - p["theta_r"])).round(4).tolist()},
                "s_range_env": [float(xs.min()), float(xs.max())], "theta_min_observed": th_min,
            }
            print(key, {k: round(v, 4) for k, v in p.items()}, "bound", at_bound, "rmseSe", round(out["sensors"][key]["rmse_Se_env"], 3),
                  "CI n", [round(x, 2) for x in ci["n"]], "CI alpha", [round(x, 3) for x in ci["alpha"]], "bins", len(xs), "s", xs.min().round(1), xs.max().round(0))
    # shared (alpha, n) per soil layer, own theta_r/theta_s; residuals in Se units of the individual fit (equal weight per sensor)
    out["shared"] = {}
    for layer, members in c["layer_groups"].items():
        keys = [f"{s}_{d}" for s, d in members]
        def resid(x):
            a, n = x[0], x[1]; r = []
            for j, k in enumerate(keys):
                xs, ys, p, _m = env_store[k]; tr, ts = x[2 + 2 * j], x[3 + 2 * j]
                r.append((ys - (tr + (ts - tr) * se_vg(xs, a, n))) / (p["theta_s"] - p["theta_r"]))
            return np.concatenate(r)
        x0 = [0.05, 1.5] + sum([[env_store[k][2]["theta_r"], env_store[k][2]["theta_s"]] for k in keys], [])
        lo = [c["alpha_bounds"][0], c["n_bounds"][0]] + sum([[0.0, c["theta_s_bounds"][0]] for k in keys], [])
        hi = [c["alpha_bounds"][1], c["n_bounds"][1]] + sum([[env_store[k][3], c["theta_s_bounds"][1]] for k in keys], [])
        x0 = [min(max(v, l + 1e-9), h - 1e-9) for v, l, h in zip(x0, lo, hi)]
        r = least_squares(resid, x0, bounds=(lo, hi))
        per = {}
        for j, k in enumerate(keys):
            xs, ys, p, _m = env_store[k]; tr, ts = r.x[2 + 2 * j], r.x[3 + 2 * j]
            rs = (ys - (tr + (ts - tr) * se_vg(xs, r.x[0], r.x[1]))) / (p["theta_s"] - p["theta_r"])
            per[k] = {"theta_r": float(tr), "theta_s": float(ts), "Se_env": ((ys - tr) / (ts - tr)).round(4).tolist(), "theta_r_at_upper_bound": bool(np.isclose(tr, _m, rtol=1e-3)), "rmse_Se_shared": float(np.sqrt(np.mean(rs ** 2))), "rmse_Se_own": out["sensors"][k]["rmse_Se_env"]}
        out["shared"][layer] = {"alpha": float(r.x[0]), "n": float(r.x[1]), "sensors": per}
        print("shared", layer, "alpha", round(r.x[0], 4), "n", round(r.x[1], 3), {k: (round(v["rmse_Se_own"], 3), round(v["rmse_Se_shared"], 3)) for k, v in per.items()})
    json.dump(out, open(c["out"], "w"), separators=(",", ":"), allow_nan=False)

if __name__ == "__main__":
    main(CONFIG)

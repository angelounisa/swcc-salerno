"""SWCC analysis, Salerno METER - No vegetation plot.
Separates drying / wetting branches and fits van Genuchten (Mualem m = 1 - 1/n)
to each branch, at each depth. All choices are in CONFIG and are written to the output.
Units: VWC theta [m3/m3], suction s [kPa], alpha [1/kPa].
"""
import json, sys
import numpy as np, pandas as pd, scipy
from scipy.optimize import curve_fit

CONFIG = {
    "input": sys.argv[1],
    "output": sys.argv[2],
    "depths_cm": [int(x) for x in sys.argv[3].split(",")],   # sensor depths, e.g. 15,30,60 (NV) or 15,35,60 (V)
    "site": sys.argv[4],
    "resample": "1h",                  # hourly means of 5-min data
    "diff_window_h": 24,               # centred difference window to compute trends (slow drying at depth needs >=24 h)
    "dtheta_min": 0.001,               # |dtheta| over window [m3/m3] to call a trend (= sensor resolution)
    "dlogs_min": 0.01,                 # |dlog10 s| over window to call a trend
    "bin_width_log10": 0.1,            # log10(s) bin width for the fit
    "bin_min_count": 3,
    "theta_s_max": 0.55,               # upper bound for theta_s [m3/m3]
    "theta_s_min": 0.05,               # lower bound for theta_s (not tied to observed max: isolated spikes would force it)
    "alpha_bounds": [1e-4, 10.0],      # [1/kPa]
    "n_bounds": [1.05, 8.0],
    "plot_every_h": 2,                 # thinning for the dashboard scatter
}

def vg(s_kpa, theta_r, theta_s, alpha, n):
    m = 1.0 - 1.0 / n
    return theta_r + (theta_s - theta_r) / (1.0 + (alpha * s_kpa) ** n) ** m

def classify(theta, logs, cfg):
    """drying: theta falls AND suction rises; wetting: theta rises AND suction falls.
    Anything else (flat, or opposite signs e.g. thermal artefacts) -> 'undetermined', excluded from fits."""
    h = cfg["diff_window_h"] // 2
    dth = theta.shift(-h) - theta.shift(h)
    dls = logs.shift(-h) - logs.shift(h)
    lab = pd.Series("undetermined", index=theta.index)
    lab[(dth <= -cfg["dtheta_min"]) & (dls >= cfg["dlogs_min"])] = "drying"
    lab[(dth >= cfg["dtheta_min"]) & (dls <= -cfg["dlogs_min"])] = "wetting"
    lab[dth.isna() | dls.isna()] = "undetermined"
    return lab

def fit_branch(s, th, cfg):
    assert (s > 0).all(), "suction must be positive for log binning"
    lb = np.log10(s)
    w = cfg["bin_width_log10"]
    b = np.floor(lb / w)
    g = pd.DataFrame({"b": b, "s": s, "th": th}).groupby("b")
    agg = g.agg(s=("s", "median"), th=("th", "median"), n=("th", "size"))
    agg = agg[agg.n >= cfg["bin_min_count"]]
    assert len(agg) >= 6, f"too few bins ({len(agg)}) to fit 4 parameters"
    xs, ys = agg.s.values, agg.th.values
    lo = [0.0, cfg["theta_s_min"], cfg["alpha_bounds"][0], cfg["n_bounds"][0]]
    hi = [th.min(), cfg["theta_s_max"], cfg["alpha_bounds"][1], cfg["n_bounds"][1]]
    p0 = [0.5 * th.min(), float(np.quantile(th, 0.99)), 0.05, 1.5]
    popt, pcov = curve_fit(vg, xs, ys, p0=p0, bounds=(lo, hi), maxfev=20000)
    perr = np.sqrt(np.diag(pcov))
    def stats(x, y):
        r = y - vg(x, *popt)
        return {"rmse": float(np.sqrt(np.mean(r ** 2))),
                "r2": float(1 - np.sum(r ** 2) / np.sum((y - y.mean()) ** 2)), "n": int(len(y))}
    names = ["theta_r", "theta_s", "alpha", "n"]
    at_bound = [nm for nm, v, l, h in zip(names, popt, lo, hi) if np.isclose(v, l, rtol=1e-3) or np.isclose(v, h, rtol=1e-3)]
    return {
        "params": dict(zip(names, map(float, popt))),
        "stderr": dict(zip(names, map(float, perr))),
        "bounds": {"lower": lo, "upper": hi},
        "params_at_bound": at_bound,
        "air_entry_kPa_1_over_alpha": float(1 / popt[2]),
        "fit_bins": stats(xs, ys), "all_points": stats(s, th),
        "bins": {"s": xs.round(3).tolist(), "theta": ys.round(4).tolist(), "count": agg.n.astype(int).tolist()},
        "s_range": [float(s.min()), float(s.max())], "s_p05_p95": [float(np.percentile(s, 5)), float(np.percentile(s, 95))], "theta_range": [float(th.min()), float(th.max())],
    }

def main(cfg):
    raw = pd.read_excel(cfg["input"])
    assert raw["Time"].is_monotonic_increasing
    df = raw.set_index("Time").resample(cfg["resample"]).mean()
    out = {"config": cfg, "versions": {"numpy": np.__version__, "pandas": pd.__version__, "scipy": scipy.__version__},
           "period": [str(raw.Time.min()), str(raw.Time.max())], "depths": {}}
    for d in cfg["depths_cm"]:
        th, s = df[f"VWC {d}"], df[f"s {d}"]
        ok = th.notna() & s.notna()
        assert ((th[ok] > 0) & (th[ok] < 1)).all(), "VWC out of physical range"
        assert (s[ok] > 0).all()
        lab = classify(th, np.log10(s), cfg)
        lab[~ok] = "undetermined"
        res = {"counts": lab.value_counts().to_dict(), "fits": {}}
        for br in ["drying", "wetting"]:
            m = lab == br
            res["fits"][br] = fit_branch(s[m].values, th[m].values, cfg)
        sv = np.logspace(-1, np.log10(5000), 120)
        res["curve_s"] = sv.round(4).tolist()
        for br in ["drying", "wetting"]:
            res["fits"][br]["curve_theta"] = vg(sv, *res["fits"][br]["params"].values()).round(4).tolist()
        thin = df.index[ok][:: cfg["plot_every_h"]]
        res["points"] = {"t": [x.strftime("%Y-%m-%d %H:%M") for x in thin],
                         "theta": th[thin].round(4).tolist(), "s": s[thin].round(2).tolist(),
                         "branch": lab[thin].tolist()}
        out["depths"][str(d)] = res
        for br in ["drying", "wetting"]:
            f = res["fits"][br]
            print(d, br, res["counts"].get(br), {k: round(v, 4) for k, v in f["params"].items()},
                  "R2bins", round(f["fit_bins"]["r2"], 3), "R2all", round(f["all_points"]["r2"], 3),
                  "rmse_all", round(f["all_points"]["rmse"], 4), "atbound", f["params_at_bound"])
    with open(cfg["output"], "w") as fh:
        json.dump(out, fh)

if __name__ == "__main__":
    main(CONFIG)

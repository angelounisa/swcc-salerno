"""SWCC analysis, Salerno METER - No vegetation plot.
Separates drying / wetting branches and fits van Genuchten (Mualem m = 1 - 1/n)
to each branch, at each depth. All choices are in CONFIG and are written to the output.
Units: VWC theta [m3/m3], suction s [kPa], alpha [1/kPa].
Quality control (hour by hour, written to the output):
  - "extrapolated": calibrated theta outside the range covered by the soil-specific calibration of its layer
    (theta_calibration.json). These hours carry a declared theta uncertainty (CONFIG qc.extrap_uncert_theta).
  - "noneq": theta wetter than the MAIN drying curve of the sensor (swcc_main.json) at the measured suction by more than
    qc.noneq_tol_theta. At equilibrium no state lies above the main drying curve, so these hours are out of equilibrium
    (suction sensor lagging behind a fast wetting front). They are excluded from the wetting fit; the fit with them and
    with other tolerances is reported as sensitivity.
Uncertainty of the parameters: block bootstrap with calendar months as blocks (hourly data are autocorrelated, so the
covariance-matrix errors underestimate the uncertainty; they are kept only as "stderr_cov").
Usage: python analysis.py data.xlsx out.json 15,30,60 SITE_LABEL SITE_KEY swcc_main.json theta_calibration.json
"""
import json, sys
import numpy as np, pandas as pd, scipy
from scipy.optimize import curve_fit

def config_from_argv(argv):
    return {
        "input": argv[1],
        "output": argv[2],
        "depths_cm": [int(x) for x in argv[3].split(",")],   # sensor depths, e.g. 15,30,60 (NV) or 15,35,60 (V)
        "site": argv[4],
        "resample": "1h",                  # hourly means of 5-min data
        "diff_window_h": 24,               # centred difference window to compute trends (slow drying at depth needs >=24 h)
        "dtheta_min": 0.0006,              # |dtheta| over window [m3/m3] to call a trend: one sensor step (0.001 raw) is >= 0.00066 after the soil-specific calibration
        "dlogs_min": 0.01,                 # |dlog10 s| over window to call a trend
        "bin_width_log10": 0.1,            # log10(s) bin width for the fit
        "bin_min_count": 3,
        "theta_s_max": 0.65,               # upper bound for theta_s [m3/m3] (largest laboratory porosity)
        "theta_s_min": 0.05,               # lower bound for theta_s (not tied to observed max: isolated spikes would force it)
        "alpha_bounds": [1e-4, 10.0],      # [1/kPa]
        "n_bounds": [1.05, 8.0],
        "plot_every_h": 2,                 # thinning for the dashboard scatter
        "site_key": argv[5],               # NV or V: key of the sensors in swcc_main.json and theta_calibration.json
        "qc": {"swcc_main": argv[6], "calibration": argv[7],
               "noneq_tol_theta": 0.02,              # [m3/m3] ~ 2 x RMSE of the main drying curves in theta
               "noneq_tol_sensitivity": [0.01, 0.03],
               "extrap_uncert_theta": 0.03,          # [m3/m3] declared uncertainty of theta outside the calibrated range
               "exclude_noneq_from": ["wetting"]},
        "bootstrap": {"block": "calendar month", "n_boot": 300, "seed": 20261117},
        "hysteresis_ref_s_kPa": [1, 3, 10, 30, 100, 300, 1000],
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

def fit_branch(s, th, cfg, with_stats=True):
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
    if not with_stats: return popt
    perr = np.sqrt(np.diag(pcov))
    def stats(x, y):
        r = y - vg(x, *popt)
        return {"rmse": float(np.sqrt(np.mean(r ** 2))),
                "r2": float(1 - np.sum(r ** 2) / np.sum((y - y.mean()) ** 2)), "n": int(len(y))}
    names = ["theta_r", "theta_s", "alpha", "n"]
    at_bound = [nm for nm, v, l, h in zip(names, popt, lo, hi) if np.isclose(v, l, rtol=1e-3) or np.isclose(v, h, rtol=1e-3)]
    return {
        "params": dict(zip(names, map(float, popt))),
        "stderr_cov": dict(zip(names, map(float, perr))),      # underestimated: ignores autocorrelation
        "bounds": {"lower": lo, "upper": hi},
        "params_at_bound": at_bound,
        "air_entry_kPa_1_over_alpha": float(1 / popt[2]),
        "fit_bins": stats(xs, ys), "all_points": stats(s, th),
        "bins": {"s": xs.round(3).tolist(), "theta": ys.round(4).tolist(), "count": agg.n.astype(int).tolist()},
        "s_range": [float(s.min()), float(s.max())], "s_p05_p95": [float(np.percentile(s, 5)), float(np.percentile(s, 95))], "theta_range": [float(th.min()), float(th.max())],
    }

def block_bootstrap(s, th, month, cfg):
    """Resample whole calendar months with replacement and refit. Resamples whose binned data cannot support the fit
    (fewer than 6 bins) or where the optimiser fails are counted and reported, not hidden."""
    B = cfg["bootstrap"]; rng = np.random.default_rng(B["seed"]); months = np.unique(month); idx = {m: np.flatnonzero(month == m) for m in months}
    P = []; failed = 0
    for _ in range(B["n_boot"]):
        pick = np.concatenate([idx[m] for m in rng.choice(months, len(months))])
        try:
            P.append(fit_branch(s[pick], th[pick], cfg, with_stats=False))
        except (AssertionError, RuntimeError):
            failed += 1
    P = np.array(P); names = ["theta_r", "theta_s", "alpha", "n"]
    assert len(P) >= 0.8 * B["n_boot"], f"too many failed bootstrap fits ({failed})"
    ci = {nm: [float(np.percentile(P[:, i], 2.5)), float(np.percentile(P[:, i], 97.5))] for i, nm in enumerate(names)}
    ci["air_entry_kPa"] = [float(np.percentile(1 / P[:, 2], 2.5)), float(np.percentile(1 / P[:, 2], 97.5))]
    return {"ci95": ci, "n_boot_ok": int(len(P)), "n_boot_failed": failed, "n_months": int(len(months))}

def hysteresis_bootstrap(s, th, month, masks, ref_s, cfg):
    """theta_drying(s) - theta_wetting(s) at reference suctions inside the suction range common to both branches
    (between the larger 5th and the smaller 95th percentile). Both branches are refitted on the SAME resampled months."""
    B = cfg["bootstrap"]; rng = np.random.default_rng(B["seed"] + 1)
    lo = max(np.percentile(s[masks[b]], 5) for b in masks); hi = min(np.percentile(s[masks[b]], 95) for b in masks)
    ref = np.array([x for x in ref_s if lo <= x <= hi], float)
    if len(ref) == 0: return {"s_common": [float(lo), float(hi)], "ref_s": [], "dtheta": [], "ci95": [], "n_boot_ok": 0, "n_boot_failed": 0}
    p = {b: fit_branch(s[masks[b]], th[masks[b]], cfg, with_stats=False) for b in masks}
    est = vg(ref, *p["drying"]) - vg(ref, *p["wetting"])
    months = np.unique(month); D = []; failed = 0
    for _ in range(B["n_boot"]):
        pick = np.concatenate([np.flatnonzero(month == m) for m in rng.choice(months, len(months))])
        sel = np.zeros(len(s), bool); cnt = np.bincount(pick, minlength=len(s))
        try:
            q = {}
            for b in masks:
                idx = np.repeat(np.arange(len(s)), cnt * masks[b])
                q[b] = fit_branch(s[idx], th[idx], cfg, with_stats=False)
            D.append(vg(ref, *q["drying"]) - vg(ref, *q["wetting"]))
        except (AssertionError, RuntimeError):
            failed += 1
    D = np.array(D); assert len(D) >= 0.8 * B["n_boot"], f"too many failed bootstrap fits ({failed})"
    return {"s_common": [float(lo), float(hi)], "ref_s": ref.tolist(), "dtheta": est.round(4).tolist(),
            "ci95": [[float(np.percentile(D[:, i], 2.5)), float(np.percentile(D[:, i], 97.5))] for i in range(len(ref))], "n_boot_ok": int(len(D)), "n_boot_failed": failed}

def main(cfg):
    raw = pd.read_excel(cfg["input"])
    assert raw["Time"].is_monotonic_increasing
    df = raw.set_index("Time").resample(cfg["resample"]).mean()
    out = {"config": cfg, "versions": {"numpy": np.__version__, "pandas": pd.__version__, "scipy": scipy.__version__},
           "period": [str(raw.Time.min()), str(raw.Time.max())], "depths": {}}
    SW = json.load(open(cfg["qc"]["swcc_main"])); CAL = json.load(open(cfg["qc"]["calibration"]))
    for d in cfg["depths_cm"]:
        th, s = df[f"VWC {d}"], df[f"s {d}"]
        ok = th.notna() & s.notna()
        assert ((th[ok] > 0) & (th[ok] < 1)).all(), "VWC out of physical range"
        assert (s[ok] > 0).all()
        lab = classify(th, np.log10(s), cfg)
        lab[~ok] = "undetermined"
        key = f"{cfg['site_key']}_{d}"; layer = CAL["config"]["layer_of"][str(d)]
        lo_c, hi_c = CAL["functions"][layer]["theta_cal_range"]
        extrap = ok & ((th < lo_c) | (th > hi_c))
        L = next(v for v in SW["shared"].values() if key in v["sensors"]); q = L["sensors"][key]
        th_main = q["theta_r"] + (q["theta_s"] - q["theta_r"]) * (1 + (L["alpha"] * s) ** L["n"]) ** -(1 - 1 / L["n"])
        excess = th - th_main                        # > 0: wetter than the main drying curve
        noneq = ok & (excess > cfg["qc"]["noneq_tol_theta"])
        month = df.index.to_period("M").astype(str).values
        res = {"counts": lab.value_counts().to_dict(), "fits": {}, "sensitivity": {},
               "qc": {"theta_cal_range": [lo_c, hi_c], "hours_valid": int(ok.sum()), "hours_extrapolated": int(extrap.sum()),
                      "hours_noneq": int(noneq.sum()), "noneq_by_branch": {b: int((noneq & (lab == b)).sum()) for b in ["drying", "wetting", "undetermined"]},
                      "noneq_months": {k: int(v) for k, v in pd.Series(month[noneq.values]).value_counts().sort_index().items()},
                      "noneq_counts_by_tol": {str(t): int((ok & (excess > t)).sum()) for t in [cfg["qc"]["noneq_tol_theta"]] + cfg["qc"]["noneq_tol_sensitivity"]}}}
        for br in ["drying", "wetting"]:
            excl = noneq if br in cfg["qc"]["exclude_noneq_from"] else pd.Series(False, index=lab.index)
            m = (lab == br) & ~excl
            assert m.dtype == bool
            f = fit_branch(s[m].values, th[m].values, cfg)
            f.update(block_bootstrap(s[m].values, th[m].values, month[m.values], cfg))
            f["frac_extrapolated"] = float(extrap[m].mean()); f["n_noneq_excluded"] = int(((lab == br) & noneq).sum()) if br in cfg["qc"]["exclude_noneq_from"] else 0
            f["noneq_tol_theta"] = cfg["qc"]["noneq_tol_theta"] if br in cfg["qc"]["exclude_noneq_from"] else None
            res["fits"][br] = f
        masks = {"drying": ((lab == "drying")).values, "wetting": ((lab == "wetting") & ~noneq).values}
        res["hysteresis"] = hysteresis_bootstrap(s.fillna(1.0).values, th.fillna(0.0).values, month, masks, cfg["hysteresis_ref_s_kPa"], cfg)
        # sensitivity of the wetting fit to the non-equilibrium filter (no filter, other tolerances) and to extrapolated rows
        for name, m in [("wetting_all_points", lab == "wetting")] + [(f"wetting_noneq_tol_{t}", (lab == "wetting") & ~(ok & (excess > t))) for t in cfg["qc"]["noneq_tol_sensitivity"]] + \
                       [("drying_without_extrapolated", (lab == "drying") & ~extrap), ("wetting_without_extrapolated", (lab == "wetting") & ~noneq & ~extrap)]:
            if m.sum() == 0: res["sensitivity"][name] = None; continue
            try:
                f = fit_branch(s[m].values, th[m].values, cfg)
                res["sensitivity"][name] = {"params": f["params"], "params_at_bound": f["params_at_bound"], "n": f["all_points"]["n"], "rmse": f["all_points"]["rmse"]}
            except AssertionError as e:
                res["sensitivity"][name] = {"error": str(e)}
        sv = np.logspace(-1, np.log10(5000), 120)
        res["curve_s"] = sv.round(4).tolist()
        for br in ["drying", "wetting"]:
            res["fits"][br]["curve_theta"] = vg(sv, *res["fits"][br]["params"].values()).round(4).tolist()
        thin = df.index[ok][:: cfg["plot_every_h"]]
        res["points"] = {"t": [x.strftime("%Y-%m-%d %H:%M") for x in thin],
                         "theta": th[thin].round(4).tolist(), "s": s[thin].round(2).tolist(),
                         "branch": lab[thin].tolist(), "extrap": extrap[thin].astype(int).tolist(), "noneq": noneq[thin].astype(int).tolist()}
        out["depths"][str(d)] = res
        for br in ["drying", "wetting"]:
            f = res["fits"][br]
            print(d, br, res["counts"].get(br), {k: round(v, 4) for k, v in f["params"].items()},
                  "R2bins", round(f["fit_bins"]["r2"], 3), "R2all", round(f["all_points"]["r2"], 3),
                  "rmse_all", round(f["all_points"]["rmse"], 4), "atbound", f["params_at_bound"], "ci95", {k: [round(a, 3), round(b, 3)] for k, (a, b) in f["ci95"].items()}, "boot_failed", f["n_boot_failed"])
        print("   hyst", res["hysteresis"]["s_common"], list(zip(res["hysteresis"]["ref_s"], res["hysteresis"]["dtheta"], [[round(a, 3), round(b, 3)] for a, b in res["hysteresis"]["ci95"]])))
        print("   qc", res["qc"]["hours_extrapolated"], "extrap;", res["qc"]["hours_noneq"], "noneq", res["qc"]["noneq_by_branch"])
    with open(cfg["output"], "w") as fh:
        json.dump(out, fh, allow_nan=False)

if __name__ == "__main__":
    main(config_from_argv(sys.argv))

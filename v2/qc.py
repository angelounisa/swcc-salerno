"""Quality-control summary of the measurements and of where the flagged hours enter the results.
 - extrapolated theta (outside the calibrated range of its layer) by sensor and season, with the declared uncertainty
   propagated to the water stored in the instrumented column (0-75 cm) and to the effective saturation;
 - non-equilibrium hours (theta wetter than the main drying curve), from results_*.json;
 - fits with parameters at a bound or with bootstrap intervals spanning the whole admissible range (not identifiable).
Usage: python qc.py NV_cal.xlsx V_cal.xlsx theta_calibration.json swcc_main.json results_NV.json results_V.json compare.json out.json
"""
import json, sys
import numpy as np, pandas as pd
CONFIG = {"extrap_uncert_theta": 0.03, "wet_months": [10, 11, 12, 1, 2, 3, 4],
          "layers_cm": {"NV": {"15": [0, 22.5], "30": [22.5, 45], "60": [45, 75]}, "V": {"15": [0, 25], "35": [25, 47.5], "60": [47.5, 75]}},
          "unidentifiable_ci_ratio": 10.0}     # a bootstrap 95% interval of alpha or n wider than a factor 10 = not identifiable
c = CONFIG
D = {"NV": pd.read_excel(sys.argv[1]).set_index("Time").resample("1h").mean(), "V": pd.read_excel(sys.argv[2]).set_index("Time").resample("1h").mean()}
CAL = json.load(open(sys.argv[3])); SW = json.load(open(sys.argv[4])); R = {"NV": json.load(open(sys.argv[5])), "V": json.load(open(sys.argv[6]))}
r3 = lambda x, k=3: None if (x is None or not np.isfinite(x)) else round(float(x), k)
out = {"config": c, "sensors": [], "storage": {}, "fits": []}
for s, L in c["layers_cm"].items():
    band = pd.Series(0.0, index=D[s].index)
    for d, (z0, z1) in L.items():
        th = D[s][f"VWC {d}"]; ok = th.notna(); rng = CAL["functions"][CAL["config"]["layer_of"][d]]["theta_cal_range"]; lo, hi = rng if rng is not None else (-np.inf, np.inf)   # None: range not supplied
        ex = ok & ((th < lo) | (th > hi)); wet = D[s].index.month.isin(c["wet_months"])
        key = f"{s}_{d}"; Lg = next(v for v in SW["shared"].values() if key in v["sensors"]); q = Lg["sensors"][key]
        band = band + ex * c["extrap_uncert_theta"] * (z1 - z0) * 10.0          # mm
        out["sensors"].append({"site": s, "depth": int(d), "hours_valid": int(ok.sum()), "hours_extrapolated": int(ex.sum()), "frac_extrapolated": r3(ex.sum() / ok.sum(), 4),
                               "frac_extrapolated_wet_season": r3((ex & wet).sum() / (ok & wet).sum(), 4), "frac_extrapolated_dry_season": r3((ex & ~wet).sum() / (ok & ~wet).sum(), 4),
                               "side": None if not ex.any() else "below" if (th[ex] < lo).all() else ("above" if (th[ex] > hi).all() else "both"),
                               "theta_range_extrapolated": [r3(th[ex].min(), 3), r3(th[ex].max(), 3)] if ex.any() else None,
                               "Se_uncert_when_extrapolated": r3(c["extrap_uncert_theta"] / (q["theta_s"] - q["theta_r"]), 3),
                               "noneq": R[s]["depths"][d]["qc"]["hours_noneq"], "noneq_wetting": R[s]["depths"][d]["qc"]["noneq_by_branch"]["wetting"],
                               "noneq_months": R[s]["depths"][d]["qc"]["noneq_months"]})
    S = sum(D[s][f"VWC {d}"] * (z1 - z0) * 10.0 for d, (z0, z1) in L.items())
    okS = S.notna(); out["storage"][s] = {"frac_hours_with_band": r3((band[okS] > 0).mean(), 4), "max_band_mm": r3(band.max(), 1),
                                         "median_band_when_present_mm": r3(band[band > 0].median(), 1) if (band > 0).any() else 0.0,
                                         "wet_season_frac_hours_with_band": r3((band[okS & D[s].index.month.isin(c["wet_months"])] > 0).mean(), 4)}
for s in R:
    for d, v in R[s]["depths"].items():
        for br, f in v["fits"].items():
            lo, hi = f["bounds"]["lower"], f["bounds"]["upper"]; ci = f["ci95"]
            unid = [k for k in ("alpha", "n") if ci[k][0] > 0 and ci[k][1] / ci[k][0] > c["unidentifiable_ci_ratio"]]
            ci_bound = [k for i, k in enumerate(["theta_r", "theta_s", "alpha", "n"]) if np.isclose(ci[k][0], lo[i], rtol=1e-3) and np.isclose(ci[k][1], lo[i], rtol=1e-3) or np.isclose(ci[k][0], hi[i], rtol=1e-3) and np.isclose(ci[k][1], hi[i], rtol=1e-3)]
            out["fits"].append({"site": s, "depth": int(d), "branch": br, "params_at_bound": f["params_at_bound"], "ci_entirely_at_bound": ci_bound,
                                "not_identifiable": unid, "frac_extrapolated": r3(f["frac_extrapolated"], 3), "n_noneq_excluded": f["n_noneq_excluded"],
                                "usable_for_tables": not unid})
json.dump(out, open(sys.argv[8], "w"), indent=1, allow_nan=False)
for x in out["sensors"]: print({k: x[k] for k in ("site", "depth", "hours_extrapolated", "frac_extrapolated", "frac_extrapolated_wet_season", "frac_extrapolated_dry_season", "side", "theta_range_extrapolated", "Se_uncert_when_extrapolated", "noneq", "noneq_wetting")})
print(out["storage"])
for x in out["fits"]: print(x)

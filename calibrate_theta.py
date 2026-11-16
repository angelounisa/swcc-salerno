"""Soil-specific calibration of the TEROS 10 water content, recovered from the calibrated NV file.

dati_NV_cal.xlsx holds calibrated theta for the deforested plot up to 20/02/2026 (three sheets, same rows as the raw
file; its Time column is corrupted by day/month swaps and is NOT used: rows are matched by position, checked on the
suction column, which must be identical to the raw file).
Findings encoded here (asserted at run time):
  * calibrated theta in that file is delayed by LAG_ROWS = 12 rows (1 h) with respect to the raw theta and to suction;
  * after removing the lag, calibrated theta is a smooth function of the sensor output in mV (raw theta inverted with
    the METER mineral-soil equation), one function for 15 cm (layer A1) and one common to 30 and 60 cm (layer A2).
The two functions are fitted (polynomials in mV) and applied to the FULL raw series of both plots:
  15 cm -> A1 ; 30/35/60 cm -> A2.   Applying them to the wooded plot assumes the same soils and sensors.
Usage: python calibrate_theta.py raw_NV.xlsx raw_V.xlsx dati_NV_cal.xlsx out_NV.xlsx out_V.xlsx out_calibration.json
"""
import json, sys
import numpy as np, pandas as pd
CONFIG = {"lag_rows": 12, "deg": {"A1": 3, "A2": 2}, "layer_of": {"15": "A1", "30": "A2", "35": "A2", "60": "A2"},
          "meter_mineral_theta_of_mV": [4.824e-10, -2.278e-6, 3.898e-3, -2.154],     # TEROS 10 manual, mineral soil
          "max_rmse": 0.002, "edge_skip_rows": 40}
c = CONFIG
MV = np.linspace(800.0, 2600.0, 180001); TH_MIN = np.polyval(c["meter_mineral_theta_of_mV"], MV)
assert np.all(np.diff(TH_MIN) > 0), "mineral calibration not monotonic on the mV grid"
to_mV = lambda th: np.interp(th, TH_MIN, MV, left=np.nan, right=np.nan)

raw = {"NV": pd.read_excel(sys.argv[1]), "V": pd.read_excel(sys.argv[2])}
pairs = {"A1": [], "A2": []}; n_cal = None; per_depth = {}
for d in (15, 30, 60):
    cal = pd.read_excel(sys.argv[3], sheet_name=f"{d} cm"); n = len(cal); n_cal = n
    assert np.allclose(cal[f"psi_{d}"].values, raw["NV"][f"s {d}"].values[:n], equal_nan=True), "suction columns differ: rows are not aligned"
    i = np.arange(c["edge_skip_rows"], n - c["edge_skip_rows"])
    x = to_mV(raw["NV"][f"VWC {d}"].values[i - c["lag_rows"]]); y = cal[f"theta_{d}"].values[i]
    m = np.isfinite(x) & np.isfinite(y)
    x0 = to_mV(raw["NV"][f"VWC {d}"].values[i]); m0 = np.isfinite(x0) & np.isfinite(y)
    lay = c["layer_of"][str(d)]; pairs[lay].append((x[m], y[m]))
    r_lag = y[m] - np.polyval(np.polyfit(x[m], y[m], 3), x[m]); r_0 = y[m0] - np.polyval(np.polyfit(x0[m0], y[m0], 3), x0[m0])
    per_depth[str(d)] = {"rmse_with_lag": float(np.sqrt(np.mean(r_lag ** 2))), "rmse_without_lag": float(np.sqrt(np.mean(r_0 ** 2)))}
    assert per_depth[str(d)]["rmse_with_lag"] < 0.6 * per_depth[str(d)]["rmse_without_lag"], "the 1 h lag is not confirmed"
coef = {}; info = {}
for lay, pr in pairs.items():
    x = np.concatenate([p[0] for p in pr]); y = np.concatenate([p[1] for p in pr])
    p = np.polyfit(x, y, c["deg"][lay]); r = y - np.polyval(p, x); rmse = float(np.sqrt(np.mean(r ** 2)))
    assert rmse < c["max_rmse"], f"calibration function for {lay} does not reproduce the calibrated file (rmse {rmse})"
    assert np.all(np.diff(np.polyval(p, np.linspace(x.min(), x.max(), 500))) > 0), "fitted calibration not monotonic"
    coef[lay] = p; info[lay] = {"poly_in_mV_highest_first": [float(v) for v in p], "rmse": rmse, "p99_abs_res": float(np.quantile(np.abs(r), 0.99)),
                                "mV_range": [float(x.min()), float(x.max())], "theta_cal_range": [float(y.min()), float(y.max())], "n_pairs": int(len(x))}
out = {"config": c, "n_rows_calibrated_file": int(n_cal), "calibrated_file_last_time": str(raw["NV"].Time.iloc[n_cal - 1]), "lag_check": per_depth, "functions": info, "applied": {}}
for site, path in (("NV", sys.argv[4]), ("V", sys.argv[5])):
    df = raw[site].copy()                                     # raw data are not modified
    for col in [k for k in df.columns if k.startswith("VWC ")]:
        d = col.split()[1]; lay = c["layer_of"][d]; mv = to_mV(df[col].values)
        assert np.isfinite(mv[np.isfinite(df[col].values)]).all(), "raw theta outside the mV inversion grid"
        lo, hi = info[lay]["mV_range"]; ext = (mv < lo) | (mv > hi)
        df[col] = np.polyval(coef[lay], mv)
        out["applied"][f"{site}_{d}"] = {"layer": lay, "raw_range": [float(raw[site][col].min()), float(raw[site][col].max())], "cal_range": [float(df[col].min()), float(df[col].max())],
                                         "rows_extrapolated": int(np.nansum(ext)), "frac_extrapolated": float(np.nansum(ext) / np.isfinite(mv).sum()),
                                         "max_extrapolation_mV": float(max(0.0, lo - np.nanmin(mv), np.nanmax(mv) - hi))}
        print(site, d, lay, out["applied"][f"{site}_{d}"])
    df.to_csv(path, index=False)
json.dump(out, open(sys.argv[6], "w"), indent=1, allow_nan=False)
print(json.dumps(info, indent=0)); print(per_depth)

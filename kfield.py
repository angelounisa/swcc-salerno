"""Unsaturated hydraulic conductivity from the field sensors, without any evapotranspiration estimate
(instantaneous profile method applied to rain-free NIGHTS, when the surface flux is taken as zero).

For a control plane at depth z* between two sensors:
    q(z*) = - d/dt [ storage above z* ]            (zero flux at the surface: no rain, night)
    K     = q / i ,   i = 1 - (dh/dz) / cos(beta)^2    (infinite slope of angle beta; z = vertical depth, positive downward;
                                                     q per unit horizontal area; h = -s * 10.1972 cm; beta = 0: vertical column)
Storage above z* uses the theta sensors above the plane, each representing its own layer.
K is attached to the geometric-mean suction of the two sensors bracketing the plane.
Only nights with downward flow (i > I_MIN) and a storage loss above the sensor resolution are kept.
Then Ks of layer A2 is the value that scales the Mualem-van Genuchten relative conductivity (shared A2 shape
from swcc_main.json, with the same air-entry modification used by the solver) onto the K points.
Usage: python kfield.py rain.xlsx meterNV.xlsx meterV.xlsx swcc_main.json out.json SLOPE_DEG
"""
import json, sys
import numpy as np, pandas as pd
CM_PER_KPA = 10.1972
CONFIG = {
    "slope_deg": float(sys.argv[6]),
    "night_start_h": 20, "night_end_h": 6,      # local logger time
    "edge_avg_h": 3,                            # theta averaged over 3 h around the two ends of the night
    "dry_hours_before": 12,                     # no rain in the 12 h before the night and during it
    "i_min": 0.3,                               # minimum downward hydraulic gradient
    "dtheta_mean_min": 0.0006,                  # mean theta drop above the plane [m3/m3]: one sensor step in calibrated units
    "s_max_kPa": 300.0,                         # both bracketing suctions below this (wet range, gradient reliable)
    "hs_cm": -2.0,
    "planes": {"NV": [{"name": "22.5 cm", "z": 22.5, "above": [[15, 22.5]], "bracket": [15, 30]},
                      {"name": "45 cm", "z": 45.0, "above": [[15, 22.5], [30, 22.5]], "bracket": [30, 60]}],
               "V": [{"name": "25 cm", "z": 25.0, "above": [[15, 25.0]], "bracket": [15, 35]},
                     {"name": "47.5 cm", "z": 47.5, "above": [[15, 25.0], [35, 22.5]], "bracket": [35, 60]}]},
}
rain = pd.read_excel(sys.argv[1]).set_index("Data_fine_ora")["P_unificata_mm"]
met = {"NV": pd.read_excel(sys.argv[2]).set_index("Time").resample("1h").mean(), "V": pd.read_excel(sys.argv[3]).set_index("Time").resample("1h").mean()}
SW = json.load(open(sys.argv[4])); A2 = SW["shared"]["A2"]
def kr_mualem(s_kpa, alpha, n, hs_cm):
    m = 1 - 1 / n
    def SF(h_cm):
        an = (alpha / CM_PER_KPA * h_cm) ** n; return (1 + an) ** -m, 1 - (an / (1 + an)) ** m
    S, F = SF(s_kpa * CM_PER_KPA); Ss, Fs = SF(-hs_cm)
    return np.sqrt(S / Ss) * (F / Fs) ** 2
c = CONFIG; out = {"config": c, "planes": {}, "A2_shape": {"alpha": A2["alpha"], "n": A2["n"]}}
allK = []
for site, df in met.items():
    days = pd.date_range(df.index.min().normalize(), df.index.max().normalize(), freq="1D")
    for pl in c["planes"][site]:
        rows = []
        for d in days:
            ta = d + pd.Timedelta(hours=c["night_start_h"]); tb = d + pd.Timedelta(days=1, hours=c["night_end_h"])
            r = rain[ta - pd.Timedelta(hours=c["dry_hours_before"]): tb]
            if len(r) == 0 or r.isna().any() or r.sum() > 0: continue
            h = c["edge_avg_h"] // 2
            A = df[ta - pd.Timedelta(hours=h): ta + pd.Timedelta(hours=h)]; B = df[tb - pd.Timedelta(hours=h): tb + pd.Timedelta(hours=h)]
            N = df[ta:tb]
            cols = [f"VWC {k}" for k, _ in pl["above"]] + [f"s {k}" for k in pl["bracket"]]
            if len(A) < c["edge_avg_h"] or len(B) < c["edge_avg_h"] or A[cols].isna().any().any() or B[cols].isna().any().any() or N[cols].isna().any().any(): continue
            dS = sum((B[f"VWC {k}"].mean() - A[f"VWC {k}"].mean()) * dz for k, dz in pl["above"])     # cm
            dt = (tb - ta) / pd.Timedelta("1h")
            q = -dS / dt                                                                              # cm/h, downward
            s_up, s_lo = N[f"s {pl['bracket'][0]}"].mean(), N[f"s {pl['bracket'][1]}"].mean()
            i = 1 - (-s_lo * CM_PER_KPA - (-s_up * CM_PER_KPA)) / (pl["bracket"][1] - pl["bracket"][0]) / np.cos(np.deg2rad(c["slope_deg"])) ** 2
            if not (i > c["i_min"] and -dS >= c["dtheta_mean_min"] * pl["z"] and max(s_up, s_lo) <= c["s_max_kPa"]): continue
            rows.append({"date": str(d.date()), "q_cm_h": q, "i": i, "K_cm_h": q / i, "s_kPa": float(np.sqrt(s_up * s_lo)), "s_up": s_up, "s_lo": s_lo})
        R = pd.DataFrame(rows)
        assert len(R) >= 5, f"too few nights for {site} {pl['name']}"
        kr = kr_mualem(R.s_kPa.values, A2["alpha"], A2["n"], c["hs_cm"])
        lr = np.log10(R.K_cm_h.values) - np.log10(kr)
        slope, icpt = np.polyfit(np.log10(kr), np.log10(R.K_cm_h.values), 1)
        res = {"n_nights": int(len(R)), "Ks_cm_h_median": float(10 ** np.median(lr)), "Ks_cm_h_q25_q75": [float(10 ** np.percentile(lr, 25)), float(10 ** np.percentile(lr, 75))],
               "loglog_slope_vs_Mualem": float(slope), "s_range_kPa": [float(R.s_kPa.min()), float(R.s_kPa.max())],
               "points": {"date": R.date.tolist(), "s_kPa": R.s_kPa.round(2).tolist(), "K_cm_h": [float(f"{v:.4g}") for v in R.K_cm_h], "i": R.i.round(2).tolist()}}
        out["planes"][f"{site} {pl['name']}"] = res; allK.append(lr)
        print(site, pl["name"], "nights", len(R), "Ks median %.3g cm/h" % res["Ks_cm_h_median"], "IQR", [round(x, 3) for x in res["Ks_cm_h_q25_q75"]],
              "slope", round(slope, 2), "s range", [round(x, 1) for x in res["s_range_kPa"]], "months", sorted(set(pd.to_datetime(R.date).dt.month)))
lr = np.concatenate(allK)
out["Ks_A2_cm_h"] = {"median_all": float(10 ** np.median(lr)), "q25_q75": [float(10 ** np.percentile(lr, 25)), float(10 ** np.percentile(lr, 75))], "n": int(len(lr))}
print("A2 Ks all planes: median %.3g cm/h" % out["Ks_A2_cm_h"]["median_all"], out["Ks_A2_cm_h"]["q25_q75"])
json.dump(out, open(sys.argv[5], "w"), separators=(",", ":"), allow_nan=False)

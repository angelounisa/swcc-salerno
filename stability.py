"""Infinite-slope factor of safety from the MEASURED suction and water content (no simulation).

Slip surface parallel to the slope at the vertical depth z of each sensor:
    FS = [ c' + (W cos^2(beta) + chi * s) tan(phi') ] / ( W sin(beta) cos(beta) )
       = tan(phi')/tan(beta) + (c' + chi * s * tan(phi')) / (W sin(beta) cos(beta))
  W    = weight of the soil column above z per unit horizontal area = sum over layers of (gamma_d + theta * gamma_w) dz,
         with the measured theta of the sensor representing each layer (A1 0-20 cm, then A2)
  s    = measured matric suction [kPa] (TEROS 21 does not measure positive pore pressure: s >= 0.1 kPa)
  chi  = Bishop's effective-stress parameter:  "Se"   -> measured effective saturation of the sensor (theta_r, theta_s of the main drying curve),
                                               "Sr"   -> degree of saturation theta / n with the laboratory porosity,
                                               "SeVG" -> effective saturation of the layer's main drying curve at the measured suction
                                                         (no theta; overestimates chi on wetting paths because of hysteresis)
  Hours in which the measured Se is below se_min_valid are not evaluated: theta_r is the lowest theta observed by the sensor, so
  Se -> 0 and chi*s -> 0 there by construction, whatever the suction (it would give FS = friction limit in the driest weeks).
Soil parameters: Urciuoli et al. Table 1 (gamma_d, n, phi'); c' = 0; beta from the ALERT 2025 slides (32 deg; 25-30 deg and
locally > 35 deg in Urciuoli et al.). Root reinforcement is not included (no data).
Usage: python stability.py NV_cal.xlsx V_cal.xlsx swcc_main.json sim/infiltration_events.json out.json
"""
import json, sys
import numpy as np, pandas as pd
CONFIG = {
    "beta_deg": 28.0, "beta_sensitivity_deg": [25.0, 28.0, 32.0], "chi_models": ["Se", "Sr", "SeVG"], "se_min_valid": 0.05,
    "c_kPa": 0.0, "gamma_w": 9.81,
    "soil": {"A1": {"gamma_d": 9.30, "n": 0.65, "phi_deg": 38.5}, "A2": {"gamma_d": 10.80, "n": 0.59, "phi_deg": 38.5}},
    "A1_thickness_cm": 20.0,
    "pairs": [[15, 15], [30, 35], [60, 60]],
    "fs_thresholds": [1.75, 2.0, 3.0], "suction_stress_thresholds_kPa": [0.5, 2.0, 5.0], "sensor_accuracy_kPa": 2.0, "wet_months": [10, 11, 12, 1, 2, 3, 4],
    "event_after_h": 24, "plot_every_h": 2,
}
c = CONFIG
D = {"NV": pd.read_excel(sys.argv[1]).set_index("Time").resample("1h").mean(), "V": pd.read_excel(sys.argv[2]).set_index("Time").resample("1h").mean()}
SW = json.load(open(sys.argv[3])); EV = json.load(open(sys.argv[4]))
DEPTHS = {"NV": [15, 30, 60], "V": [15, 35, 60]}
lay = lambda d: "A1" if d == 15 else "A2"
def column_weight(site, d):
    """kPa: weight above depth d [cm]; theta of the 15 cm sensor for A1 (0-20 cm), of the mid sensor down to the midpoint
    between mid and deep sensors, of the deep sensor below."""
    ds = DEPTHS[site]; mid = (ds[1] + ds[2]) / 2
    segs = [(0, c["A1_thickness_cm"], "A1", ds[0]), (c["A1_thickness_cm"], mid, "A2", ds[1]), (mid, 1e9, "A2", ds[2])]
    W = 0
    for a, b, L, sd in segs:
        t = max(0.0, min(d, b) - a) / 100.0
        if t > 0:
            th = D[site][f"VWC {sd}"]
            if sd != d:       # gap of a sensor ABOVE the slip surface (theta at 15 cm in the vegetated plot, 31/01-04/03/2026): its wet-season
                th = th.fillna(th[th.index.month.isin(c["wet_months"])].median())      # median is used for the weight only (changes W by a few %)
            W = W + (c["soil"][L]["gamma_d"] + th * c["gamma_w"]) * t
    return W
def se_measured(site, d):
    p = SW["shared"][lay(d)]["sensors"][f"{site}_{d}"]; return (D[site][f"VWC {d}"] - p["theta_r"]) / (p["theta_s"] - p["theta_r"])
def chi(site, d, model):
    if model == "Se":
        x = se_measured(site, d)
    elif model == "Sr":
        x = D[site][f"VWC {d}"] / c["soil"][lay(d)]["n"]
    elif model == "SeVG":
        L = SW["shared"][lay(d)]; x = (1 + (L["alpha"] * D[site][f"s {d}"]) ** L["n"]) ** (-(1 - 1 / L["n"]))
    else: raise ValueError(model)
    return x.clip(0, 1)
VALID = {}
def fs(site, d, beta_deg, model):
    b = np.deg2rad(beta_deg); phi = np.deg2rad(c["soil"][lay(d)]["phi_deg"]); W = column_weight(site, d); s = D[site][f"s {d}"]
    f = np.tan(phi) / np.tan(b) + (c["c_kPa"] + chi(site, d, model) * s * np.tan(phi)) / (W * np.sin(b) * np.cos(b))
    return f.where(VALID[(site, d)])
for s_ in D:
    for d_ in DEPTHS[s_]: VALID[(s_, d_)] = se_measured(s_, d_) >= c["se_min_valid"]
idx = D["NV"].index.intersection(D["V"].index); thin = idx[:: c["plot_every_h"]]
r3 = lambda x, k=3: None if (x is None or not np.isfinite(x)) else round(float(x), k)
out = {"config": c, "fs_dry_limit": {L: float(np.tan(np.deg2rad(v["phi_deg"])) / np.tan(np.deg2rad(c["beta_deg"]))) for L, v in c["soil"].items()},
       "series": {"t": [t.strftime("%Y-%m-%d %H:%M") for t in thin]}, "pairs": [], "events": [], "sensitivity": []}
F = {(s, d): fs(s, d, c["beta_deg"], "Se") for s in D for d in DEPTHS[s]}
for (s, d), f in F.items():
    out["series"][f"FS_{s}_{d}"] = [r3(x, 2) for x in f.reindex(thin).values]
    out["series"][f"sig_{s}_{d}"] = [r3(x, 2) for x in (chi(s, d, "Se") * D[s][f"s {d}"]).where(VALID[(s, d)]).reindex(thin).values]     # suction stress chi*s [kPa]
probs = np.arange(0, 100.5, 1.0); mon = idx.month
def stats(x):
    return {"min": r3(x.min(), 2), "p1": r3(np.percentile(x, 1), 2), "p5": r3(np.percentile(x, 5), 2), "median": r3(np.median(x), 2),
            "frac_below": {str(t): r3((x < t).mean(), 4) for t in c["fs_thresholds"]}}
for a, b in c["pairs"]:
    fa, fb = F[("NV", a)].reindex(idx), F[("V", b)].reindex(idx); ok = fa.notna() & fb.notna()
    P = {"NV_depth": a, "V_depth": b, "n_hours_common": int(ok.sum()),
         "column_weight_kPa": {"NV": r3(column_weight("NV", a).reindex(idx)[ok].median(), 2), "V": r3(column_weight("V", b).reindex(idx)[ok].median(), 2)},
         "duration": {"exceedance_pct": probs.tolist(), "NV": [r3(x, 2) for x in np.percentile(fa[ok], 100 - probs)], "V": [r3(x, 2) for x in np.percentile(fb[ok], 100 - probs)]}, "stats": {}}
    ga, gb = (chi("NV", a, "Se") * D["NV"][f"s {a}"]).reindex(idx), (chi("V", b, "Se") * D["V"][f"s {b}"]).reindex(idx)      # suction stress chi*s [kPa]
    meas = (D["NV"][f"s {a}"].notna() & D["NV"][f"VWC {a}"].notna()).reindex(idx).values & (D["V"][f"s {b}"].notna() & D["V"][f"VWC {b}"].notna()).reindex(idx).values
    bb = np.deg2rad(c["beta_deg"]); tphi = np.tan(np.deg2rad(c["soil"][lay(a)]["phi_deg"]))
    # change of FS for a change of suction stress equal to the accuracy of the suction sensor near saturation
    P["dFS_for_sensor_accuracy"] = {s_: r3(c["sensor_accuracy_kPa"] * tphi / (P["column_weight_kPa"][s_] * np.sin(bb) * np.cos(bb)), 2) for s_ in ("NV", "V")}
    for name, sel in (("all", np.ones(len(idx), bool)), ("wet", np.isin(mon, c["wet_months"]))):
        m = ok.values & sel
        P["stats"][name] = {"n_hours": int(m.sum()), "n_hours_not_evaluated": int((meas & sel).sum() - m.sum()), "NV": stats(fa.values[m]), "V": stats(fb.values[m]), "frac_V_higher": r3((fb.values[m] > fa.values[m]).mean(), 3)}
        for s_, g in (("NV", ga), ("V", gb)):
            P["stats"][name][s_]["suction_stress_median_kPa"] = r3(np.median(g.values[m]), 2); P["stats"][name][s_]["suction_stress_min_kPa"] = r3(g.values[m].min(), 2)
            P["stats"][name][s_]["frac_suction_stress_below"] = {f"{t:.1f}": r3((g.values[m] < t).mean(), 4) for t in c["suction_stress_thresholds_kPa"]}
    out["pairs"].append(P)
for e in EV["events"]:
    t0 = pd.Timestamp(e["start"]) - pd.Timedelta("1h"); t1 = pd.Timestamp(e["end"]) + pd.Timedelta(hours=c["event_after_h"]); row = {"start": e["start"], "P_mm": e["P_mm"]}
    for (s, d), f in F.items():
        w = f[t0:t1]; raw = (D[s][f"s {d}"].notna() & D[s][f"VWC {d}"].notna())[t0:t1]       # no gaps in the measurements; minimum over the evaluated hours
        row[f"{s}_{d}"] = r3(w.min(), 2) if len(w) and raw.all() and w.notna().any() else None
    out["events"].append(row)
out["event_pairs"] = []
for a, b in c["pairs"]:
    both = [x for x in out["events"] if x[f"NV_{a}"] is not None and x[f"V_{b}"] is not None]
    out["event_pairs"].append({"NV_depth": a, "V_depth": b, "n_both": len(both), "n_V_higher": sum(x[f"V_{b}"] > x[f"NV_{a}"] for x in both),
                               "median_NV": r3(np.median([x[f"NV_{a}"] for x in both]), 2), "median_V": r3(np.median([x[f"V_{b}"] for x in both]), 2),
                               "n_below_thr_NV": sum(x[f"NV_{a}"] < c["fs_thresholds"][0] for x in both), "n_below_thr_V": sum(x[f"V_{b}"] < c["fs_thresholds"][0] for x in both), "thr": c["fs_thresholds"][0]})
for beta in c["beta_sensitivity_deg"]:
    for model in c["chi_models"]:
        row = {"beta_deg": beta, "chi": model, "fs_limit": r3(np.tan(np.deg2rad(c["soil"]["A2"]["phi_deg"])) / np.tan(np.deg2rad(beta)), 3), "pairs": []}
        for a, b in c["pairs"]:
            fa, fb = fs("NV", a, beta, model).reindex(idx), fs("V", b, beta, model).reindex(idx); ok = (fa.notna() & fb.notna()).values & np.isin(mon, c["wet_months"])
            row["pairs"].append({"NV_depth": a, "V_depth": b, "NV": stats(fa.values[ok]), "V": stats(fb.values[ok])})
        out["sensitivity"].append(row)
json.dump(out, open(sys.argv[5], "w"), separators=(",", ":"), allow_nan=False)
print("FS limit (s=0):", out["fs_dry_limit"])
for P in out["pairs"]:
    w = P["stats"]["wet"]; print(f"{P['NV_depth']}/{P['V_depth']} wet: min NV {w['NV']['min']} V {w['V']['min']} | p5 {w['NV']['p5']} {w['V']['p5']} | median {w['NV']['median']} {w['V']['median']} | <1.75 {w['NV']['frac_below']['1.75']} {w['V']['frac_below']['1.75']} | <2 {w['NV']['frac_below']['2.0']} {w['V']['frac_below']['2.0']} | V higher {w['frac_V_higher']} | W {P['column_weight_kPa']}")
print("event pairs", out["event_pairs"])
for r in out["sensitivity"]: print(r["beta_deg"], r["chi"], r["fs_limit"], [(p["NV"]["frac_below"]["1.75"], p["V"]["frac_below"]["1.75"], p["NV"]["p5"], p["V"]["p5"]) for p in r["pairs"]])

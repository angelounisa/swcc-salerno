"""Data-only comparison of the wooded (V) and deforested (NV) plots. No simulation.

Inputs: calibrated theta + suction of both plots, hourly rain, soil temperature of both plots, air temperature/RH from
the ALERT 2025 slides, the main drying curves (swcc_main.json, for sensor theta_r / theta_s) and the rain events
(sim/infiltration_events.json). All series are hourly means of the 5-min data.
Se = (theta - theta_r) / (theta_s - theta_r) with the theta_r, theta_s of each sensor from the main drying curve.
Sensor pairs compared: 15/15 cm, 30/35 cm, 60/60 cm (NV/V).

Analyses
 1 paired series (Se, suction) and storage of the instrumented column 0-75 cm
 2 suction duration curves on the hours when both sensors of a pair have data
 3 response to each rain event: rise of theta/Se, minimum suction, delay of the response
 4 rain-free spells: storage loss rate of the column (evapotranspiration + net drainage below 75 cm, not separable from data alone)
 5 sign of the vertical hydraulic gradient between sensors (direction of the vertical flow component)
 6 soil temperature at 15 cm (monthly mean and daily range) and air temperature / humidity in the open and under canopy
Usage: python compare_plots.py NV_cal.xlsx V_cal.xlsx rain.xlsx tempNV.xlsx tempV.xlsx air.csv swcc_main.json sim/infiltration_events.json out.json
"""
import json, sys
import numpy as np, pandas as pd

CONFIG = {
    "pairs": [[15, 15], [30, 35], [60, 60]],
    "layers_cm": {"NV": {"15": [0, 22.5], "30": [22.5, 45], "60": [45, 75]}, "V": {"15": [0, 25], "35": [25, 47.5], "60": [47.5, 75]}},   # as in infil_events.py
    "wet_months": [10, 11, 12, 1, 2, 3, 4], "dry_months": [5, 6, 7, 8, 9],
    "suction_thresholds_kPa": [5, 10, 30, 100, 1000],
    "event_after_h": 24, "event_baseline_h": 3,
    "response_dtheta": 0.005,            # rise of calibrated theta that counts as a response (about 5 sensor steps)
    "spell_min_dry_h": 72, "spell_skip_h": 48, "spell_min_len_h": 48,
    "plot_every_h": 2, "cm_per_kPa": 10.1972,
}
c = CONFIG
nv = pd.read_excel(sys.argv[1]).set_index("Time").resample("1h").mean()
v = pd.read_excel(sys.argv[2]).set_index("Time").resample("1h").mean()
rain = pd.read_excel(sys.argv[3]).set_index("Data_fine_ora")["P_unificata_mm"]
tnv = pd.read_excel(sys.argv[4]).set_index("Time"); tv = pd.read_excel(sys.argv[5]).set_index("Time")
air = pd.read_csv(sys.argv[6], parse_dates=["Time"]).set_index("Time")
SW = json.load(open(sys.argv[7])); EV = json.load(open(sys.argv[8]))
D = {"NV": nv, "V": v}
def sens(site, d):
    lay = "A1" if d == 15 else "A2"; p = SW["shared"][lay]["sensors"][f"{site}_{d}"]; return p["theta_r"], p["theta_s"]
def Se(site, d):
    tr, ts = sens(site, d); return (D[site][f"VWC {d}"] - tr) / (ts - tr)
def storage(site):      # mm, NaN when a sensor is missing
    return sum(D[site][f"VWC {k}"] * (b - a) * 10 for k, (a, b) in c["layers_cm"][site].items())
idx = nv.index.intersection(v.index)
out = {"config": c, "period": [str(idx.min()), str(idx.max())], "rain_period": [str(rain.index.min()), str(rain.index.max())], "pairs": []}
r3 = lambda x, k=3: None if (x is None or not np.isfinite(x)) else round(float(x), k)

# ---------- 1 series
thin = idx[:: c["plot_every_h"]]
out["series"] = {"t": [t.strftime("%Y-%m-%d %H:%M") for t in thin]}
for site, depths in (("NV", [15, 30, 60]), ("V", [15, 35, 60])):
    for d in depths:
        out["series"][f"Se_{site}_{d}"] = [r3(x) for x in Se(site, d).reindex(thin).values]
        out["series"][f"th_{site}_{d}"] = [r3(x) for x in D[site][f"VWC {d}"].reindex(thin).values]
        out["series"][f"s_{site}_{d}"] = [r3(x, 1) for x in D[site][f"s {d}"].reindex(thin).values]
S = {s: storage(s) for s in D}
sd = pd.concat({s: S[s].resample("1D").mean() for s in S}, axis=1)
out["storage_daily"] = {"t": [t.strftime("%Y-%m-%d") for t in sd.index], "NV": [r3(x, 1) for x in sd["NV"].values], "V": [r3(x, 1) for x in sd["V"].values]}
rd = rain.fillna(0).resample("1D").sum()
out["rain_daily"] = {"t": [t.strftime("%Y-%m-%d") for t in rd.index], "mm": [r3(x, 1) for x in rd.values]}

# ---------- 2 duration curves and suction statistics
probs = np.arange(0, 100.5, 1.0)
for a, b in c["pairs"]:
    sa, sb = nv[f"s {a}"].reindex(idx), v[f"s {b}"].reindex(idx)
    ok = sa.notna() & sb.notna() & nv[f"VWC {a}"].reindex(idx).notna() & v[f"VWC {b}"].reindex(idx).notna()
    P = {"NV_depth": a, "V_depth": b, "n_hours_common": int(ok.sum()), "duration": {"exceedance_pct": probs.tolist(),
         "NV": [r3(x, 2) for x in np.percentile(sa[ok], 100 - probs)], "V": [r3(x, 2) for x in np.percentile(sb[ok], 100 - probs)]}, "stats": {}}
    mon = idx.month
    for name, sel in (("all", np.ones(len(idx), bool)), ("wet", np.isin(mon, c["wet_months"])), ("dry", np.isin(mon, c["dry_months"]))):
        m = ok.values & sel; st = {"n_hours": int(m.sum())}
        for site, s_, se_, th_ in (("NV", sa, Se("NV", a).reindex(idx), nv[f"VWC {a}"].reindex(idx)), ("V", sb, Se("V", b).reindex(idx), v[f"VWC {b}"].reindex(idx))):
            x = s_.values[m]
            st[site] = {"median_s": r3(np.median(x), 1), "p10_s": r3(np.percentile(x, 10), 1), "p90_s": r3(np.percentile(x, 90), 1), "min_s": r3(x.min(), 1),
                        "frac_below": {str(t): r3((x < t).mean(), 4) for t in c["suction_thresholds_kPa"]}, "median_Se": r3(np.nanmedian(se_.values[m]), 3),
                        "median_theta": r3(np.nanmedian(th_.values[m]), 3), "p10_theta": r3(np.nanpercentile(th_.values[m], 10), 3), "p90_theta": r3(np.nanpercentile(th_.values[m], 90), 3)}
        d = np.log10(sb.values[m]) - np.log10(sa.values[m])
        st["frac_V_drier"] = r3((d > 0).mean(), 3); st["median_log10_ratio_V_over_NV"] = r3(np.median(d), 3)
        P["stats"][name] = st
    out["pairs"].append(P)

# ---------- 3 rain events
ev_rows = []
for e in EV["events"]:
    t0 = pd.Timestamp(e["start"]) - pd.Timedelta("1h"); t1 = pd.Timestamp(e["end"]) + pd.Timedelta(hours=c["event_after_h"])
    row = {"start": e["start"], "end": e["end"], "P_mm": e["P_mm"], "duration_h": e["duration_h"], "dS_NV": e["dS_NV"], "dS_V": e["dS_V"]}
    for site, depths in (("NV", [15, 30, 60]), ("V", [15, 35, 60])):
        for d in depths:
            th = D[site][f"VWC {d}"]; su = D[site][f"s {d}"]; tr, ts = sens(site, d)
            base = th[t0 - pd.Timedelta(hours=c["event_baseline_h"]): t0]; sb_ = su[t0 - pd.Timedelta(hours=c["event_baseline_h"]): t0]
            win = th[t0:t1]; ws = su[t0:t1]
            if base.isna().any() or win.isna().any() or len(base) == 0 or len(win) == 0 or ws.isna().any():
                row[f"{site}_{d}"] = None; continue
            b0 = base.mean(); rise = win - b0; hit = rise[rise >= c["response_dtheta"]]
            row[f"{site}_{d}"] = {"dtheta": r3(rise.max(), 4), "dSe": r3(rise.max() / (ts - tr), 3), "s_before": r3(np.exp(np.log(sb_).mean()), 1), "s_min": r3(ws.min(), 1),
                                  "responded": bool(len(hit) > 0), "lag_h": (None if len(hit) == 0 else float((hit.index[0] - t0) / pd.Timedelta("1h"))),
                                  "Se_before": r3((b0 - tr) / (ts - tr), 3)}
    ev_rows.append(row)
out["events"] = ev_rows
def thresholds(key):
    r = [(x["P_mm"], x[key]["responded"]) for x in ev_rows if x[key] is not None]
    Pr = sorted(p for p, ok in r if ok); Pn = sorted(p for p, ok in r if not ok)
    return {"n_events": len(r), "n_responded": len(Pr), "largest_P_without_response": (Pn[-1] if Pn else None), "smallest_P_with_response": (Pr[0] if Pr else None),
            "median_lag_h": r3(np.median([x[key]["lag_h"] for x in ev_rows if x[key] is not None and x[key]["responded"]]) if Pr else None, 1),
            "median_dSe_when_responded": r3(np.median([x[key]["dSe"] for x in ev_rows if x[key] is not None and x[key]["responded"]]) if Pr else None, 3),
            "median_dtheta_when_responded": r3(np.median([x[key]["dtheta"] for x in ev_rows if x[key] is not None and x[key]["responded"]]) if Pr else None, 4),
            "n_s_min_below_10kPa": int(sum(1 for x in ev_rows if x[key] is not None and x[key]["s_min"] < 10))}
out["event_summary"] = {k: thresholds(k) for k in ["NV_15", "NV_30", "NV_60", "V_15", "V_35", "V_60"]}
# events seen by both sensors of a pair
out["event_pairs"] = []
for a, b in c["pairs"]:
    both = [x for x in ev_rows if x[f"NV_{a}"] is not None and x[f"V_{b}"] is not None]
    out["event_pairs"].append({"NV_depth": a, "V_depth": b, "n_both": len(both), "n_resp_NV": sum(x[f"NV_{a}"]["responded"] for x in both), "n_resp_V": sum(x[f"V_{b}"]["responded"] for x in both),
                               "n_V_smin_higher": sum(x[f"V_{b}"]["s_min"] > x[f"NV_{a}"]["s_min"] for x in both),
                               "median_dSe_NV": r3(np.median([x[f"NV_{a}"]["dSe"] for x in both]), 3), "median_dSe_V": r3(np.median([x[f"V_{b}"]["dSe"] for x in both]), 3),
                               "median_dtheta_NV": r3(np.median([x[f"NV_{a}"]["dtheta"] for x in both]), 4), "median_dtheta_V": r3(np.median([x[f"V_{b}"]["dtheta"] for x in both]), 4)})

# ---------- 4 rain-free spells: storage loss rate
rr = rain.reindex(pd.date_range(rain.index.min(), rain.index.max(), freq="1h"))
dry = (rr == 0)                                # missing rain is NOT dry: it breaks the spell
grp = (dry != dry.shift()).cumsum(); spells = []
for _, g in rr[dry].groupby(grp[dry]):
    if len(g) < c["spell_min_dry_h"] + c["spell_min_len_h"]: continue
    a0 = g.index[0] + pd.Timedelta(hours=c["spell_skip_h"]); ndays = int(((g.index[-1] - a0) / pd.Timedelta("1h")) // 24)
    if ndays * 24 < c["spell_min_len_h"]: continue
    a1 = a0 + pd.Timedelta(days=ndays); row = {"start": str(a0), "end": str(a1), "days": ndays, "month": (a0 + (a1 - a0) / 2).strftime("%Y-%m")}
    for site in D:
        e0 = S[site][a0 - pd.Timedelta("1h"): a0 + pd.Timedelta("1h")]; e1 = S[site][a1 - pd.Timedelta("1h"): a1 + pd.Timedelta("1h")]; mid = S[site][a0:a1]
        okk = len(e0) == 3 and len(e1) == 3 and e0.notna().all() and e1.notna().all() and mid.notna().all()
        row[f"loss_{site}_mm_d"] = r3((e0.mean() - e1.mean()) / ndays, 3) if okk else None
        row[f"S_start_{site}_mm"] = r3(e0.mean(), 1) if okk else None
    spells.append(row)
out["dry_spells"] = spells
sp = pd.DataFrame(spells); monthly = []
for mth, g in sp.groupby("month"):
    gg = g.dropna(subset=["loss_NV_mm_d", "loss_V_mm_d"])
    if len(gg) == 0: continue
    w = gg.days.values
    monthly.append({"month": mth, "days": int(w.sum()), "n_spells": int(len(gg)), "loss_NV_mm_d": r3(np.average(gg.loss_NV_mm_d, weights=w), 3), "loss_V_mm_d": r3(np.average(gg.loss_V_mm_d, weights=w), 3)})
out["dry_spell_monthly"] = monthly
gg = sp.dropna(subset=["loss_NV_mm_d", "loss_V_mm_d"])
out["dry_spell_totals"] = {"days": int(gg.days.sum()), "loss_NV_mm": r3((gg.loss_NV_mm_d * gg.days).sum(), 1), "loss_V_mm": r3((gg.loss_V_mm_d * gg.days).sum(), 1), "n_spells": int(len(gg))}

# ---------- storage seasonal figures
both_ok = S["NV"].reindex(idx).notna() & S["V"].reindex(idx).notna()
out["storage_stats"] = {s: {"max_mm": r3(S[s].reindex(idx)[both_ok].max(), 1), "min_mm": r3(S[s].reindex(idx)[both_ok].min(), 1), "mean_mm": r3(S[s].reindex(idx)[both_ok].mean(), 1)} for s in S}
for yr, a0, a1 in (("2025", "2025-04-26 12:00", "2025-08-28 12:00"), ("2026", "2026-04-01 12:00", "2026-07-30 12:00")):
    out["storage_stats"][f"drying_{yr}"] = {s: r3(S[s][a1] - S[s][a0], 1) for s in S}

# ---------- 5 vertical hydraulic gradient between sensors
grad = []
for site, depths in (("NV", [15, 30, 60]), ("V", [15, 35, 60])):
    for up, lo in ((depths[0], depths[1]), (depths[1], depths[2])):
        h_up = -D[site][f"s {up}"] * c["cm_per_kPa"]; h_lo = -D[site][f"s {lo}"] * c["cm_per_kPa"]
        i = (1 - (h_lo - h_up) / (lo - up)).reindex(idx).dropna()          # > 0: vertical flow component downward
        g = (i > 0).groupby(i.index.strftime("%Y-%m")).agg(["mean", "size"])
        grad.append({"site": site, "between": [up, lo], "frac_down_all": r3((i > 0).mean(), 3), "months": g.index.tolist(), "frac_down": [r3(x, 3) for x in g["mean"].values], "n_hours": [int(x) for x in g["size"].values]})
out["gradients"] = grad

# ---------- 6 temperature
tm = []
for site, T in (("NV", tnv), ("V", tv)):
    d = T["T 15"].resample("1D").agg(["mean", "min", "max", "count"]); d = d[d["count"] >= 280]
    m = pd.DataFrame({"mean": d["mean"], "range": d["max"] - d["min"]}).groupby(d.index.strftime("%Y-%m")).mean()
    tm.append({"site": site, "months": m.index.tolist(), "T15_mean": [r3(x, 1) for x in m["mean"].values], "T15_daily_range": [r3(x, 2) for x in m["range"].values]})
out["soil_temperature_15cm"] = tm
am = air.groupby(air.index.strftime("%Y-%m")).mean()
out["air"] = {"period": [str(air.index.min()), str(air.index.max())], "months": am.index.tolist(),
              **{k.replace(" average", "").replace(" ", "_"): [r3(x, 1) for x in am[k].values] for k in air.columns},
              "mean_diff_T_in_minus_out": r3((air["Air Temp IN average"] - air["Air Temp OUT average"]).mean(), 2),
              "mean_diff_RH_in_minus_out": r3((air["Air RH IN average"] - air["Air RH OUT average"]).mean(), 1)}
json.dump(out, open(sys.argv[9], "w"), separators=(",", ":"), allow_nan=False)

# ---------- console summary
for P in out["pairs"]:
    for k in ("wet", "dry"):
        st = P["stats"][k]; print(f"{P['NV_depth']}/{P['V_depth']} cm {k}: median s NV {st['NV']['median_s']} V {st['V']['median_s']} | <10 kPa NV {st['NV']['frac_below']['10']} V {st['V']['frac_below']['10']} | V drier {st['frac_V_drier']}")
print("events", {k: (v_["n_responded"], v_["n_events"], v_["largest_P_without_response"], v_["smallest_P_with_response"], v_["median_lag_h"], v_["n_s_min_below_10kPa"]) for k, v_ in out["event_summary"].items()})
print("event pairs", out["event_pairs"])
print("dry spells", out["dry_spell_totals"], [(m["month"], m["loss_NV_mm_d"], m["loss_V_mm_d"]) for m in monthly])
print("storage", out["storage_stats"])
print("gradient frac down", [(g["site"], g["between"], g["frac_down_all"]) for g in grad])
print("air", out["air"]["mean_diff_T_in_minus_out"], out["air"]["mean_diff_RH_in_minus_out"], "soil T15 Jul25", [(t["site"], t["T15_mean"][t["months"].index("2025-07")], t["T15_daily_range"][t["months"].index("2025-07")]) for t in tm])

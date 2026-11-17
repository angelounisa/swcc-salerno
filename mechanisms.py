"""Patterns in the measured data that point to mechanisms (no simulation). Works on compare.json + hourly series.
 M1 rain events: stored water vs rain fitted by  dS = b * max(0, P - P0)  (events up to P_MAX_FIT mm) and rank correlation of the
    storage efficiency dS/P with event size, peak intensity, duration and antecedent storage
 M2 timing of the seasonal drying: first day (after 1 April) from which the daily-median suction stays above a threshold
    for N_DAYS consecutive days, at each depth -> does drying proceed from the surface downward or at all depths together?
 M3 autumn rewetting: first day (after 15 August) from which the daily-median suction stays below REWET_KPA, and rain needed
 M4 day / night split of the water loss in rain-free periods (06-18 h vs 18-06 h), from theta and, independently, from suction
 M5 order and delay of the response to rain with depth
 M6 monthly medians for each sensor pair: suction of each plot, ratio of suction (vegetated / no vegetation), and the ABSOLUTE
    differences of suction [kPa], of effective saturation and of theta. The ratio is unstable when the no-vegetation suction is
    close to zero (wet winter months): the absolute differences are the robust indicators.
Usage: python mechanisms.py NV_cal.xlsx V_cal.xlsx rain.xlsx compare.json sim/infiltration_events.json tempNV.xlsx tempV.xlsx out.json swcc_main.json
"""
import json, sys
import numpy as np, pandas as pd
from scipy.stats import spearmanr
CONFIG = {"p_max_fit_mm": 100.0, "p0_grid_mm": [0.0, 45.0, 0.5], "dry_thresholds_kPa": [100, 1000], "dry_n_days": 5, "dry_from": "04-01", "dry_to": "09-30",
          "rewet_kPa": 30, "rewet_n_days": 3, "rewet_from": "2025-08-15", "rewet_to": "2026-01-31",
          "seasons": {"marzo-maggio": [3, 4, 5], "giugno-agosto": [6, 7, 8], "ottobre-febbraio": [10, 11, 12, 1, 2]}, "day_start_h": 6, "n_boot": 500, "seed": 20261116, "pairs": [[15, 15], [30, 35], [60, 60]], "min_hours_month": 240}
c = CONFIG
D = {"NV": pd.read_excel(sys.argv[1]).set_index("Time").resample("1h").mean(), "V": pd.read_excel(sys.argv[2]).set_index("Time").resample("1h").mean()}
rain = pd.read_excel(sys.argv[3]).set_index("Data_fine_ora")["P_unificata_mm"]
SWm = json.load(open(sys.argv[9])); C = json.load(open(sys.argv[4])); EV = json.load(open(sys.argv[5]))["events"]
TEMP = {"NV": pd.read_excel(sys.argv[6]).set_index("Time").resample("1h").mean(), "V": pd.read_excel(sys.argv[7]).set_index("Time").resample("1h").mean()}
TCOL = {15: "T 15", 30: "T 30", 35: "T 30", 60: "T 60"}
DEP = {"NV": [15, 30, 60], "V": [15, 35, 60]}
r3 = lambda x, k=3: None if (x is None or not np.isfinite(x)) else round(float(x), k)
out = {"config": c}
# ---- M1
ev = pd.DataFrame(EV); ev["imax"] = [float(rain[pd.Timestamp(a):pd.Timestamp(b)].max()) for a, b in zip(ev.start, ev.end)]
out["M1"] = {}
for s in D:
    d = ev.dropna(subset=[f"dS_{s}", f"S0_{s}"]); eff = d[f"dS_{s}"] / d.P_mm; res = {"n_events": int(len(d)), "spearman": {}}
    for x, lab in (("P_mm", "pioggia dell'evento"), ("imax", "intensità oraria massima"), ("duration_h", "durata"), (f"S0_{s}", "invaso prima dell'evento")):
        rho, p = spearmanr(d[x], eff); res["spearman"][lab] = {"rho": r3(rho, 2), "p": r3(p, 4)}
    dd = d[d.P_mm <= c["p_max_fit_mm"]]; best = None
    for P0 in np.arange(*c["p0_grid_mm"]):
        x = np.maximum(0, dd.P_mm - P0); b = (x * dd[f"dS_{s}"]).sum() / (x * x).sum(); sse = ((dd[f"dS_{s}"] - b * x) ** 2).sum()
        if best is None or sse < best[2]: best = (float(P0), float(b), float(sse))
    # bootstrap of the fit (events resampled)
    rng = np.random.default_rng(c["seed"]); bs = []
    for _ in range(c["n_boot"]):
        g = dd.sample(len(dd), replace=True, random_state=int(rng.integers(1e9))); bb = None
        for P0 in np.arange(*c["p0_grid_mm"]):
            x = np.maximum(0, g.P_mm - P0); den = (x * x).sum()
            if den == 0: continue
            b = (x * g[f"dS_{s}"]).sum() / den; sse = ((g[f"dS_{s}"] - b * x) ** 2).sum()
            if bb is None or sse < bb[2]: bb = (P0, b, sse)
        bs.append(bb[:2])
    bs = np.array(bs)
    res["fit"] = {"P0_mm": best[0], "slope": r3(best[1], 3), "rmse_mm": r3(np.sqrt(best[2] / len(dd)), 1), "n": int(len(dd)),
                  "P0_ci95": [r3(np.percentile(bs[:, 0], 2.5), 1), r3(np.percentile(bs[:, 0], 97.5), 1)], "slope_ci95": [r3(np.percentile(bs[:, 1], 2.5), 2), r3(np.percentile(bs[:, 1], 97.5), 2)]}
    q = d[f"S0_{s}"].quantile([1 / 3, 2 / 3]).values; res["by_antecedent_storage"] = []
    for lab, m in (("asciutto", d[f"S0_{s}"] <= q[0]), ("intermedio", (d[f"S0_{s}"] > q[0]) & (d[f"S0_{s}"] <= q[1])), ("bagnato", d[f"S0_{s}"] > q[1])):
        res["by_antecedent_storage"].append({"class": lab, "S0_max_mm": r3(d[f"S0_{s}"][m].max(), 0), "n": int(m.sum()), "stored_over_rain": r3(d[f"dS_{s}"][m].sum() / d.P_mm[m].sum(), 2)})
    out["M1"][s] = res
out["M1"]["slope_ratio_V_over_NV"] = r3(out["M1"]["V"]["fit"]["slope"] / out["M1"]["NV"]["fit"]["slope"], 2)
# ---- M2, M3
out["M2"] = []; out["M3"] = []
for s in D:
    for d in DEP[s]:
        ds = D[s][f"s {d}"].resample("1D").median(); row = {"site": s, "depth": d}
        for yr in (2025, 2026):
            for thr in c["dry_thresholds_kPa"]:
                x = (ds[f"{yr}-{c['dry_from']}":f"{yr}-{c['dry_to']}"] > thr).rolling(c["dry_n_days"]).sum() == c["dry_n_days"]; t = x[x].index.min()
                row[f"{yr}_{thr}"] = None if pd.isna(t) else str((t - pd.Timedelta(days=c["dry_n_days"] - 1)).date())
        out["M2"].append(row)
        x = (ds[c["rewet_from"]:c["rewet_to"]] < c["rewet_kPa"]).rolling(c["rewet_n_days"]).sum() == c["rewet_n_days"]; t = x[x].index.min()
        t = None if pd.isna(t) else t - pd.Timedelta(days=c["rewet_n_days"] - 1)
        out["M3"].append({"site": s, "depth": d, "date": None if t is None else str(t.date()), "rain_since_mm": None if t is None else r3(rain[c["rewet_from"]:str(t)].sum(), 0)})
# ---- M4
sp = pd.DataFrame(C["dry_spells"]); out["M4"] = []
for lab, months in c["seasons"].items():
    for s in D:
        for d in DEP[s][1:]:                      # 15 cm excluded: the daily temperature cycle dominates the theta reading there
            th = D[s][f"VWC {d}"]; ls = np.log10(D[s][f"s {d}"]); a = []; b = []
            for _, r in sp.iterrows():
                t = pd.Timestamp(r.start).normalize() + pd.Timedelta(hours=24 + c["day_start_h"]); a1 = pd.Timestamp(r.end)
                while t + pd.Timedelta(hours=24) <= a1:
                    if t.month in months:
                        k = [t, t + pd.Timedelta(hours=12), t + pd.Timedelta(hours=24)]
                        x = [th.get(q) for q in k]; y = [ls.get(q) for q in k]
                        if all(pd.notna(x)): a.append((x[0] - x[1], x[1] - x[2]))
                        if all(pd.notna(y)): b.append((y[1] - y[0], y[2] - y[1]))
                    t += pd.Timedelta(hours=24)
            a = np.array(a); b = np.array(b); rng = np.random.default_rng(c["seed"])
            def share_ci(x):                      # day share of the mean loss, days resampled
                v = []
                for _ in range(c["n_boot"]):
                    g = x[rng.integers(0, len(x), len(x))].mean(axis=0)
                    if g.sum() > 0: v.append(g[0] / g.sum())
                return [r3(np.percentile(v, 2.5), 2), r3(np.percentile(v, 97.5), 2)]
            T = TEMP[s][TCOL[d]]; g = T.groupby(T.index.date); tr = g.max() - g.min(); tr.index = pd.to_datetime(tr.index)
            out["M4"].append({"season": lab, "site": s, "depth": d, "n_days": int(len(a)), "T_daily_range_C": r3(tr[tr.index.month.isin(months)].median(), 2),
                              "theta_day_share_ci95": share_ci(a), "suction_day_share_ci95": share_ci(b),
                              "theta_loss_day_x1000": r3(a[:, 0].mean() * 1000, 2), "theta_loss_night_x1000": r3(a[:, 1].mean() * 1000, 2),
                              "theta_day_share": r3(a[:, 0].mean() / (a[:, 0].mean() + a[:, 1].mean()), 2) if (a[:, 0].mean() + a[:, 1].mean()) > 0 else None,
                              "dlog_s_day_x1000": r3(b[:, 0].mean() * 1000, 2), "dlog_s_night_x1000": r3(b[:, 1].mean() * 1000, 2),
                              "suction_day_share": r3(b[:, 0].mean() / (b[:, 0].mean() + b[:, 1].mean()), 2) if (b[:, 0].mean() + b[:, 1].mean()) > 0 else None})
# ---- M5
out["M5"] = []
for s in D:
    k = [f"{s}_{d}" for d in DEP[s]]; byp = 0; l12 = []; l23 = []; n = 0
    for e in C["events"]:
        r = [e[x] for x in k]
        if any(x is None for x in r): continue
        n += 1; resp = [x["responded"] for x in r]; lag = [x["lag_h"] for x in r]
        if (resp[2] and not resp[1]) or (resp[1] and resp[2] and lag[2] < lag[1]) or (resp[1] and not resp[0]): byp += 1
        if resp[0] and resp[1]: l12.append(lag[1] - lag[0])
        if resp[1] and resp[2]: l23.append(lag[2] - lag[1])
    dz1 = DEP[s][1] - DEP[s][0]; dz2 = DEP[s][2] - DEP[s][1]
    out["M5"].append({"site": s, "n_events": n, "n_out_of_order": byp, "lag_top_mid_h": r3(np.median(l12), 1), "n_top_mid": len(l12), "lag_mid_deep_h": r3(np.median(l23), 1), "n_mid_deep": len(l23),
                      "speed_top_mid_cm_h": r3(dz1 / np.median(l12), 1), "speed_mid_deep_cm_h": r3(dz2 / np.median(l23), 1)})
# ---- M6
out["M6"] = []
for a, b in c["pairs"]:
    sa, sb = D["NV"][f"s {a}"], D["V"][f"s {b}"]; ta, tb = D["NV"][f"VWC {a}"], D["V"][f"VWC {b}"]
    ok = sa.notna() & sb.notna() & ta.notna() & tb.notna()
    lr = np.log10(sb[ok] / sa[ok]); dt = (tb - ta)[ok]; per = lr.index.to_period("M"); n = lr.groupby(per).size(); keep = n[n >= c["min_hours_month"]].index
    def se(site, d, th):
        L = next(v for v in SWm["shared"].values() if f"{site}_{d}" in v["sensors"]); q = L["sensors"][f"{site}_{d}"]
        return ((th - q["theta_r"]) / (q["theta_s"] - q["theta_r"])).clip(0, 1)
    ds = (sb - sa)[ok]; dse = (se("V", b, tb) - se("NV", a, ta))[ok]
    out["M6"].append({"NV_depth": a, "V_depth": b, "months": [str(m) for m in keep], "n_hours": [int(n[m]) for m in keep],
                      "suction_ratio_V_over_NV": [r3(10 ** lr.groupby(per).median()[m], 3) for m in keep],
                      "theta_diff_V_minus_NV": [r3(dt.groupby(per).median()[m], 4) for m in keep],
                      "suction_NV_kPa": [r3(sa[ok].groupby(per).median()[m], 1) for m in keep], "suction_V_kPa": [r3(sb[ok].groupby(per).median()[m], 1) for m in keep],
                      "suction_diff_V_minus_NV_kPa": [r3(ds.groupby(per).median()[m], 1) for m in keep],
                      "Se_diff_V_minus_NV": [r3(dse.groupby(per).median()[m], 3) for m in keep]})
json.dump(out, open(sys.argv[8], "w"), separators=(",", ":"), allow_nan=False)
print("M1", {s: out["M1"][s]["fit"] for s in D}, out["M1"]["slope_ratio_V_over_NV"])
for r in out["M4"]: print("M4", r)
print("M5", out["M5"])

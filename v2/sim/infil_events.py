"""Event-scale infiltration from the sensors (independent of temperature / ET estimates).
For each rain event (hours of rain separated by < GAP_H dry hours, as in Urciuoli et al.), storage in the
instrumented column S(t) = sum_i theta_i(t) * dz_i is computed for both plots; the stored water
dS = max S(t) over [start, end + AFTER_H] - S(start - 1 h) is a LOWER bound of infiltration
(water drained below the column or evaporated during the event is not counted).
Usage: python infil_events.py rain.xlsx meterNV.xlsx meterV.xlsx out.json
"""
import json, sys
import numpy as np, pandas as pd
CONFIG = {"gap_h": 24, "after_h": 24, "min_event_mm": 7.5, "column_bottom_cm": 75,
          # layer attributed to each sensor: midpoints between sensors, bottom at column_bottom_cm
          "layers_cm": {"NV": {"15": [0, 22.5], "30": [22.5, 45], "60": [45, 75]},
                        "V": {"15": [0, 25], "35": [25, 47.5], "60": [47.5, 75]}}}
rain = pd.read_excel(sys.argv[1]).set_index("Data_fine_ora")["P_unificata_mm"].fillna(0.0)
met = {"NV": pd.read_excel(sys.argv[2]).set_index("Time"), "V": pd.read_excel(sys.argv[3]).set_index("Time")}
S = {}
for site, df in met.items():
    h = df.resample("1h").mean()
    s = sum(h[f"VWC {k}"] * (b - a) * 10 for k, (a, b) in CONFIG["layers_cm"][site].items())  # mm; NaN if any sensor missing
    S[site] = s
# events
wet = rain[rain > 0]
ev, cur = [], None
for t, p in wet.items():
    if cur is None or (t - cur["end"]) >= pd.Timedelta(hours=CONFIG["gap_h"]):
        if cur: ev.append(cur)
        cur = {"start": t, "end": t, "P": 0.0}
    cur["end"] = t; cur["P"] += p
ev.append(cur)
rows = []
for e in ev:
    if e["P"] < CONFIG["min_event_mm"]: continue
    r = {"start": str(e["start"]), "end": str(e["end"]), "P_mm": round(e["P"], 1),
         "duration_h": int((e["end"] - e["start"]) / pd.Timedelta("1h")) + 1}
    for site in ("NV", "V"):
        t0 = e["start"] - pd.Timedelta("2h")          # rain label = end of hour; state before the first wet hour
        seg = S[site][e["start"] - pd.Timedelta("1h"): e["end"] + pd.Timedelta(hours=CONFIG["after_h"])]
        s0 = S[site].get(t0, np.nan)
        ok = np.isfinite(s0) and seg.notna().all() and len(seg) > 0
        r[f"dS_{site}"] = round(float(seg.max() - s0), 1) if ok else None
        r[f"S0_{site}"] = round(float(s0), 1) if ok else None
    rows.append(r)
d = pd.DataFrame(rows)
both = d.dropna(subset=["dS_NV", "dS_V"])
summ = {"n_events": len(d), "n_both": len(both),
        "sum_P": float(both.P_mm.sum()), "sum_dS_NV": float(both.dS_NV.sum()), "sum_dS_V": float(both.dS_V.sum()),
        "ratio_V_over_NV_sum": float(both.dS_V.sum() / both.dS_NV.sum()),
        "ratio_V_over_NV_median": float((both.dS_V / both.dS_NV)[both.dS_NV > 2].median()),
        "frac_NV": float(both.dS_NV.sum() / both.P_mm.sum()), "frac_V": float(both.dS_V.sum() / both.P_mm.sum())}
for lab, m in [("dry_season(May-Sep)", both.start.str[5:7].astype(int).between(5, 9)), ("wet_season(Oct-Apr)", ~both.start.str[5:7].astype(int).between(5, 9))]:
    b = both[m]; summ[lab] = {"n": int(len(b)), "P": float(b.P_mm.sum()), "dS_NV": float(b.dS_NV.sum()), "dS_V": float(b.dS_V.sum()),
                              "ratio": float(b.dS_V.sum() / b.dS_NV.sum()) if b.dS_NV.sum() > 0 else None}
json.dump({"config": CONFIG, "events": rows, "summary": summ}, open(sys.argv[4], "w"), indent=1, allow_nan=False)
print(json.dumps(summ, indent=1)); print(d.to_string())

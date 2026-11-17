"""Further analyses of the measurements for a paper (no simulation).
 P1 root-water-uptake proxy from the daily cycle of theta in rain-free days, per sensor (mid and deep; 15 cm excluded: thermal effect):
      day loss  d = theta(06) - theta(18),  night loss  n = theta(18) - theta(06 next day)
      uptake U = (d - n) * dz   [mm/day]   (the loss not driven by daylight is assumed to go on at the night rate for 24 h)
    binned by month and by the suction at the sensor -> field uptake-versus-suction relation
 P2 does vegetation change the response to rain beyond making the soil drier before the event?
      logistic model  P(s_min < S_CRIT) = f(a + b ln P + c ln s_before + d V)  per sensor pair, events resampled for the CI of d
 P3 recovery of suction after the events in which it fell below S_CRIT: hours until it is back above S_REC (censored by the next event)
Usage: python paper_analysis.py NV_cal.xlsx V_cal.xlsx compare.json out.json figdir
"""
import json, sys, warnings
import numpy as np, pandas as pd
from scipy.optimize import minimize
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
CONFIG = {"day_start_h": 6, "layers_cm": {"NV": {"30": [22.5, 45.0], "60": [45.0, 75.0]}, "V": {"35": [25.0, 47.5], "60": [47.5, 75.0]}},
          "suction_bins_kPa": [5, 20, 50, 100, 300, 1000, 3000], "n_boot": 1000, "seed": 20261116,
          "s_crit_kPa": 10.0, "ridge_lambda": 0.5, "s_rec_kPa": 20.0, "pairs": [[15, 15], [30, 35], [60, 60]], "rec_max_h": 480}
c = CONFIG; rng = np.random.default_rng(c["seed"])
D = {"NV": pd.read_excel(sys.argv[1]).set_index("Time").resample("1h").mean(), "V": pd.read_excel(sys.argv[2]).set_index("Time").resample("1h").mean()}
C = json.load(open(sys.argv[3])); figdir = sys.argv[5]
r3 = lambda x, k=3: None if (x is None or not np.isfinite(x)) else round(float(x), k)
def ci(x, f=np.mean):
    x = np.asarray(x); b = [f(x[rng.integers(0, len(x), len(x))]) for _ in range(c["n_boot"])]; return [r3(np.percentile(b, 2.5)), r3(np.percentile(b, 97.5))]
out = {"config": c}
# ---------------- P1
rows = []
for s, L in c["layers_cm"].items():
    for d, (z0, z1) in L.items():
        th = D[s][f"VWC {d}"]; su = D[s][f"s {d}"]; dz = (z1 - z0) * 10.0     # mm
        for sp in C["dry_spells"]:
            t = pd.Timestamp(sp["start"]).normalize() + pd.Timedelta(hours=24 + c["day_start_h"]); t1 = pd.Timestamp(sp["end"])
            while t + pd.Timedelta(hours=24) <= t1:
                k = [t, t + pd.Timedelta(hours=12), t + pd.Timedelta(hours=24)]; x = [th.get(q) for q in k]
                if all(pd.notna(x)):
                    sm_ = su[k[0]:k[2]].median()
                    rows.append({"site": s, "depth": int(d), "date": t, "U": ((x[0] - x[1]) - (x[1] - x[2])) * dz, "L": (x[0] - x[2]) * dz, "s": sm_})
                t += pd.Timedelta(hours=24)
U = pd.DataFrame(rows).dropna(); U["month"] = U.date.dt.month; U["season"] = np.where(U.month.isin([3, 4, 5]), "mar-mag", np.where(U.month.isin([6, 7, 8, 9]), "giu-set", "ott-feb"))
out["P1"] = {"by_season": [], "by_suction": [], "column": []}
for (s, d, se), g in U.groupby(["site", "depth", "season"]):
    out["P1"]["by_season"].append({"site": s, "depth": d, "season": se, "n_days": len(g), "uptake_mm_d": r3(g.U.mean()), "uptake_ci95": ci(g.U), "total_loss_mm_d": r3(g.L.mean()), "total_loss_ci95": ci(g.L)})
bins = c["suction_bins_kPa"]
for (s, d), g in U.groupby(["site", "depth"]):
    for a, b in zip(bins[:-1], bins[1:]):
        q = g[(g.s >= a) & (g.s < b)]
        if len(q) >= 8: out["P1"]["by_suction"].append({"site": s, "depth": d, "s_lo": a, "s_hi": b, "s_median": r3(q.s.median(), 1), "n_days": len(q), "uptake_mm_d": r3(q.U.mean()), "uptake_ci95": ci(q.U), "total_loss_mm_d": r3(q.L.mean())})
for s in D:      # column 22.5/25-75 cm: days with both sensors
    g = U[U.site == s].pivot_table(index="date", columns="depth", values=["U", "L"]).dropna(); g["season"] = np.where(g.index.month.isin([3, 4, 5]), "mar-mag", np.where(g.index.month.isin([6, 7, 8, 9]), "giu-set", "ott-feb"))
    for se, q in g.groupby("season"):
        u = q["U"].sum(axis=1); l = q["L"].sum(axis=1); deep = q["U"].iloc[:, 1]
        out["P1"]["column"].append({"site": s, "season": se, "n_days": len(q), "uptake_mm_d": r3(u.mean()), "uptake_ci95": ci(u.values), "total_loss_mm_d": r3(l.mean()), "uptake_over_loss": r3(u.mean() / l.mean(), 2),
                                    "deep_share_of_uptake": r3(deep.mean() / u.mean(), 2)})
# ---------------- P2
ev = C["events"]; out["P2"] = []
for a, b in c["pairs"]:
    rec = []
    for i, e in enumerate(ev):
        for s, d, v in (("NV", a, 0), ("V", b, 1)):
            x = e.get(f"{s}_{d}")
            if x is None or x["s_before"] is None: continue
            rec.append({"ev": i, "V": v, "lnP": np.log(e["P_mm"]), "lns0": np.log(x["s_before"]), "y": int(x["s_min"] < c["s_crit_kPa"]), "pre": int(x["s_before"] < c["s_crit_kPa"])})
    R = pd.DataFrame(rec); R = R[R.pre == 0]           # only events starting above the critical suction
    def fit(df, cols):
        """Logistic regression with an L2 penalty (lambda * sum b^2 / 2, intercept not penalised) on the raw predictors:
        keeps the estimates finite when a resample is (quasi-)separated. ln P and ln s are O(1-5), V is 0/1."""
        X = np.column_stack([np.ones(len(df))] + [df[k].values for k in cols]); y = df.y.values.astype(float); lam = c["ridge_lambda"]
        def nll(b):
            z = X @ b; return np.sum(np.logaddexp(0, z) - y * z) + 0.5 * lam * np.sum(b[1:] ** 2)
        def grad(b):
            g = X.T @ (1 / (1 + np.exp(-(X @ b))) - y); g[1:] += lam * b[1:]; return g
        r = minimize(nll, np.zeros(X.shape[1]), jac=grad, method="BFGS", options={"gtol": 1e-8, "maxiter": 2000})
        assert r.success or np.linalg.norm(grad(r.x)) < 1e-4, r.message
        return pd.Series(r.x, index=["const"] + cols)
    row = {"NV_depth": a, "V_depth": b, "n": int(len(R)), "n_events_lost_NV": int(R[(R.V == 0)].y.sum()), "n_NV": int((R.V == 0).sum()), "n_events_lost_V": int(R[(R.V == 1)].y.sum()), "n_V": int((R.V == 1).sum()),
           "median_s_before_NV": r3(np.exp(R[R.V == 0].lns0.median()), 1), "median_s_before_V": r3(np.exp(R[R.V == 1].lns0.median()), 1)}
    for name, cols in (("V_only", ["V"]), ("V_and_rain", ["lnP", "V"]), ("V_rain_antecedent", ["lnP", "lns0", "V"])):
        p = fit(R, cols); bs = []
        ids = R.ev.unique()
        for _ in range(c["n_boot"]):
            pick = rng.choice(ids, len(ids)); g = pd.concat([R[R.ev == i] for i in pick])
            if g.y.nunique() < 2 or g.V.nunique() < 2: continue
            bs.append(fit(g, cols)["V"])
        row[name] = {"coef": {k: r3(v, 2) for k, v in p.items()}, "V_ci95": [r3(np.percentile(bs, 2.5), 2), r3(np.percentile(bs, 97.5), 2)], "odds_ratio_V": r3(np.exp(p["V"]), 3)}
    # rain giving 50% probability of losing suction, at the median antecedent suction of each plot and at a common one
    p = fit(R, ["lnP", "lns0", "V"]); s_common = np.exp(R.lns0.median())
    P50 = lambda v, s0: float(np.exp(-(p["const"] + p["lns0"] * np.log(s0) + p["V"] * v) / p["lnP"]))
    row["P50_mm"] = {"NV_own_antecedent": r3(P50(0, row["median_s_before_NV"]), 0), "V_own_antecedent": r3(P50(1, row["median_s_before_V"]), 0),
                     "NV_common_antecedent": r3(P50(0, s_common), 0), "V_common_antecedent": r3(P50(1, s_common), 0), "common_s_before_kPa": r3(s_common, 1)}
    out["P2"].append(row)
# ---------------- P3
out["P3"] = []; starts = [pd.Timestamp(e["start"]) for e in ev]
for s, ds in (("NV", [15, 30, 60]), ("V", [15, 35, 60])):
    for d in ds:
        su = D[s][f"s {d}"]; T = []; cens = 0
        for i, e in enumerate(ev):
            x = e.get(f"{s}_{d}")
            if x is None or x["s_min"] >= c["s_crit_kPa"]: continue
            t0 = pd.Timestamp(e["end"]); nxt = starts[i + 1] if i + 1 < len(starts) else su.index[-1]; lim = min(nxt, t0 + pd.Timedelta(hours=c["rec_max_h"]))
            w = su[t0:lim]; ok = w[w > c["s_rec_kPa"]]
            if len(ok): T.append((ok.index[0] - t0) / pd.Timedelta(hours=1))
            else: cens += 1
        out["P3"].append({"site": s, "depth": d, "n_events_below_crit": len(T) + cens, "n_recovered_before_next_event": len(T), "n_censored": cens,
                          "median_recovery_h": r3(np.median(T), 0) if T else None, "iqr_h": [r3(np.percentile(T, 25), 0), r3(np.percentile(T, 75), 0)] if T else None})
json.dump(out, open(sys.argv[4], "w"), indent=1, allow_nan=False)
# ---------------- figures
col = {"NV": "#b0651f", "V": "#2f7d4f"}; lab = {"NV": "senza vegetazione", "V": "vegetata"}
fig, ax = plt.subplots(1, 2, figsize=(10, 4), sharey=True)
for j, deep in enumerate([False, True]):
    for s in D:
        d = (60 if deep else (30 if s == "NV" else 35)); q = [r for r in out["P1"]["by_suction"] if r["site"] == s and r["depth"] == d]
        x = [r["s_median"] for r in q]; y = [r["uptake_mm_d"] for r in q]; e = [[r["uptake_mm_d"] - r["uptake_ci95"][0] for r in q], [r["uptake_ci95"][1] - r["uptake_mm_d"] for r in q]]
        ax[j].errorbar(x, y, yerr=e, marker="o" if s == "NV" else "D", color=col[s], capsize=3, label=f"{lab[s]} {d} cm")
    ax[j].set_xscale("log"); ax[j].axhline(0, color="gray", lw=.8, ls=":"); ax[j].set_xlabel("suzione al sensore [kPa]"); ax[j].legend(frameon=False); ax[j].set_title("strato profondo" if deep else "strato intermedio")
ax[0].set_ylabel("assorbimento diurno U [mm/giorno]"); fig.tight_layout(); fig.savefig(f"{figdir}/fig_uptake_vs_suction.png", dpi=200)
for r in out["P1"]["column"]: print("P1col", r)
for r in out["P1"]["by_suction"]: print("P1s", r["site"], r["depth"], r["s_lo"], r["s_hi"], r["n_days"], r["uptake_mm_d"], r["uptake_ci95"], r["total_loss_mm_d"])
for r in out["P2"]: print("P2", json.dumps(r))
for r in out["P3"]: print("P3", r)

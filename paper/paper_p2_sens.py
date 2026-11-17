"""Robustness of the vegetation effect on the probability of losing suction (P2 of paper_analysis.py).
 Equivalent-rain factor k: with logit p = a + b ln P + c ln s0 + d V, a vegetated event with rain P behaves like a
 non-vegetated event with rain k P, k = exp(d / b). Events resampled (both plots together) for the CI.
 Sensitivity to the ridge penalty and to the critical suction.
Usage: python paper_p2_sens.py compare.json out.json"""
import json, sys
import numpy as np, pandas as pd
from scipy.optimize import minimize
CONFIG = {"pairs": [[15, 15], [30, 35], [60, 60]], "lambdas": [0.1, 0.5, 2.0], "s_crit_kPa": [5.0, 10.0, 20.0], "base": {"lambda": 0.5, "s_crit": 10.0},
          "n_boot": 2000, "seed": 20261117}
c = CONFIG; C = json.load(open(sys.argv[1])); ev = C["events"]; rng = np.random.default_rng(c["seed"])
r3 = lambda x, k=3: None if (x is None or not np.isfinite(x)) else round(float(x), k)
def table(a, b, scrit):
    rec = []
    for i, e in enumerate(ev):
        for s, d, v in (("NV", a, 0), ("V", b, 1)):
            x = e.get(f"{s}_{d}")
            if x is None or x["s_before"] is None or x["s_before"] < scrit: continue
            rec.append({"ev": i, "V": v, "lnP": np.log(e["P_mm"]), "lns0": np.log(x["s_before"]), "y": int(x["s_min"] < scrit)})
    return pd.DataFrame(rec)
def fit(df, lam):
    X = np.column_stack([np.ones(len(df)), df.lnP, df.lns0, df.V]); y = df.y.values.astype(float)
    nll = lambda b: np.sum(np.logaddexp(0, X @ b) - y * (X @ b)) + 0.5 * lam * np.sum(b[1:] ** 2)
    def grad(b):
        g = X.T @ (1 / (1 + np.exp(-(X @ b))) - y); g[1:] += lam * b[1:]; return g
    r = minimize(nll, np.zeros(4), jac=grad, method="BFGS", options={"gtol": 1e-8, "maxiter": 2000})
    assert r.success or np.linalg.norm(grad(r.x)) < 1e-4, r.message
    return r.x
def boot(df, lam):
    ids = df.ev.unique(); groups = {i: df[df.ev == i] for i in ids}; ks = []; ds = []; skipped = 0
    for _ in range(c["n_boot"]):
        g = pd.concat([groups[i] for i in rng.choice(ids, len(ids))])
        if g.y.nunique() < 2 or g.V.nunique() < 2: skipped += 1; continue
        p = fit(g, lam)
        if p[1] <= 0: skipped += 1; continue          # k undefined if rain does not increase the probability
        ks.append(np.exp(p[3] / p[1])); ds.append(p[3])
    return ks, ds, skipped
out = {"config": c, "base": [], "sensitivity": []}
for a, b in c["pairs"]:
    df = table(a, b, c["base"]["s_crit"]); p = fit(df, c["base"]["lambda"]); ks, ds, sk = boot(df, c["base"]["lambda"])
    out["base"].append({"NV_depth": a, "V_depth": b, "n_obs": len(df), "n_events": int(df.ev.nunique()), "n_lost": {"NV": int(df[df.V == 0].y.sum()), "V": int(df[df.V == 1].y.sum())},
                        "coef": {"const": r3(p[0], 2), "lnP": r3(p[1], 2), "lns0": r3(p[2], 2), "V": r3(p[3], 2)},
                        "odds_ratio_V": r3(np.exp(p[3]), 3), "odds_ratio_ci95": [r3(np.exp(np.percentile(ds, 2.5)), 3), r3(np.exp(np.percentile(ds, 97.5)), 3)],
                        "k_equivalent_rain": r3(np.exp(p[3] / p[1]), 2), "k_ci95": [r3(np.percentile(ks, 2.5), 2), r3(np.percentile(ks, 97.5), 2)], "n_boot_used": len(ks), "n_boot_skipped": sk})
    for lam in c["lambdas"]:
        for sc in c["s_crit_kPa"]:
            d2 = table(a, b, sc)
            if d2.y.nunique() < 2: out["sensitivity"].append({"NV_depth": a, "lambda": lam, "s_crit": sc, "k": None, "note": "no event lost suction"}); continue
            q = fit(d2, lam)
            out["sensitivity"].append({"NV_depth": a, "lambda": lam, "s_crit": sc, "n_obs": len(d2), "n_lost_NV": int(d2[d2.V == 0].y.sum()), "n_lost_V": int(d2[d2.V == 1].y.sum()),
                                       "odds_ratio_V": r3(np.exp(q[3]), 3), "k": r3(np.exp(q[3] / q[1]), 2) if q[1] > 0 else None})
json.dump(out, open(sys.argv[2], "w"), indent=1, allow_nan=False)
for r in out["base"]: print(r)
for r in out["sensitivity"]: print(r)

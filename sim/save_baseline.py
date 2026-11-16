"""Compact summary of the current sim2_results.json (used to compare the vertical column, slope 0, with the infinite slope).
Usage (from sim/): python save_baseline.py ../kfield.json baseline_vertical.json"""
import json, sys
S = json.load(open("sim2_results.json")); K = json.load(open(sys.argv[1]))
assert all(S["sites"][s]["model"]["slope_deg"] == 0 for s in S["sites"]), "baseline must be computed with slope 0"
b = {"note": "vertical column (slope 0), same layers and data as the infinite-slope run", "params": S["params"], "kmacChosen": S["kmacScan"]["NV"][S["kmacChosenIndex"]], "sites": {}}
for s in ("NV", "V"):
    c = S["sites"][s]["calib"]
    b["sites"][s] = {"chosen": c["chosen"], "free_best": c["free_best"], "prior_J": c["prior"]["calib"]["J"], "dry": c["dry"], "full": c["full"], "massBalance": S["sites"][s]["massBalance"],
                     "Ks_matrix_cm_h": {z["name"]: z["Ks_cm_h"] for z in S["sites"][s]["model"]["zones"]},
                     "J_chosen": c["grid_J"][c["config"]["log10_kmult"].index(c["chosen"]["log10_kmult"])][c["config"]["eFactor"].index(c["chosen"]["eFactor"])]}
b["kfield_planes"] = {k: v["Ks_cm_h_median"] for k, v in K["planes"].items()}
json.dump(b, open(sys.argv[2], "w"), indent=1); print({s: (b["sites"][s]["chosen"]["eFactor"], round(b["sites"][s]["J_chosen"], 3)) for s in b["sites"]})

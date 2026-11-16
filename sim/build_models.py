"""Model definition files for the two plots, from the independent estimates.
LAYERS. One layer per stratigraphic unit that (i) is recognised in the borehole logs, (ii) has distinct measured hydraulic
properties and (iii) is instrumented:  A1 (topsoil, 0-20 cm) and A2 (pumiceous ash, 20-150 cm), as in the 1D model of
Comegna et al. (ALERT 2025: 0.2 m + 1.3 m). C1 is thin, discontinuous, not instrumented and its laboratory Ksat is within
a factor 2 of A2: it is merged into A2. Sensors in the same layer follow the same Se(s) curve (swcc_main.json), so the
layer is NOT subdivided by sensor: each layer has one retention curve, the SAME in both plots (same soils), with
theta_r and theta_s = mean of the sensors of that layer. The two plots then differ only by vegetation.
Sensor-specific theta_r, theta_s are kept only to convert the MEASURED theta of each sensor into Se.
retention = shared (alpha, n) per layer + sensor theta_r/theta_s (swcc_main.json); matrix Ks = night-drainage K (kfield.json);
Ksat (macropore term), stratigraphy, LAI, root biomass, root depth, Feddes thresholds from Urciuoli et al. and ALERT 2025 slides.
Depths (layers, sensors, roots) are VERTICAL depths below the ground surface.
Usage (from sim/): python build_models.py ../swcc_main.json ../kfield.json SLOPE_DEG
"""
import json, sys, datetime as dt
import numpy as np
MPS = 360000.0
SW = json.load(open(sys.argv[1])); KF = json.load(open(sys.argv[2]))
num = {"dz_cm": 0.5,     # 0.5 cm: with 1 cm stage-2 evaporation is overestimated by ~9% against the reference solution (verify/), with 0.5 cm by ~3%
        "hCrit_cm": -100000, "Ss_per_cm": 1e-6, "hs_cm": -2, "dtMin_h": 1e-7, "dtMax_h": 1.0, "maxIter": 25, "tolTheta": 1e-5, "tolHsat_cm": 0.1, "itGrow": 4, "itShrink": 8}
HMAC_CM = 5.0      # decay length of the macropore term [cm]: the largest value compatible with the night-drainage K points
                   # below 5 kPa (0.01-0.05 cm/h) within the +-2 kPa accuracy of the suction sensor (10 cm is not; 2 cm makes the solver 25x slower)
ksat = {"A1": 1.03e-6 * MPS, "A2": 9.27e-6 * MPS, "C1": 4.82e-6 * MPS}       # laboratory, Urciuoli et al. Table 1
pl = KF["planes"]
def pooled(keys):   # night-weighted geometric mean of the plane medians
    w = np.array([pl[k]["n_nights"] for k in keys]); m = np.array([np.log10(pl[k]["Ks_cm_h_median"]) for k in keys]); return float(10 ** (np.sum(w * m) / np.sum(w)))
km = {"A1": pooled(["NV 22.5 cm", "V 25 cm"]), "A2": pooled(["NV 45 cm", "V 47.5 cm"])}; km["C1"] = km["A2"]
t0 = dt.datetime(2025, 1, 31, 15)
inst = ["2025-04-26 12:00", "2025-06-01 12:00", "2025-07-01 12:00", "2025-08-01 12:00", "2025-08-28 12:00", "2026-04-01 12:00", "2026-05-01 12:00", "2026-06-01 12:00", "2026-07-01 12:00", "2026-07-30 12:00"]
ph = [int((dt.datetime.fromisoformat(s) - t0).total_seconds() // 3600) for s in inst]
LAI = {"NV": 1.0, "V": 3.0}; K_EXT = 0.5
L_CM = 150
def zones():
    Z = [("A1", 0, 20), ("A2", 20, L_CM)]
    return [{"name": n, "zTop_cm": a, "zBot_cm": b, "ret": n, "Ks_cm_h": km[n], "Kmac_cm_h": ksat[n] - km[n], "hmac_cm": HMAC_CM} for n, a, b in Z]
SLOPE_DEG = float(sys.argv[3])     # 32 deg: ALERT 2025 slide 5 (25-30 deg in Urciuoli et al., locally > 35); 0 = vertical column
base = dict(num, slope_deg=SLOPE_DEG, L_cm=L_CM, profileInstants=inst, profileHours=ph, eFactor=1.0, throughfall=1.0,
            feddes_cm=[0, -1, -100 * 10.1972, -1500 * 10.1972],
            sources={"Ksat_lab": "Urciuoli et al. Table 1", "roots": "ALERT 2025 slide 12: total root biomass [g per 360.8 cm3 core] at 20, 40, 60 cm; root depth 1 m (slide 24)",
                     "LAI": "ALERT 2025 slide 24", "k_extinction": "assumed 0.5 (Ritchie 1972: SCF = 1 - exp(-k LAI))", "feddes": "ALERT 2025 slide 28", "hmac_cm": "5 cm, upper limit compatible with wet-end night-drainage K points within sensor accuracy"})
NV = dict(base, site="NV", outDepths_cm=[15, 30, 60], zones=zones(), LAI=LAI["NV"], k_ext=K_EXT, tFrac=float(1 - np.exp(-K_EXT * LAI["NV"])),
          roots=[[0, 1.506], [20, 1.506], [40, 0.962], [60, 0.363], [100, 0.0], [L_CM, 0.0]])
V = dict(base, site="V", outDepths_cm=[15, 35, 60], zones=zones(), LAI=LAI["V"], k_ext=K_EXT, tFrac=float(1 - np.exp(-K_EXT * LAI["V"])),
         roots=[[0, 0.0], [20, 0.984], [40, 3.562], [60, 0.463], [100, 0.0], [L_CM, 0.0]])
layer = {}
for lay in ("A1", "A2"):
    sh = SW["shared"][lay]; ss = sh["sensors"]
    layer[lay] = {"theta_r": float(np.mean([v["theta_r"] for v in ss.values()])), "theta_s": float(np.mean([v["theta_s"] for v in ss.values()])),
                  "alpha": sh["alpha"], "n": sh["n"], "sensors_averaged": sorted(ss)}
fits = {}
for site, keys in [("NV", ["15", "30", "60"]), ("V", ["15", "35", "60"])]:
    fits[site] = {"A1": layer["A1"], "A2": layer["A2"], "sensors": {}}
    for k in keys:
        lay = "A1" if k == "15" else "A2"; ps = SW["shared"][lay]["sensors"][f"{site}_{k}"]
        fits[site]["sensors"][k] = {"layer": lay, "theta_r": ps["theta_r"], "theta_s": ps["theta_s"]}
json.dump(fits, open("fits_main.json", "w"), indent=1)
for m in (NV, V): json.dump(m, open(f"model_{m['site']}.json", "w"), indent=1)
print("layers", {k: {q: round(v[q], 4) for q in ["theta_r", "theta_s", "alpha", "n"]} for k, v in layer.items()})
print("matrix Ks cm/h", {k: round(v, 4) for k, v in km.items()}, "tFrac", round(NV["tFrac"], 3), round(V["tFrac"], 3))

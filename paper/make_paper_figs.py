"""Figures of the manuscript from the derived JSON files (no recomputation of results).
Usage: python make_paper_figs.py figdir"""
import json, sys
import numpy as np, pandas as pd
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt, matplotlib.dates as mdates
out = sys.argv[1]
C = json.load(open("compare.json")); SW = json.load(open("swcc_main.json")); ME = json.load(open("mechanisms.json")); FS = json.load(open("stability.json"))
PA = json.load(open("paper_analysis.json")); P2 = json.load(open("paper_p2.json"))
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 8.5, "axes.spines.top": False, "axes.spines.right": False, "axes.linewidth": .7,
                     "xtick.major.width": .7, "ytick.major.width": .7, "legend.frameon": False, "savefig.dpi": 300, "savefig.bbox": "tight"})
COL = {"NV": "#b0651f", "V": "#2f7d4f"}; LAB = {"NV": "Clear-cut (CC)", "V": "Forest (F)"}; MK = {"NV": "o", "V": "D"}
PAIRS = [[15, 15], [30, 35], [60, 60]]; PL = ["15 cm", "30/35 cm", "60 cm"]
def save(fig, name): fig.savefig(f"{out}/{name}.png"); fig.savefig(f"{out}/{name}.pdf"); plt.close(fig)
# ---------------- Fig 1 time series
S = C["series"]; t = pd.to_datetime(S["t"]); rd = C["rain_daily"]
fig, ax = plt.subplots(4, 1, figsize=(7.2, 7.4), sharex=True, gridspec_kw={"height_ratios": [0.7, 1, 1, 1], "hspace": .12})
ax[0].bar(pd.to_datetime(rd["t"]), rd["mm"], width=1, color="#2563a8"); ax[0].set_ylabel("Rain [mm/d]")
for j, p in enumerate(PAIRS):
    a = ax[j + 1]
    for k, s in enumerate(("NV", "V")):
        y = np.array([np.nan if v is None else v for v in S[f"s_{s}_{p[k]}"]], float)
        a.plot(t, y, color=COL[s], lw=.7, label=LAB[s])
    a.set_yscale("log"); a.set_ylim(.08, 5000); a.set_ylabel("Suction [kPa]"); a.axhline(10, color="gray", lw=.6, ls=":")
    a.text(.01, .92, f"({'bcd'[j]}) {PL[j]}", transform=a.transAxes, fontweight="bold", va="top")
    if j == 0: fig.legend(*a.get_legend_handles_labels(), loc="lower center", bbox_to_anchor=(.55, .895), ncol=2, fontsize=8)
ax[0].text(.01, .9, "(a)", transform=ax[0].transAxes, fontweight="bold", va="top")
ax[-1].xaxis.set_major_locator(mdates.MonthLocator(bymonth=[1, 4, 7, 10])); ax[-1].xaxis.set_major_formatter(mdates.DateFormatter("%b %Y"))
save(fig, "Fig2_timeseries")
# ---------------- Fig 2 main drying curves in Se
fig, ax = plt.subplots(1, 2, figsize=(7.2, 3.0), sharey=True)
shade = {"NV_15": ("NV", "o"), "V_15": ("V", "D"), "NV_30": ("NV", "o"), "NV_60": ("NV", "s"), "V_35": ("V", "D"), "V_60": ("V", "^")}
for i, L in enumerate(("A1", "A2")):
    sh = SW["shared"][L]; a = ax[i]
    for key, q in sh["sensors"].items():
        R = SW["sensors"][key]; s, m = shade[key]
        a.plot(R["envelope"]["s"], q["Se_env"], m, ms=3.5, mfc="none" if key.endswith("60") else COL[s], mec=COL[s], mew=.8, ls="none", label=f"{LAB[s].split(' (')[0]} {R['depth_cm']} cm")
    x = np.logspace(-1, 3.7, 200); a.plot(x, (1 + (sh["alpha"] * x) ** sh["n"]) ** (-(1 - 1 / sh["n"])), "k-", lw=1.4, label=f"layer curve: 1/α = {1/sh['alpha']:.0f} kPa, n = {sh['n']:.2f}")
    a.set_xscale("log"); a.set_xlabel("Suction s [kPa]"); a.set_title(f"({'ab'[i]}) Layer {L}", loc="left", fontweight="bold"); a.legend(fontsize=7, loc="lower left"); a.set_ylim(-.03, 1.05)
ax[0].set_ylabel("Effective saturation $S_e$"); save(fig, "Fig3_main_drying_curves")
# ---------------- Fig 3 event response: storage and probability
fig = plt.figure(figsize=(7.2, 5.6)); gs = fig.add_gridspec(2, 3, height_ratios=[1.15, 1], hspace=.45, wspace=.3)
a = fig.add_subplot(gs[0, :2])
for s in ("NV", "V"):
    e = [x for x in C["events"] if x[f"dS_{s}"] is not None]
    a.plot([x["P_mm"] for x in e], [x[f"dS_{s}"] for x in e], MK[s], color=COL[s], ms=4, alpha=.8, label=LAB[s])
    f = ME["M1"][s]["fit"]; a.plot([0, f["P0_mm"], 100], [0, 0, f["slope"] * (100 - f["P0_mm"])], color=COL[s], lw=1.6,
                                   label=f"$P_0$ = {f['P0_mm']:.0f} mm, b = {f['slope']:.2f} ({f['slope_ci95'][0]:.2f}–{f['slope_ci95'][1]:.2f})")
a.plot([0, 110], [0, 110], ":", color="gray", lw=.8, label="stored = rain"); a.set_xlim(0, 105); a.set_ylim(-5, 125)
a.set_xlabel("Event rainfall P [mm]"); a.set_ylabel("Water stored in 0–75 cm, ΔS [mm]"); a.legend(fontsize=7, loc="upper left"); a.set_title("(a)", loc="left", fontweight="bold")
# k panel
a = fig.add_subplot(gs[0, 2]); B = P2["base"]; z = [15, 32.5, 60]
for i, r in enumerate(B):
    a.errorbar(r["k_equivalent_rain"], z[i], xerr=[[r["k_equivalent_rain"] - r["k_ci95"][0]], [r["k_ci95"][1] - r["k_equivalent_rain"]]], fmt="o", color="k", capsize=3, ms=5)
sens = pd.DataFrame(P2["sensitivity"])
for i, d in enumerate([15, 30, 60]):
    v = sens[sens.NV_depth == d].k.dropna(); a.plot([v.min(), v.max()], [z[i] + 4, z[i] + 4], color="gray", lw=2.5, alpha=.6, solid_capstyle="butt")
a.axvline(.49, color="#2563a8", lw=1.2); a.text(.51, 46, "tree-canopy\nthroughfall 0.49", color="#2563a8", fontsize=6.5, va="top")
a.set_ylim(72, 5); a.set_xlim(0, 1.05); a.set_yticks(z); a.set_yticklabels(PL); a.set_xlabel("Equivalent-rainfall factor k"); a.set_title("(b)", loc="left", fontweight="bold")

# probability curves (base fits, common antecedent suction)
for j, r in enumerate(B):
    a = fig.add_subplot(gs[1, j]); cf = r["coef"]; s0 = PA["P2"][j]["P50_mm"]["common_s_before_kPa"]; P = np.logspace(np.log10(7), np.log10(220), 200)
    for s, v in (("NV", 0), ("V", 1)):
        z_ = cf["const"] + cf["lnP"] * np.log(P) + cf["lns0"] * np.log(s0) + cf["V"] * v; a.plot(P, 1 / (1 + np.exp(-z_)), color=COL[s], lw=1.6, label=LAB[s])
        ev = [(x["P_mm"], int(x[f"{s}_{PAIRS[j][v]}"]["s_min"] < 10)) for x in C["events"] if x.get(f"{s}_{PAIRS[j][v]}") and x[f"{s}_{PAIRS[j][v]}"]["s_before"] and x[f"{s}_{PAIRS[j][v]}"]["s_before"] >= 10]
        jit = .04 if v == 0 else -.04
        a.plot([e[0] for e in ev], [e[1] + jit * (1 if e[1] == 0 else -1) for e in ev], MK[s], color=COL[s], ms=2.8, alpha=.6, ls="none")
    a.set_xscale("log"); a.set_xlabel("Event rainfall P [mm]"); a.set_ylim(-.1, 1.1); a.set_title(f"({'cde'[j]}) {PL[j]}", loc="left", fontweight="bold")
    a.text(.97, .5, f"$s_0$ = {s0:.0f} kPa", transform=a.transAxes, ha="right", fontsize=7, color="gray")
    if j == 0: a.set_ylabel("Pr(s$_{min}$ < 10 kPa)")
    if j == 2: a.legend(fontsize=7, loc="center left", bbox_to_anchor=(0, .72))
save(fig, "Fig4_event_response")
# ---------------- Fig 4 seasonal
fig, ax = plt.subplots(1, 2, figsize=(7.2, 3.0), gridspec_kw={"width_ratios": [1, 1.25]})
a = ax[0]; dep = {"NV": [15, 30, 60], "V": [15, 35, 60]}
for y, ls in ((2025, "-"), (2026, "--")):
    for s in ("NV", "V"):
        rr = [next(r for r in ME["M2"] if r["site"] == s and r["depth"] == d) for d in dep[s]]
        x = [pd.Timestamp(r[f"{y}_1000"]).dayofyear for r in rr]; a.plot(x, dep[s], ls, marker=MK[s], color=COL[s], ms=4, lw=1.2, label=f"{LAB[s].split(' (')[0]} {y}")
a.invert_yaxis(); a.set_yticks([15, 30, 35, 60]); a.set_ylabel("Depth [cm]"); a.legend(fontsize=7, loc="lower left")
ticks = [pd.Timestamp(f"2025-{m:02d}-01").dayofyear for m in (5, 6, 7, 8)]; a.set_xticks(ticks); a.set_xticklabels(["1 May", "1 Jun", "1 Jul", "1 Aug"])
a.set_title("(a) s > 1000 kPa first reached", loc="left", fontweight="bold")
a = ax[1]; mk = ["o", "s", "D"]; cl = ["#c9a227", "#8a5a9e", "#2b7a8c"]
for j, r in enumerate(ME["M6"]):
    a.plot(pd.to_datetime([m + "-15" for m in r["months"]]), r["suction_ratio_V_over_NV"], marker=mk[j], color=cl[j], ms=3.5, lw=1.1, label=PL[j])
a.axhline(1, color="gray", lw=.7, ls=":"); a.set_yscale("log"); a.set_yticks([.3, .5, 1, 2, 5, 10, 20]); a.set_yticklabels(["0.3", "0.5", "1", "2", "5", "10", "20"])
a.set_ylabel("Monthly median suction ratio F / CC"); a.legend(fontsize=7, ncol=3, loc="upper left"); a.xaxis.set_major_locator(mdates.MonthLocator(bymonth=[1, 4, 7, 10])); a.xaxis.set_major_formatter(mdates.DateFormatter("%b %y"))
a.set_title("(b)", loc="left", fontweight="bold"); save(fig, "Fig5_seasonal")
# ---------------- Fig 5 uptake
fig, ax = plt.subplots(1, 2, figsize=(7.2, 3.0), gridspec_kw={"width_ratios": [1, 1.3]})
a = ax[0]; seas = ["mar-mag", "giu-set", "ott-feb"]; sl = ["Mar–May", "Jun–Sep", "Oct–Feb"]; w = .38
for k, s in enumerate(("NV", "V")):
    rr = [next(r for r in PA["P1"]["column"] if r["site"] == s and r["season"] == se) for se in seas]; x = np.arange(3) + (k - .5) * w
    a.bar(x, [r["uptake_mm_d"] for r in rr], w * .92, color=COL[s], label=LAB[s], yerr=[[r["uptake_mm_d"] - r["uptake_ci95"][0] for r in rr], [r["uptake_ci95"][1] - r["uptake_mm_d"] for r in rr]], capsize=2, error_kw={"lw": .7})
    a.plot(x, [r["total_loss_mm_d"] for r in rr], "_", color="k", ms=11, mew=1.4)
a.set_xticks(range(3)); a.set_xticklabels(sl); a.set_ylabel("mm/day, layer 22.5/25–75 cm"); a.set_ylim(0, 1.75)
a.plot([], [], "_", color="k", ms=11, mew=1.4, label="total loss"); a.legend(fontsize=7, loc="upper left", ncol=1, bbox_to_anchor=(.30, 1.0))
a.set_ylim(0, 1.95); a.set_title("(a)", loc="left", fontweight="bold")
a = ax[1]
for s, d, ls in (("NV", 30, "-"), ("NV", 60, "--"), ("V", 35, "-"), ("V", 60, "--")):
    q = [r for r in PA["P1"]["by_suction"] if r["site"] == s and r["depth"] == d]; x = [r["s_median"] for r in q]; y = [r["uptake_mm_d"] for r in q]
    a.errorbar(x, y, yerr=[[r["uptake_mm_d"] - r["uptake_ci95"][0] for r in q], [r["uptake_ci95"][1] - r["uptake_mm_d"] for r in q]], marker=MK[s], ls=ls, color=COL[s], ms=4, capsize=2, lw=1, label=f"{LAB[s].split(' (')[0]} {d} cm")
a.axhline(0, color="gray", lw=.6, ls=":"); a.set_xscale("log"); a.set_xlabel("Suction at the sensor [kPa]"); a.set_ylabel("Daytime uptake U [mm/day]"); a.legend(fontsize=7)
a.set_title("(b)", loc="left", fontweight="bold"); save(fig, "Fig6_uptake")
# ---------------- Fig 6 stability
fig, ax = plt.subplots(1, 2, figsize=(7.2, 3.1))
a = ax[0]; w = .38
for k, s in enumerate(("NV", "V")):
    v = [P["stats"]["wet"][s]["frac_suction_stress_below"]["0.5"] * 100 for P in FS["pairs"]]; x = np.arange(3) + (k - .5) * w
    a.bar(x, v, w * .92, color=COL[s], label=LAB[s])
    for xi, vi in zip(x, v): a.text(xi, vi + .3, f"{vi:.1f}", ha="center", fontsize=7)
a.set_xticks(range(3)); a.set_xticklabels(PL); a.set_ylabel("Time with χs < 0.5 kPa, Oct–Apr [%]"); a.legend(fontsize=7); a.set_title("(a)", loc="left", fontweight="bold")
a = ax[1]; cl = ["#c9a227", "#8a5a9e", "#2b7a8c"]; mk = ["o", "s", "D"]
for j, p in enumerate(PAIRS):
    e = [x for x in FS["events"] if x[f"NV_{p[0]}"] is not None and x[f"V_{p[1]}"] is not None]
    a.plot([x[f"NV_{p[0]}"] for x in e], [x[f"V_{p[1]}"] for x in e], mk[j], color=cl[j], ms=3.5, alpha=.85, label=PL[j])
lim = FS["fs_dry_limit"]["A2"]; a.plot([1, 300], [1, 300], ":", color="gray", lw=.8); a.axhline(lim, color="k", lw=.6, ls="--"); a.axvline(lim, color="k", lw=.6, ls="--")
a.text(1.3, 230, f"tanφ'/tanβ = {lim:.2f}", fontsize=7)
a.set_xscale("log"); a.set_yscale("log"); a.set_xlim(1.1, 300); a.set_ylim(1.1, 300); a.set_xlabel("Event-minimum FS, clear-cut"); a.set_ylabel("Event-minimum FS, forest"); a.legend(fontsize=7, loc="lower right")
a.set_title("(b)", loc="left", fontweight="bold"); save(fig, "Fig7_stability")
print("ok")

"""Hourly forcing + observations for the Richards model, one plot per call.
Units: rain and PE in mm per hour; theta m3/m3; suction kPa.
PE: Oudin et al. (2005), PE[mm/d] = Ra/(lambda*rho) * (Ta+5)/100 for Ta > -5 C, with Ra from FAO-56 eq. 21.
  Ta = daily mean AIR temperature of the open-field station (logger at +40 cm, 17/03-03/09/2025, from the
  ALERT 2025 slides). Outside that period Ta is estimated from the daily mean SOIL temperature at 15 cm of the
  deforested plot with a linear regression fitted on the overlap. The same open-field PE is used for both plots.
  Daily PE is distributed over daylight hours with a half-sine.
Interception (wooded plot only): hourly bucket of capacity C (canopy + shrubs + herbs + litter, ALERT 2025
  slides: 2-5, 1-3, 0.5-2, 5-15 mm); rain fills the store, the overflow reaches the soil, the store evaporates at
  the potential rate. P_mm is then the NET rain reaching the soil; P_gross_mm is kept.
Usage: python prep_forcing2.py SITE rain.xlsx meter.xlsx soilT_NV.xlsx airT.csv out.json
"""
import json, sys
import numpy as np, pandas as pd
SITE = sys.argv[1]
CONFIG = {
    "site": SITE, "rain_file": sys.argv[2], "meter_file": sys.argv[3], "soil_temp_NV_file": sys.argv[4], "air_temp_file": sys.argv[5], "out": sys.argv[6],
    "latitude_deg": 40.70, "lambda_MJ_per_kg": 2.45,
    "air_temp_column": "Air Temp OUT average", "soil_temp_column": "T 15",
    "depths_cm": {"NV": [15, 30, 60], "V": [15, 35, 60]}[SITE],
    "missing_rain_as_zero": True,
    "interception_capacity_mm": {"NV": 0.0, "V": 16.75}[SITE],      # mid values: 3.5 + 2 + 1.25 + 10 mm
    "interception_capacity_range_mm": [8.5, 25.0],
}
def extraterrestrial_radiation(doy, lat_rad):
    gsc = 0.0820; dr = 1 + 0.033 * np.cos(2 * np.pi * doy / 365); dec = 0.409 * np.sin(2 * np.pi * doy / 365 - 1.39)
    ws = np.arccos(-np.tan(lat_rad) * np.tan(dec))
    ra = 24 * 60 / np.pi * gsc * dr * (ws * np.sin(lat_rad) * np.sin(dec) + np.cos(lat_rad) * np.cos(dec) * np.sin(ws))
    return ra, 24 / np.pi * ws
def bucket(P, PE, C):
    """net rain reaching the soil and evaporation from the interception store [mm/h]"""
    c = 0.0; net = np.empty_like(P); ei = np.empty_like(P)
    for i in range(len(P)):
        e = min(c, PE[i]); c -= e; ei[i] = e
        over = max(0.0, c + P[i] - C); c = min(C, c + P[i]); net[i] = over
    return net, ei
def main(c):
    rain = pd.read_excel(c["rain_file"]).set_index("Data_fine_ora")["P_unificata_mm"]
    assert rain.index.to_series().diff().dropna().eq(pd.Timedelta("1h")).all()
    missing = rain.isna(); assert c["missing_rain_as_zero"]; rain = rain.fillna(0.0)
    met = pd.read_excel(c["meter_file"]).set_index("Time")
    tsoil = pd.read_excel(c["soil_temp_NV_file"]).set_index("Time")[c["soil_temp_column"]].resample("1D").mean()
    air = pd.read_csv(c["air_temp_file"], parse_dates=["Time"]).set_index("Time")[c["air_temp_column"]].resample("1D").agg(["mean", "count"])
    air = air[air["count"] == 24]["mean"]
    j = pd.concat([air.rename("air"), tsoil.rename("soil")], axis=1, sort=True).dropna()
    slope, icpt = np.polyfit(j.soil, j.air, 1); r2 = float(np.corrcoef(j.soil, j.air)[0, 1] ** 2)
    t_start = met.index.min().ceil("1h"); t_end = min(rain.index.max(), met.index.max().floor("1h"))
    hours = pd.date_range(t_start, t_end, freq="1h")
    P = rain.reindex(hours); assert P.notna().all(); miss = missing.reindex(hours).astype(bool)
    days = pd.date_range(hours[0].normalize(), hours[-1].normalize(), freq="1D")
    ts = tsoil.reindex(days); assert ts.notna().all()
    ta = air.reindex(days); measured = ta.notna(); ta = ta.where(measured, slope * ts + icpt)
    ra, dl = extraterrestrial_radiation(days.dayofyear.values, np.deg2rad(c["latitude_deg"]))
    pe_day = pd.Series(np.where(ta.values > -5, ra / c["lambda_MJ_per_kg"] * (ta.values + 5) / 100, 0.0), index=days); dl = pd.Series(dl, index=days)
    centre = hours - pd.Timedelta("30min"); hod = centre.hour + centre.minute / 60; d = centre.normalize()
    L = dl.reindex(d).values; x = (hod - (12 - L / 2)) / L
    w = np.where((x > 0) & (x < 1), np.sin(np.pi * x), 0.0); wsum = pd.Series(w, index=hours).groupby(d).transform("sum").values
    assert (wsum > 0).all(); PE = pe_day.reindex(d).values * w / wsum
    Pg = P.values.copy()
    if c["interception_capacity_mm"] > 0: Pn, EI = bucket(Pg, PE, c["interception_capacity_mm"])
    else: Pn, EI = Pg.copy(), np.zeros_like(Pg)
    sens = {str(C): float(bucket(Pg, PE, C)[0].sum() / Pg.sum()) for C in c["interception_capacity_range_mm"]} if c["interception_capacity_mm"] > 0 else {}
    obs_all = met.reindex(hours)
    s0 = {str(z): float(obs_all[f"s {z}"].iloc[0]) for z in c["depths_cm"]}; assert all(np.isfinite(v) and v > 0 for v in s0.values())
    hours, Pn, Pg, PE, EI, miss, obs = hours[1:], Pn[1:], Pg[1:], PE[1:], EI[1:], miss.iloc[1:], obs_all.iloc[1:]
    lst = lambda col, nd: [None if np.isnan(v) else round(float(v), nd) for v in obs[col].values]
    out = {"config": c, "t_init": str(obs_all.index[0]), "s0_kPa": s0, "t0": str(hours[0]), "n_hours": len(hours),
           "P_mm": np.round(Pn, 3).tolist(), "P_gross_mm": np.round(Pg, 3).tolist(), "PE_mm": np.round(PE, 4).tolist(), "EI_mm": np.round(EI, 4).tolist(),
           "rain_missing": np.flatnonzero(miss.values).tolist(),
           "obs": {str(z): lst(f"VWC {z}", 4) for z in c["depths_cm"]}, "obs_s": {str(z): lst(f"s {z}", 2) for z in c["depths_cm"]},
           "air_temperature": {"measured_days": int(measured.sum()), "estimated_days": int((~measured).sum()), "regression": {"slope": float(slope), "intercept": float(icpt), "r2": r2, "n_days": int(len(j))}},
           "totals": {"P_gross_mm": float(Pg.sum()), "P_net_mm": float(Pn.sum()), "net_fraction": float(Pn.sum() / Pg.sum()), "net_fraction_for_capacity_range": sens,
                      "interception_evaporation_mm": float(EI.sum()), "PE_mm": float(PE.sum()), "PE_daily_max": float(pe_day.max()), "PE_daily_min": float(pe_day.min())}}
    print(SITE, out["t0"], out["n_hours"], json.dumps(out["totals"]), out["air_temperature"])
    json.dump(out, open(c["out"], "w"), separators=(",", ":"), allow_nan=False)
if __name__ == "__main__":
    main(CONFIG)

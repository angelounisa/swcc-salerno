"""Hourly forcing + observations for the Richards simulation, bare-soil (NV) site.
Units: rain and PE in mm per hour; theta m3/m3; suction kPa.
PE: Oudin et al. (2005), PE[mm/d] = Ra/(lambda*rho) * (T+5)/100 for T > -5 C, else 0,
    with Ra = extraterrestrial radiation (FAO-56 eq. 21), lambda = 2.45 MJ/kg.
    T = daily mean SOIL temperature at 15 cm (NV) used as proxy for air temperature (no air T available).
    Daily PE is distributed over daylight hours with a half-sine shape.
Usage: python prep_forcing.py rain.xlsx meter.xlsx temp.xlsx out.json depths(e.g. 15,30,60)
"""
import json, sys
import numpy as np, pandas as pd

CONFIG = {
    "rain_file": sys.argv[1], "meter_file": sys.argv[2], "temp_file": sys.argv[3], "out": sys.argv[4],
    "latitude_deg": 40.7,               # Salerno / Cava de' Tirreni
    "lambda_MJ_per_kg": 2.45,
    "temp_column": "T 15",
    "depths_cm": [int(x) for x in sys.argv[5].split(",")],   # 15,30,60 (NV) or 15,35,60 (V)
    "missing_rain_as_zero": True,       # 136 missing hours (110 of them 16-21 Feb 2025)
}

def extraterrestrial_radiation(doy, lat_rad):
    """FAO-56 eq. 21-25, MJ m-2 d-1."""
    gsc = 0.0820
    dr = 1 + 0.033 * np.cos(2 * np.pi * doy / 365)
    dec = 0.409 * np.sin(2 * np.pi * doy / 365 - 1.39)
    ws = np.arccos(-np.tan(lat_rad) * np.tan(dec))
    ra = 24 * 60 / np.pi * gsc * dr * (ws * np.sin(lat_rad) * np.sin(dec) + np.cos(lat_rad) * np.cos(dec) * np.sin(ws))
    daylength_h = 24 / np.pi * ws
    return ra, daylength_h

def main(c):
    rain = pd.read_excel(c["rain_file"]).set_index("Data_fine_ora")["P_unificata_mm"]
    assert rain.index.to_series().diff().dropna().eq(pd.Timedelta("1h")).all()
    missing = rain.isna()
    assert c["missing_rain_as_zero"]
    rain = rain.fillna(0.0)
    assert (rain >= 0).all()

    met = pd.read_excel(c["meter_file"]).set_index("Time")
    temp = pd.read_excel(c["temp_file"]).set_index("Time")[c["temp_column"]]

    # hourly grid: state at the END of each hour (rain label = end of hour)
    t_start = met.index.min().ceil("1h")
    t_end = min(rain.index.max(), met.index.max().floor("1h"))
    hours = pd.date_range(t_start, t_end, freq="1h")
    P = rain.reindex(hours)
    assert P.notna().all(), "rain must cover the whole simulation period"
    miss = missing.reindex(hours).astype(bool)

    # PE
    tday = temp.resample("1D").mean()
    days = pd.date_range(hours[0].normalize(), hours[-1].normalize(), freq="1D")
    tday = tday.reindex(days)
    assert tday.notna().all(), "soil temperature missing on some day"
    doy = days.dayofyear.values
    ra, dl = extraterrestrial_radiation(doy, np.deg2rad(c["latitude_deg"]))
    pe_day = np.where(tday.values > -5, ra / c["lambda_MJ_per_kg"] * (tday.values + 5) / 100, 0.0)  # mm/d
    pe_day = pd.Series(pe_day, index=days); dl = pd.Series(dl, index=days)
    # hour ending at t covers (t-1h, t]; centre at t-0.5h; half-sine centred at 12:00 solar (~12:20 local CET, ignored)
    centre = (hours - pd.Timedelta("30min"))
    hod = centre.hour + centre.minute / 60
    d = centre.normalize()
    L = dl.reindex(d).values
    x = (hod - (12 - L / 2)) / L
    w = np.where((x > 0) & (x < 1), np.sin(np.pi * x), 0.0)
    # normalise per day so that sum of hourly PE = daily PE
    wsum = pd.Series(w, index=hours).groupby(d).transform("sum").values
    assert (wsum > 0).all()
    PE = pe_day.reindex(d).values * w / wsum
    # first/last partial days: weights normalised over available hours only -> flag
    assert np.all(np.isfinite(PE))

    # observations at full hours (instantaneous 5-min sample)
    obs_all = met.reindex(hours)
    # alignment: initial state = observation at hours[0]; step j applies the forcing of the hour ending at
    # hours[j+1] and its output is compared with the observation at hours[j+1]
    s0 = {str(z): float(obs_all[f"s {z}"].iloc[0]) for z in c["depths_cm"]}
    assert all(np.isfinite(v) and v > 0 for v in s0.values())
    hours, P, PE, miss = hours[1:], P.iloc[1:], PE[1:], miss.iloc[1:]
    obs = obs_all.iloc[1:]
    out = {
        "config": c, "t_init": str(obs_all.index[0]), "s0_kPa": s0,
        "t0": str(hours[0]), "n_hours": len(hours),
        "P_mm": P.round(3).tolist(), "PE_mm": np.round(PE, 4).tolist(),
        "rain_missing": np.flatnonzero(miss.values).tolist(),
        "obs": {str(z): [None if np.isnan(v) else round(float(v), 4) for v in obs[f"VWC {z}"].values] for z in c["depths_cm"]},
        "obs_s": {str(z): [None if np.isnan(v) else round(float(v), 2) for v in obs[f"s {z}"].values] for z in c["depths_cm"]},
        "totals": {"P_mm": float(P.sum()), "PE_mm": float(PE.sum()), "PE_summer_daily_max": float(pe_day.max()),
                   "PE_winter_daily_min": float(pe_day.min())},
    }
    print(out["t0"], out["n_hours"], out["totals"])
    with open(c["out"], "w") as f:
        json.dump(out, f, separators=(",", ":"), allow_nan=False)

if __name__ == "__main__":
    main(CONFIG)

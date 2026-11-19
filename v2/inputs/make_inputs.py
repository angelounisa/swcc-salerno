"""Meter files for the v2 analysis: theta = the user's calibration (DATI_CAL__COMEGNA.xlsx, columns under
CALIBRAZIONE), suction = the already calibrated suction of the previous files (unchanged), time base of the previous
files (consistent with the rain, see remap.py / rainlag.py), cut at the end of the rain series.
Usage: python make_inputs.py NV_cal_oldtime.csv V_cal_oldtime.csv rain.xlsx out_dir
Writes out_dir/NV_cal.xlsx, V_cal.xlsx (+ csv) and out_dir/theta_calibration.json (provenance; no calibration range)."""
import sys, json, pandas as pd
rain = pd.read_excel(sys.argv[3]).set_index('Data_fine_ora')['P_unificata_mm']
T_END = pd.Timestamp(rain.index.max())          # last hour with rain data (hour ending)
out = sys.argv[4]; info = {}
for tag, f in [('NV', sys.argv[1]), ('V', sys.argv[2])]:
    d = pd.read_csv(f, parse_dates=['Time'])
    d = d[d.Time <= T_END].reset_index(drop=True)
    assert d.Time.is_monotonic_increasing and d.Time.is_unique
    d.to_excel(f'{out}/{tag}_cal.xlsx', index=False); d.to_csv(f'{out}/{tag}_cal.csv', index=False)
    info[tag] = {'rows': len(d), 'first': str(d.Time.min()), 'last': str(d.Time.max()),
                 'theta_range': {c: [float(d[c].min()), float(d[c].max())] for c in d.columns if c.startswith('VWC')},
                 'missing_theta': {c: int(d[c].isna().sum()) for c in d.columns if c.startswith('VWC')}}
    print(tag, info[tag])
cal = {'source': 'user calibration, DATI_CAL__COMEGNA.xlsx (columns under CALIBRAZIONE), received 19/11/2026',
       'suction': 'unchanged from the previous files (already calibrated)',
       'time_base': 'previous files (rain-consistent); the workbook timestamps are shifted (DST and a jump on 18/12/2025: 10 h 40 min NV, 25 h 05 min V), rows matched through the raw VWC',
       'cut_at_rain_end': str(T_END), 'calibrated_file_last_time': str(T_END),
       'config': {'layer_of': {'15': 'A1', '30': 'A2', '35': 'A2', '60': 'A2'}},
       'functions': {'A1': {'theta_cal_range': None}, 'A2': {'theta_cal_range': None}},   # range of validity not supplied: extrapolation check not applicable
       'sites': info}
json.dump(cal, open(f'{out}/theta_calibration.json', 'w'), indent=1)

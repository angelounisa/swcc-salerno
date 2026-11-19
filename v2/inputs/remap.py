# Put the user's calibrated VWC on the time base of the old files (data.xlsx, dataV.xlsx), which matches the rain
# (lag 0 h in every period, rainlag.py), while the new workbook's timestamps drift (DST, and a spurious jump of
# 10 h 40 min at NV and 25 h 05 min at V on 18/12/2025). Rows are matched through the raw VWC columns, which are
# the same logger readings in both files: for every new row the offset is chosen among the candidate offsets found
# in offsets_<site>.csv as the one with the most exact raw matches (all 3 depths) in a +-3 h window.
# Output: <site>_cal_oldtime.csv with Time (old time base), calibrated VWC (from the workbook) and suction s (old file).
import sys, pandas as pd, numpy as np
HALF_W = 36                                            # half window, rows (3 h)
for tag, f, vc, sc in [('NV', '/home/claude/work/data.xlsx', ['VWC 15', 'VWC 30', 'VWC 60'], ['s 15', 's 30', 's 60']),
                       ('V', '/home/claude/work/dataV.xlsx', ['VWC 15', 'VWC 35', 'VWC 60'], ['s 15', 's 35', 's 60'])]:
    old = pd.read_excel(f).rename(columns={'Time': 't'}).set_index('t'); raw = pd.read_pickle(f'raw_{tag}.pkl').reset_index(drop=True)
    cal = pd.read_pickle(f'cal_{tag}.pkl').reset_index(drop=True)
    wk = pd.read_csv(f'offsets_{tag}.csv', parse_dates=['week']).dropna(subset=['offset_min'])
    wk['offset_min'] = wk.offset_min.astype(int)
    R = raw[['r15', 'r30', 'r60']].values
    def eq(k):   # exact match of the raw readings for offset k: all depths present in both equal, at least 2 depths present
        O = old[vc].reindex(raw.t + pd.Timedelta(minutes=int(k))).values; pres = np.isfinite(O) & np.isfinite(R)
        return (np.isclose(O, R, atol=1e-9) | ~pres).all(axis=1) & (pres.sum(axis=1) >= 2)
    # piecewise-constant offset: weekly offsets, the switch row of each change found by maximising the exact matches
    # (offset a before the switch, b after) between the last week with a and the first week with b
    E = {k: eq(k) for k in wk.offset_min.unique()}
    off = np.full(len(raw), wk.offset_min.iloc[0]); prev = wk.iloc[0]
    for _, w in wk.iloc[1:].iterrows():
        a_, b_ = int(prev.offset_min), int(w.offset_min)
        if a_ != b_:
            lo = int(np.searchsorted(raw.t.values, np.datetime64(prev.week))); hi = int(np.searchsorted(raw.t.values, np.datetime64(w.week + pd.Timedelta('7D'))))
            ca = np.concatenate([[0], np.cumsum(E[a_][lo:hi])]); cb = np.concatenate([[0], np.cumsum(E[b_][lo:hi][::-1])])[::-1]
            sw = lo + int(np.argmax(ca + cb)); off[sw:] = b_
            print(f'  switch {a_:+d} -> {b_:+d} min at new time {raw.t[sw]}')
        prev = w
    t_old = raw.t + pd.to_timedelta(off, unit='m')
    Ot = old[vc].reindex(t_old).values; pres = np.isfinite(Ot) & np.isfinite(R)
    exact = (np.isclose(Ot, R, atol=1e-9) | ~pres).all(axis=1) & (pres.sum(axis=1) >= 2)
    out = pd.DataFrame({'Time': t_old.values, 'VWC 15': cal.c15.values, vc[1]: cal.c30.values, 'VWC 60': cal.c60.values})
    keep = exact                                         # only rows whose raw readings match the old row exactly
    out = out[keep].drop_duplicates('Time')
    assert out.Time.is_monotonic_increasing, 'mapping not monotonic'
    s = old[sc].reindex(out.Time).values; out[sc[0]], out[sc[1]], out[sc[2]] = s[:, 0], s[:, 1], s[:, 2]
    cands = sorted(set(off)); seg = pd.Series(off).ne(pd.Series(off).shift()).cumsum()
    print(tag, 'candidate offsets', cands)
    print(' segments (start new time, offset min, rows):', [(str(raw.t[g.index[0]]), int(off[g.index[0]]), len(g)) for _, g in pd.Series(off).groupby(seg)])
    print(' rows new', len(raw), 'matched exactly', int(exact.sum()), f'({exact.mean():.4f})', 'old rows', len(old), 'old rows covered', out.Time.isin(old.index).sum(),
          'old rows not covered', len(old) - out.Time.isin(old.index).sum())
    print(' calibrated range', out.Time.min(), out.Time.max())
    out.to_csv(f'{tag}_cal_oldtime.csv', index=False, date_format='%Y-%m-%d %H:%M:%S')

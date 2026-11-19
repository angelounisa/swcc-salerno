# Offset (minutes to ADD to the new timestamps to land on the old file's timestamps) in sliding 7-day windows,
# from the correlation of the hourly-free 5-min wetting jumps summed over depths (old raw vs new raw), search +-30 h.
# Also lists the gaps in the new file. Output: offsets_<site>.csv
import pandas as pd, numpy as np
for tag, f, cols in [('NV', '/home/claude/work/data.xlsx', ['VWC 15', 'VWC 30', 'VWC 60']), ('V', '/home/claude/work/dataV.xlsx', ['VWC 15', 'VWC 35', 'VWC 60'])]:
    old = pd.read_excel(f).rename(columns={'Time': 't'}).set_index('t')[cols]; old.columns = ['r15', 'r30', 'r60']
    new = pd.read_pickle(f'raw_{tag}.pkl').set_index('t')[['r15', 'r30', 'r60']]
    gaps = new.index.to_series().diff(); print(tag, 'gaps in new >5 min:', [(str(t), str(d)) for t, d in gaps[gaps > pd.Timedelta('5min')].items()])
    go = old.index.to_series().diff(); print(tag, 'gaps in old >5 min:', [(str(t), str(d)) for t, d in go[go > pd.Timedelta('5min')].items()][:10], 'n', int((go > pd.Timedelta('5min')).sum()))
    grid = pd.date_range('2025-01-30', '2026-11-20', freq='5min')
    O = old.reindex(grid).diff().clip(lower=0).sum(axis=1, min_count=3).values; N = new.reindex(grid).diff().clip(lower=0).sum(axis=1, min_count=3).values
    rows = []
    for w0 in pd.date_range('2025-01-31', '2026-09-30', freq='7D'):
        sel = np.where((grid >= w0) & (grid < w0 + pd.Timedelta('7D')))[0]; best = (np.nan, None, np.nan)
        for k in range(-360, 361):
            j = sel - k; ok = (j >= 0) & (j < len(grid)); a = O[sel[ok]]; b = N[j[ok]]; g = np.isfinite(a) & np.isfinite(b)
            if g.sum() < 500 or a[g].std() == 0 or b[g].std() == 0: continue
            r = np.corrcoef(a[g], b[g])[0, 1]
            if not np.isfinite(best[0]) or r > best[0]: best = (r, k * 5, int(g.sum()))
        rows.append((w0, best[1], best[0], best[2]))
    df = pd.DataFrame(rows, columns=['week', 'offset_min', 'r', 'n']); df.to_csv(f'offsets_{tag}.csv', index=False)
    print(df.to_string())

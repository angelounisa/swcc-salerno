# Which time base matches the rain? Lag (h) maximising corr(rain(t), wetting jump at 15 cm(t+L)), per period,
# for the new file (as given) and the old file. A physically consistent time base gives a small, stable lag >= 0.
import pandas as pd, numpy as np
rain = pd.read_excel('/home/claude/work/rain/unif.xlsx').set_index('Data_fine_ora')['P_unificata_mm']
rain.index = pd.to_datetime(rain.index)
print('rain', rain.index.min(), rain.index.max(), 'step', rain.index.to_series().diff().mode()[0])
per = [('2025-02-01', '2025-03-29'), ('2025-04-01', '2025-10-24'), ('2025-10-27', '2025-12-17'), ('2025-12-19', '2026-03-28'), ('2026-03-30', '2026-07-30')]
for tag, f in [('NV', '/home/claude/work/data.xlsx'), ('V', '/home/claude/work/dataV.xlsx')]:
    old = pd.read_excel(f).rename(columns={'Time': 't'}).set_index('t')['VWC 15']
    new = pd.read_pickle(f'raw_{tag}.pkl').set_index('t')['r15']
    for lab, s in [('new', new), ('old', old)]:
        # hourly value at the END of each hour, like Data_fine_ora
        h = s.resample('1h', label='right', closed='right').last(); j = h.diff().clip(lower=0)
        out = []
        for a, b in per:
            r = rain.loc[a:b]; best = []
            for L in range(-30, 31):
                y = j.shift(-L).reindex(r.index); g = y.notna() & r.notna()
                if g.sum() > 200: best.append((np.corrcoef(r[g], y[g])[0, 1], L))
            best.sort(reverse=True); out.append(f"{a[:7]}..{b[:7]}: L={best[0][1]:+d} h (r {best[0][0]:.2f})")
        print(tag, lab, ' | '.join(out))

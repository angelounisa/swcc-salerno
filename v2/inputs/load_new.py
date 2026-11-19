# Read the user's calibrated workbook (columns under CALIBRAZIONE, plus the raw columns beside them) and save as pickle.
# Timestamps come in two forms: text 'dd/mm/yyyy HH:MM' and Excel dates. The Excel dates are the cells whose day was
# <= 12 and were read by Excel as month/day: their month and day are swapped back. The result must be strictly
# increasing with a 5-minute step (checked below), otherwise the script stops.
import sys, datetime as dt, pandas as pd
f = sys.argv[1]
def fix(x):
    if isinstance(x, str): return dt.datetime.strptime(x, '%d/%m/%Y %H:%M')
    if isinstance(x, dt.datetime):
        if x.day > 12: raise ValueError(f'Excel date with day > 12 cannot be a swapped one: {x}')
        return x.replace(month=x.day, day=x.month)
    raise TypeError(f'unexpected timestamp {x!r}')
for sh, tag in [('NONVEG', 'NV'), ('VEG', 'V')]:
    df = pd.read_excel(f, sheet_name=sh, header=1)
    raw = df.iloc[:, 0:4].copy(); cal = df.iloc[:, 5:9].copy()
    raw.columns = ['t', 'r15', 'r30', 'r60']; cal.columns = ['t', 'c15', 'c30', 'c60']
    raw = raw.dropna(subset=['t']); cal = cal.dropna(subset=['t'])
    for d in (raw, cal): d['t'] = pd.to_datetime(d['t'].map(fix))
    assert (raw.t.values == cal.t.values).all()
    st = cal.t.diff().dropna()
    print(tag, len(cal), cal.t.min(), cal.t.max(), 'steps:', st.value_counts().head(5).to_dict(), 'non-increasing:', int((st <= pd.Timedelta(0)).sum()))
    assert (st > pd.Timedelta(0)).all(), 'timestamps not strictly increasing'
    print('  NaN in cal:', cal[['c15','c30','c60']].isna().sum().to_dict(), 'ranges:', {c: (round(cal[c].min(),3), round(cal[c].max(),3)) for c in ['c15','c30','c60']})
    raw.to_pickle(f'raw_{tag}.pkl'); cal.to_pickle(f'cal_{tag}.pkl')

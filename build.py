"""Assemble the dashboard: site/body.html + branch analysis (results_*.json) + data-only comparison of the two plots
+ results of the numerical model (sim/sim2_results.json, own tab, view site/drying_view.js)
-> site/artifact.html (Claude artifact) and repo/docs/index.html (GitHub Pages)."""
import json, pathlib, shutil
body = pathlib.Path('site/body.html').read_text()
data = json.dumps({'NV': json.load(open('results_NV.json')), 'V': json.load(open('results_V.json'))}, separators=(',', ':'), allow_nan=False)
view = pathlib.Path('site/compare_view.js').read_text()
SWm = json.load(open('swcc_main.json'))
for v in SWm['sensors'].values(): v.pop('cloud')          # not shown in the dashboard
CMP = {'cmp': json.load(open('compare.json')), 'swcc': {'sensors': SWm['sensors'], 'shared': SWm['shared']}, 'kfield': json.load(open('kfield.json')),
       'thetaCal': json.load(open('cal/theta_calibration.json')), 'eventsSummary': json.load(open('sim/infiltration_events.json'))['summary'],
       'mech': json.load(open('mechanisms.json')), 'stab': json.load(open('stability.json')), 'qc': json.load(open('qc.json'))}
CMP['stab']['series'] = {k: v for k, v in CMP['stab']['series'].items() if not k.startswith('sig_')}     # suction-stress series not plotted
S2 = json.load(open('sim/sim2_results.json')); S2['events'] = json.load(open('sim/infiltration_events.json'))
S2['swcc'] = {'sensors': SWm['sensors'], 'shared': SWm['shared'], 'config': SWm['config']}; S2['kfield'] = CMP['kfield']
S2['thetaCal'] = CMP['thetaCal']; S2['baselineVertical'] = json.load(open('sim/baseline_vertical.json')); S2['excess'] = json.load(open('sim/excess.json'))
S2['verify'] = json.load(open('verify/out_cmp.json'))
for s_ in S2['sites'].values(): assert s_['model']['slope_deg'] == CMP['stab']['config']['beta_deg'], 'model and stability use different slopes'
modview = pathlib.Path('site/drying_view.js').read_text() + '\n' + pathlib.Path('site/exp_view.js').read_text() + '\n' + pathlib.Path('site/event_view.js').read_text()
EXP = {'par': S2['params'], 'chk': json.load(open('exp/autumn_check.json'))}
EVT = {'soil': json.load(open('exp/ev_soil_summary.json')), 'ev': json.load(open('exp/ev_summary.json'))}   # event-scale inverse analysis (model tab, section 4)    # numerical experiments not shown: the model does not reproduce wetting
assert body.count('/*DATA*/null') == 1 and body.count('/*CMP*/null') == 1 and body.count('/*SIM2*/null') == 1 and body.count('/*EXP*/null') == 1 and body.count('/*EVT*/null') == 1
page = (body.replace('/*DATA*/null', data).replace('/*CMP*/null', json.dumps(CMP, separators=(',', ':'), allow_nan=False))
        .replace('/*SIM2*/null', json.dumps(S2, separators=(',', ':'), allow_nan=False)).replace('/*EXP*/null', json.dumps(EXP, separators=(',', ':'), allow_nan=False)).replace('/*EVT*/null', json.dumps(EVT, separators=(',', ':'), allow_nan=False)) + '\n' + view + '\n' + modview)
pathlib.Path('site/artifact.html').write_text(page)
repo = pathlib.Path('repo'); (repo / 'docs').mkdir(parents=True, exist_ok=True)
head_end = page.index('</style>') + len('</style>')
full = ('<!doctype html>\n<html lang="it">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + page[:head_end] + '\n</head>\n<body>\n' + page[head_end:] + '\n</body>\n</html>\n')
(repo / 'docs' / 'index.html').write_text(full)
for d in ('sim', 'site', 'verify', 'data', 'exp'): (repo / d).mkdir(exist_ok=True)
for fn in ['common.js', 'attribution.js', 'events.js', 'memory.js', 'autumn_check.js', 'attribution.json', 'events.json', 'memory.json', 'autumn_check.json',
           'ev_common.js', 'ev_soil.js', 'ev_soil_bi.js', 'ev_forest.js', 'ev_summary.js', 'ev_soil_summary.js', 'ev_soil.json', 'ev_soil_c1.json', 'ev_soil_c2.json', 'ev_bi_1.json', 'ev_bi_2.json',
           'ev_soil_final.json', 'ev_soil_alt.json', 'evf_V_0.json', 'evf_V_1.json', 'evf_NV_0.json', 'evf_NV_1.json', 'evfalt_V_0.json', 'evfalt_V_1.json', 'evfalt_NV_0.json', 'evfalt_NV_1.json',
           'ev_summary.json', 'ev_soil_summary.json', 'run_events.sh']: shutil.copy('exp/' + fn, repo / 'exp' / fn)
for fn in ['analysis.py', 'calibrate_theta.py', 'swcc_main.py', 'kfield.py', 'compare_plots.py', 'stability.py', 'mechanisms.py', 'qc.py', 'build.py', 'run_pipeline.sh',
           'results_NV.json', 'results_V.json', 'swcc_main.json', 'kfield.json', 'compare.json', 'stability.json', 'mechanisms.json', 'qc.json']:
    shutil.copy(fn, repo / fn)
shutil.copy('cal/theta_calibration.json', repo / 'theta_calibration.json')
for fn in ['results_NV.json', 'results_V.json']: shutil.copy(fn, repo / 'docs' / fn)
for fn in ['body.html', 'compare_view.js', 'drying_view.js', 'exp_view.js', 'event_view.js']: shutil.copy('site/' + fn, repo / 'site' / fn)     # drying_view.js: page of the model results, not built
for fn in ['solver.js', 'prep_forcing2.py', 'calib_dry2.js', 'final4.js', 'run3.js', 'build_models.py', 'save_baseline.py', 'test_slope.js', 'excess.js', 'excess.json',
           'baseline_vertical.json', 'infil_events.py', 'model_NV.json', 'model_V.json', 'fits_main.json', 'calibdry2_NV.json', 'calibdry2_V.json',
           'infiltration_events.json', 'forcing_NV.json', 'forcing_V.json', 'sim2_results.json']:
    shutil.copy('sim/' + fn, repo / 'sim' / fn)
for fn in ['ref_solver.py', 'compare.js', 'out_cmp.json', 'compare.log']: shutil.copy('verify/' + fn, repo / 'verify' / fn)
shutil.copy('rain/air_T_RH_2025_from_slides.csv', repo / 'data' / 'air_T_RH_2025_from_slides.csv')
print(len(page) / 1e6, 'MB')

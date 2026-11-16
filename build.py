"""Assemble the dashboard: site/body.html + analysis results + model results (sim/sim2_results.json)
-> site/artifact.html (Claude artifact) and repo/docs/index.html (GitHub Pages)."""
import json, pathlib, shutil
body = pathlib.Path('site/body.html').read_text()
data = json.dumps({'NV': json.load(open('results_NV.json')), 'V': json.load(open('results_V.json'))}, separators=(',', ':'), allow_nan=False)
view = pathlib.Path('site/drying_view.js').read_text()
S2 = json.load(open('sim/sim2_results.json')); S2['events'] = json.load(open('sim/infiltration_events.json'))
SWm = json.load(open('swcc_main.json'))
for v in SWm['sensors'].values(): v.pop('cloud')          # not shown in the dashboard
S2['swcc'] = {'sensors': SWm['sensors'], 'shared': SWm['shared'], 'config': SWm['config']}; S2['kfield'] = json.load(open('kfield.json'))
S2['thetaCal'] = json.load(open('cal/theta_calibration.json'))
S2['baselineVertical'] = json.load(open('sim/baseline_vertical.json')); S2['excess'] = json.load(open('sim/excess.json'))
S2['verify'] = json.load(open('verify/out_cmp.json'))
sim2 = json.dumps(S2, separators=(',', ':'), allow_nan=False)
assert body.count('/*DATA*/null') == 1 and body.count('/*SIM2*/null') == 1
page = body.replace('/*DATA*/null', data).replace('/*SIM2*/null', sim2) + '\n' + view
pathlib.Path('site/artifact.html').write_text(page)
repo = pathlib.Path('repo'); (repo / 'docs').mkdir(parents=True, exist_ok=True)
head_end = page.index('</style>') + len('</style>')
full = ('<!doctype html>\n<html lang="it">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + page[:head_end] + '\n</head>\n<body>\n' + page[head_end:] + '\n</body>\n</html>\n')
(repo / 'docs' / 'index.html').write_text(full)
shutil.copy('analysis.py', repo / 'analysis.py')
(repo / 'sim').mkdir(exist_ok=True); (repo / 'site').mkdir(exist_ok=True)
for fn in ['solver.js', 'prep_forcing2.py', 'calib_dry2.js', 'final4.js', 'run3.js', 'build_models.py', 'save_baseline.py', 'test_slope.js', 'excess.js', 'excess.json', 'baseline_vertical.json', 'infil_events.py', 'model_NV.json', 'model_V.json', 'fits_main.json',
           'calibdry2_NV.json', 'calibdry2_V.json', 'infiltration_events.json', 'forcing_NV.json', 'forcing_V.json']:
    shutil.copy('sim/' + fn, repo / 'sim' / fn)
for fn in ['swcc_main.py', 'kfield.py', 'swcc_main.json', 'kfield.json']:
    shutil.copy(fn, repo / fn)
shutil.copy('calibrate_theta.py', repo / 'calibrate_theta.py'); shutil.copy('cal/theta_calibration.json', repo / 'theta_calibration.json')
(repo / 'verify').mkdir(exist_ok=True)
for fn in ['ref_solver.py', 'compare.js', 'out_cmp.json', 'compare.log']:
    shutil.copy('verify/' + fn, repo / 'verify' / fn)
shutil.copy('run_pipeline.sh', repo / 'run_pipeline.sh')
(repo / 'data').mkdir(exist_ok=True); shutil.copy('rain/air_T_RH_2025_from_slides.csv', repo / 'data' / 'air_T_RH_2025_from_slides.csv')
for fn in ['body.html', 'drying_view.js']:
    shutil.copy('site/' + fn, repo / 'site' / fn)
shutil.copy('build.py', repo / 'build.py')
for fn in ['results_NV.json', 'results_V.json']:
    shutil.copy(fn, repo / 'docs' / fn); shutil.copy(fn, repo / fn)   # root copy is what sim/*.js read (../results_*.json)
shutil.copy('sim/sim2_results.json', repo / 'sim' / 'sim2_results.json')
print(len(page) / 1e6, 'MB')

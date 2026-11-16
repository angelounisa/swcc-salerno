"""Assemble the dashboard: site/body.html + branch analysis (results_*.json) + data-only comparison of the two plots
-> site/artifact.html (Claude artifact) and repo/docs/index.html (GitHub Pages). The numerical model (sim/, verify/) is
kept in the repository but is not part of the page."""
import json, pathlib, shutil
body = pathlib.Path('site/body.html').read_text()
data = json.dumps({'NV': json.load(open('results_NV.json')), 'V': json.load(open('results_V.json'))}, separators=(',', ':'), allow_nan=False)
view = pathlib.Path('site/compare_view.js').read_text()
SWm = json.load(open('swcc_main.json'))
for v in SWm['sensors'].values(): v.pop('cloud')          # not shown in the dashboard
CMP = {'cmp': json.load(open('compare.json')), 'swcc': {'sensors': SWm['sensors'], 'shared': SWm['shared']}, 'kfield': json.load(open('kfield.json')),
       'thetaCal': json.load(open('cal/theta_calibration.json')), 'eventsSummary': json.load(open('sim/infiltration_events.json'))['summary']}
assert body.count('/*DATA*/null') == 1 and body.count('/*CMP*/null') == 1
page = body.replace('/*DATA*/null', data).replace('/*CMP*/null', json.dumps(CMP, separators=(',', ':'), allow_nan=False)) + '\n' + view
pathlib.Path('site/artifact.html').write_text(page)
repo = pathlib.Path('repo'); (repo / 'docs').mkdir(parents=True, exist_ok=True)
head_end = page.index('</style>') + len('</style>')
full = ('<!doctype html>\n<html lang="it">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + page[:head_end] + '\n</head>\n<body>\n' + page[head_end:] + '\n</body>\n</html>\n')
(repo / 'docs' / 'index.html').write_text(full)
for d in ('sim', 'site', 'verify', 'data'): (repo / d).mkdir(exist_ok=True)
for fn in ['analysis.py', 'calibrate_theta.py', 'swcc_main.py', 'kfield.py', 'compare_plots.py', 'build.py', 'run_pipeline.sh',
           'results_NV.json', 'results_V.json', 'swcc_main.json', 'kfield.json', 'compare.json']:
    shutil.copy(fn, repo / fn)
shutil.copy('cal/theta_calibration.json', repo / 'theta_calibration.json')
for fn in ['results_NV.json', 'results_V.json']: shutil.copy(fn, repo / 'docs' / fn)
for fn in ['body.html', 'compare_view.js', 'drying_view.js']: shutil.copy('site/' + fn, repo / 'site' / fn)     # drying_view.js: page of the model results, not built
for fn in ['solver.js', 'prep_forcing2.py', 'calib_dry2.js', 'final4.js', 'run3.js', 'build_models.py', 'save_baseline.py', 'test_slope.js', 'excess.js', 'excess.json',
           'baseline_vertical.json', 'infil_events.py', 'model_NV.json', 'model_V.json', 'fits_main.json', 'calibdry2_NV.json', 'calibdry2_V.json',
           'infiltration_events.json', 'forcing_NV.json', 'forcing_V.json', 'sim2_results.json']:
    shutil.copy('sim/' + fn, repo / 'sim' / fn)
for fn in ['ref_solver.py', 'compare.js', 'out_cmp.json', 'compare.log']: shutil.copy('verify/' + fn, repo / 'verify' / fn)
shutil.copy('rain/air_T_RH_2025_from_slides.csv', repo / 'data' / 'air_T_RH_2025_from_slides.csv')
print(len(page) / 1e6, 'MB')

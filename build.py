import json, pathlib, shutil
body = pathlib.Path('site/body.html').read_text()
data = json.dumps({'NV': json.load(open('results_NV.json')), 'V': json.load(open('results_V.json'))}, separators=(',',':'))
sim_view = pathlib.Path('site/sim_view.js').read_text()
solver = pathlib.Path('sim/solver.js').read_text()
assert '</script' not in solver
F = json.load(open('sim/forcing.json')); NV = json.load(open('results_NV.json')); M = json.load(open('sim/model_defaults.json'))
calib = json.load(open('sim/calibration.json'))
sim = {'forcing': {k: F[k] for k in ['t0', 'n_hours', 'P_mm', 'PE_mm', 'rain_missing', 'obs']},
       't_init': F['t_init'], 's0_kPa': F['s0_kPa'],
       'fits': {k: NV['depths'][k]['fits']['drying']['params'] for k in M['layerDepthKeys']},
       'model': M, 'calib': {'calibEnd': calib['calibEnd'], 'iCal': calib['iCal'], 'best': calib['best']}}
assert body.count('/*SIM*/null') == 1 and body.count('/*SOLVER*/') == 1 and body.count('/*DATA*/null') == 1
page = body.replace('/*DATA*/null', data).replace('/*SIM*/null', json.dumps(sim, separators=(',', ':'), allow_nan=False)).replace('/*SOLVER*/', solver)
page = page + '\n' + sim_view
pathlib.Path('site/artifact.html').write_text(page)
repo = pathlib.Path('repo'); (repo/'docs').mkdir(parents=True, exist_ok=True)
head_end = page.index('</style>') + len('</style>')
full = ('<!doctype html>\n<html lang="it">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + page[:head_end] + '\n</head>\n<body>\n' + page[head_end:] + '\n</body>\n</html>\n')
(repo/'docs'/'index.html').write_text(full)
shutil.copy('analysis.py', repo/'analysis.py'); (repo/'sim').mkdir(exist_ok=True)
for fn in ['solver.js', 'prep_forcing.py', 'calibrate.js', 'conv.js', 'model_defaults.json', 'calibration.json', 'forcing.json']: shutil.copy('sim/'+fn, repo/'sim'/fn)
shutil.copy('site/sim_view.js', repo/'site'/'sim_view.js'); shutil.copy('results_NV.json', repo/'docs'/'results_NV.json'); shutil.copy('results_V.json', repo/'docs'/'results_V.json')
print(len(page)/1e6, 'MB')

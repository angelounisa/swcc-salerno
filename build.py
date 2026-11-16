import json, pathlib, shutil
body = pathlib.Path('site/body.html').read_text()
data = json.dumps(json.load(open('results.json')), separators=(',',':'))
page = body.replace('/*DATA*/null', data)
pathlib.Path('site/artifact.html').write_text(page)
repo = pathlib.Path('repo'); (repo/'docs').mkdir(parents=True, exist_ok=True)
head_end = page.index('</style>') + len('</style>')
full = ('<!doctype html>\n<html lang="it">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + page[:head_end] + '\n</head>\n<body>\n' + page[head_end:] + '\n</body>\n</html>\n')
(repo/'docs'/'index.html').write_text(full)
shutil.copy('analysis.py', repo/'analysis.py'); shutil.copy('results.json', repo/'docs'/'results.json')
print(len(page)/1e6, 'MB')

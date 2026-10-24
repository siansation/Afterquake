"""Assemble the single-file app: src/template.html + src/*.js + data/*.json + Leaflet CSS -> index.html
Run from the repo root after `npm install`:  npm run build
"""
import json, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = lambda *a: os.path.join(root, *a)
read = lambda *a: open(p(*a), encoding='utf-8').read()
esc = lambda t: t.replace('</', '<\\/')  # keep JSON from closing its <script> tag

template = read('src', 'template.html')
css = read('node_modules', 'leaflet', 'dist', 'leaflet.css')
model = read('src', 'model.js').replace("if (typeof module !== 'undefined') module.exports = MODEL;", '')
SITE_K = "require('../data/site-term-fit.json').k"
shake = read('src', 'shake.js').replace("if(typeof module!=='undefined')module.exports=SHAKE;", '')
assert SITE_K in shake, 'src/shake.js no longer reads K from data/site-term-fit.json'
shake = shake.replace(SITE_K, repr(json.loads(read('data', 'site-term-fit.json'))['k']))
extra = json.loads(read('data', 'ground-failure-and-pager.json'))
for v in extra.values():
    if v.get('pager'):
        v['pager'].pop('cities', None)

out = (template
       .replace('__LEAFLET_CSS__', css)
       .replace('__DATA__', esc(read('data', 'sequences.json')))
       .replace('__EXTRA__', esc(json.dumps(extra, separators=(',', ':'))))
       .replace('__BASE__', esc(read('data', 'basemap.json')))
       .replace('__POP__', esc(read('data', 'population.json')))
       .replace('__AFT__', read('data', 'aftershock-shakemap-check.json'))
       .replace('__MODEL__', model)
       .replace('__SHAKE__', shake)
       .replace('__SITEFIT__', read('data', 'site-term-fit.json')))
with open(p('index.html'), 'w', encoding='utf-8', newline='\n') as f:  # same bytes on Windows and Linux
    f.write(out)
print('index.html', round(os.path.getsize(p('index.html')) / 1e6, 1), 'MB')

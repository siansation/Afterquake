"""Assemble the single-file app: src/template.html + src/*.js + data/*.json + Leaflet CSS -> index.html
Run from the repo root after `npm install`:  python scripts/build.py
"""
import json, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = lambda *a: os.path.join(root, *a)
read = lambda *a: open(p(*a), encoding='utf-8').read()
esc = lambda t: t.replace('</', '<\\/')  # keep JSON from closing its <script> tag

template = read('src', 'template.html')
css = read('node_modules', 'leaflet', 'dist', 'leaflet.css')
model = read('src', 'model.js').replace("if (typeof module !== 'undefined') module.exports = MODEL;", '')
shake = read('src', 'shake.js').replace("if(typeof module!=='undefined')module.exports=SHAKE;", '')
extra = json.loads(read('data', 'ground-failure-and-pager.json'))
for v in extra.values():
    if v.get('pager'):
        v['pager'].pop('cities', None)

# Bundle Leaflet's script inline so the page works with no internet (e.g. on stage)
leaflet_js = read('node_modules', 'leaflet', 'dist', 'leaflet.js')
cdn_tag = '<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"></script>'
assert cdn_tag in template
template = template.replace(cdn_tag, '<script>' + leaflet_js.replace('</script', '<\\/script') + '</script>')

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
with open(p('index.html'), 'w', encoding='utf-8') as f:
    f.write(out)
print('index.html', round(os.path.getsize(p('index.html')) / 1e6, 1), 'MB')

"""Assemble the single-file app: src/template.html + src/*.js + data/*.json + Leaflet, d3-geo and world outlines -> index.html
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
live = read('src', 'live.js').replace("if (typeof module !== 'undefined') module.exports = LIVE;", '')
assert 'module.exports' not in live, 'src/live.js export line changed'
# World view: d3-geo draws the globe, topojson-client decodes Natural Earth outlines (1:110m globe, 1:50m live detail maps)
geolibs = ''.join('<script>' + read('node_modules', *f.split('/')).replace('</script', '<\\/script') + '</script>\n'
                  for f in ['d3-array/dist/d3-array.min.js', 'd3-geo/dist/d3-geo.min.js', 'topojson-client/dist/topojson-client.min.js'])
world = '{' + ','.join(f'"{k}":' + read('node_modules', 'world-atlas', f + '.json')
                       for k, f in [('land110', 'land-110m'), ('countries110', 'countries-110m'), ('land50', 'land-50m'), ('countries50', 'countries-50m')]) + '}'
validation = read('src', 'validation.js').replace("if (typeof module !== 'undefined') module.exports = VALIDATION;", '')
scenario = read('src', 'scenario.js').replace("if (typeof module !== 'undefined') module.exports = SCENARIO;", '')
view_state = read('src', 'view-state.js').replace("if(typeof module!=='undefined')module.exports=VIEW_STATE;", '')
spoken = read('src', 'spoken.js').replace("if(typeof module!=='undefined')module.exports=SPOKEN;", '')
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
       .replace('__WORLD__', esc(world))
       .replace('__TOWNS__', esc(read('data', 'world-towns.json')))
       .replace('__GEOLIBS__', geolibs)
       .replace('__LIVE__', live)
       .replace('__GLOBE__', read('src', 'globe.js'))
       .replace('__MODEL__', model)
       .replace('__SHAKE__', shake)
       .replace('__VALIDATION__', validation)
       .replace('__SCENARIO__', scenario)
       .replace('__VIEW_STATE__', view_state)
       .replace('__SPOKEN__', spoken)
       .replace('__PLANNER__', read('src', 'planner.js'))
       .replace('__ASSISTANT__', read('src', 'assistant.js'))
       .replace('__ACCESS__', read('src', 'access.js'))
       .replace('__LIVE_CONTROLS__', read('src', 'live-controls.js'))
       .replace('__SITEFIT__', read('data', 'site-term-fit.json')))
with open(p('index.html'), 'w', encoding='utf-8', newline='\n') as f:  # same bytes on Windows and Linux
    f.write(out)
print('index.html', round(os.path.getsize(p('index.html')) / 1e6, 1), 'MB')

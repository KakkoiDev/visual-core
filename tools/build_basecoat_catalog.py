"""Extract one offline preview per Basecoat component; keep upstream MDX unchanged."""
import html
import json
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
GROUPS={
 'Actions and navigation':['button','button-group','breadcrumb','dropdown-menu','pagination','sidebar','tabs'],
 'Forms and selection':['field','label','input','input-group','textarea','checkbox','radio-group','switch','slider','native-select','select','combobox','command'],
 'Layout and content':['accordion','card','item','empty','table','scroll-area'],
 'Feedback and overlays':['alert','alert-dialog','dialog','drawer','popover','toast','tooltip','progress','skeleton','spinner'],
 'Identity and display':['avatar','badge','kbd','theme-switcher','chart'],
}


def build():
 target=ROOT/'examples/basecoat-catalog'; (target/'components').mkdir(parents=True,exist_ok=True)
 (target/'snippets').mkdir(exist_ok=True)
 (target/'LICENSE-basecoat.md').write_bytes((ROOT/'vendor/basecoat/LICENSE.md').read_bytes())
 docs=ROOT/'vendor/basecoat/docs/components'; items=[]
 for group,names in GROUPS.items():
  for name in names:
   source=docs/f'{name}.mdx'; text=source.read_text()
   previews=re.findall(r'<Preview\b[^>]*>([\s\S]*?)</Preview>',text)
   snippet=previews[1 if name=='toast' else 0].strip() if previews else ''
   status='offline-demo'
   note='Upstream default preview; app actions remain host responsibilities.'
   if name=='chart':
    snippet='<p>Chart.js is an optional dependency not bundled here. Read the local chart guide before adding it; no empty chart is presented as working.</p>'
    status='reference-only'; note='Requires Chart.js; not a working chart demo.'
   if name=='sidebar':
    snippet='<aside class="sidebar" aria-label="Example navigation"><nav><a href="#overview">Overview</a><a href="#settings">Settings</a></nav></aside><p>Sidebar layout reference; host owns routes.</p>'
    note='Minimal native aside from the documented structure; route data belongs to the host.'
   if name=='toast': snippet='<div id="toaster" class="toaster"></div>\n'+snippet
   # Replace documentation avatar URLs with a local inline placeholder, never fetch people photos.
   placeholder='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"%3E%3Crect width="64" height="64" fill="%23659270"/%3E%3C/svg%3E'
   snippet=re.sub(r'src="https?://[^\"]+"',lambda _: 'src="'+html.escape(placeholder,quote=True)+'"',snippet)
   (target/'snippets'/f'{name}.html').write_text(snippet+'\n')
   page='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+html.escape(name)+'</title><link rel="stylesheet" href="../../../vendor/basecoat/dist/basecoat.cdn.min.css"><script src="../../../vendor/basecoat/dist/js/all.min.js" defer></script><style>body{padding:28px;min-height:100vh}body>main{max-width:700px;margin:auto}h1{font-size:1.4rem;margin-bottom:20px}#demo{padding:24px;border:1px solid #bbb;border-radius:8px}footer{margin-top:24px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px monospace}</style><main><h1>'+html.escape(name)+'</h1><section id="demo">'+snippet+'</section><footer><p>'+html.escape(note)+'</p><a href="../../../vendor/basecoat/docs/components/'+name+'.mdx">Local upstream documentation</a><h2>Copyable HTML</h2><pre>'+html.escape(snippet)+'</pre></footer></main><script>document.addEventListener("submit",event=>event.preventDefault());</script></html>'
   (target/'components'/f'{name}.html').write_text(page)
   macro=name if (ROOT/'vendor/basecoat/templates/nunjucks'/f'{name}.njk').exists() else None
   items.append({'id':name,'group':group,'status':status,'demo':f'components/{name}.html','snippet':f'snippets/{name}.html','docs':f'vendor/basecoat/docs/components/{name}.mdx','jinja':f'vendor/basecoat/templates/jinja/{name}.html.jinja' if macro else None,'nunjucks':f'vendor/basecoat/templates/nunjucks/{name}.njk' if macro else None,'note':note})
 (target/'catalog.json').write_text(json.dumps({'version':'basecoat-1.0.2','components':items},indent=2)+'\n')
 sections=''
 for group,names in GROUPS.items():
  sections+='<section><h2>'+group+'</h2><ul>'+''.join('<li><a href="components/'+name+'.html">'+name+'</a>'+(' — reference only' if name=='chart' else '')+'</li>' for name in names)+'</ul></section>'
 (target/'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local Basecoat catalog</title><link rel="stylesheet" href="../../vendor/basecoat/dist/basecoat.cdn.min.css"><style>body{max-width:1000px;margin:auto;padding:32px}h1{font-size:2rem}h2{font-size:1.3rem;margin:20px 0 8px}ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;list-style:none}a{text-decoration:underline}</style><h1>Basecoat: local component catalog</h1><p>41 organized component references. Open a component for its demo, copyable markup and original local guide. These samples retain the Basecoat MIT license; chart needs an optional dependency.</p>'+sections+'</html>')
 rows=['# Basecoat component catalog','', 'All 41 component guides are local and pinned to Basecoat 1.0.2. Browse', '[the offline HTML catalog](../examples/basecoat-catalog/index.html) or its', '[machine-readable index](../examples/basecoat-catalog/catalog.json). Individual', 'pages include copyable HTML extracted from the upstream previews. Original MDX', 'and Jinja/Nunjucks macros remain unchanged under vendor/basecoat/.', '', 'Use the prebuilt local CSS and all.min.js; no Tailwind build or CDN is needed.', 'Copy IDs once per page; replace placeholder content with the host data. Preserve', 'labels, roles, aria relationships, keyboard behavior and focus handling. Buttons', 'and forms need real host actions. Check the exact guide for component runtime', 'requirements; keyboard behavior still needs testing in the final page.', '', 'Chart is reference-only until Chart.js is deliberately added and pinned. Toast', 'uses the local front-end API, not the upstream HTMX/server endpoint. Avatar', 'previews use an inline placeholder instead of downloading third-party pictures.', 'Sidebar is a minimal documented layout example. These adaptations are in generated', 'examples only; the upstream documentation and assets remain unchanged.', '', '| Group | Component | Local guide | Nunjucks macro |','|---|---|---|---|']
 for item in items:
  rows.append(f"| {item['group']} | [{item['id']}](../examples/basecoat-catalog/components/{item['id']}.html) | [guide](../{item['docs']}) | "+(f"[macro](../{item['nunjucks']})" if item['nunjucks'] else '—')+' |')
 rows+=['','Regenerate with `python3 tools/build_basecoat_catalog.py`. Then run the browser', 'checks. Extracted preview coverage does not mean every state is exhaustively', 'tested; see tests/README.md for the actual checks.']
 (ROOT/'docs/basecoat-components.md').write_text('\n'.join(rows)+'\n')
 return len(items)


if __name__=='__main__': print(f'Built {build()} component references')

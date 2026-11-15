"""Build the real phone app (PWA) from the demo template + real.js layer.
usage: python3 build_app.py OUTDIR [--test]"""
import json, sys, os, shutil, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from export_rows import load

ROOT = os.path.dirname(HERE)
out = sys.argv[1]
test = "--test" in sys.argv
version = time.strftime("%Y%m%d-%H%M%S")
s = open(f"{ROOT}/demo/template.html", encoding="utf-8").read()

def rep(a, b, count=1):
    global s
    n = s.count(a)
    assert n == count, f"expected {count}x, found {n}: {a[:90]}"
    s = s.replace(a, b)

# ---- head ----
rep('<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">')
rep('<title>Mage – demo</title>', '''<title>Mage</title>
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Mage">
<meta name="theme-color" content="#0E1012">
<meta name="format-detection" content="telephone=no">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<link rel="icon" type="image/png" href="icons/icon-192.png">''')
rep('</style>', '''/* ---- phone app ---- */
html,body{background:var(--bg);overscroll-behavior:none;-webkit-tap-highlight-color:transparent}
.stage{padding:0!important;gap:0!important;min-height:100dvh}
.phone{width:100%!important;max-width:600px;height:100dvh!important;border-radius:0!important;box-shadow:none!important}
#view{padding-top:calc(env(safe-area-inset-top) + 14px);padding-bottom:calc(env(safe-area-inset-bottom) + 130px)}
nav.bar{bottom:calc(env(safe-area-inset-bottom) + 8px)}
.img{position:relative}
.pimg{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#fff}
.cam video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cammsg{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);padding:9px 16px;border-radius:999px;background:rgba(14,16,18,.85);font-size:14px;font-weight:600;white-space:nowrap}
.icb.on{background:var(--acc);color:#0E1012;border-color:var(--acc)}
.spin{width:34px;height:34px;border-radius:50%;border:3px solid var(--line2);border-top-color:var(--acc);animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.updbar{position:absolute;left:16px;right:16px;top:calc(env(safe-area-inset-top) + 8px);z-index:20;padding:12px 14px;border-radius:16px;border:0;background:var(--acc);color:#0E1012;font-weight:700;cursor:pointer}
input,textarea{font-size:16px}
</style>''')
rep('''  <p class="note">Demo med eksempeldata. Kameraet virker ikke her, så skanning er simulert. Varene, oppskriftene og ingredienslista er ekte – bildene er tegnede illustrasjoner.</p>\n''', '')

# ---- state: start empty, real settings ----
rep(''' history:[{pid:"minestrone",day:"I dag",time:"22:41"},{pid:"kvikklunsj",day:"I dag",time:"22:36"},{pid:"tinemelk",day:"I går",time:"18:20"},{pid:"finmix",day:"I går",time:"18:12"}],
 saved:{p:["finmix","tinemelk"], r:["grot","laks"]},''', ''' history:[],
 saved:{p:[], r:[]},''')
rep('lookQ:"mel"', 'lookQ:""')
rep('kassal:true,', 'kassal:false, kassalKey:"", offDone:{}, offBusy:false, pendingEan:"", pendingName:"", ocrStatus:"", looking:"",')
rep('lesText:"Ingredienser: hvetemel, vann, rapsolje, sukker, gjær, salt, løkpulver, naturlig aroma, emulgator (E471).",', 'lesText:"",')

# ---- product pictures ----
rep('${ART.pack(p)}</span>`;\nconst rimg', '${packImg(p)}</span>`;\nconst rimg')
rep('<span class="img" style="height:72px;width:100%;overflow:hidden">${ART.pack(p)}</span>', '<span class="img" style="height:72px;width:100%;overflow:hidden">${packImg(p)}</span>')
rep('const pRate = p => p.id==="custom"? p.a : analyse(p.ing,isLF(p));', 'const pRate = p => p.id==="custom"? p.a : analyse(p.ing||"",isLF(p));')

# ---- product page: language note + live alternatives ----
rep('<span class="sub" style="margin-top:-4px">Data: ${esc(p.src)}', '${p.langNote?`<span class="sub" style="margin-top:-4px;color:var(--mid)">${esc(p.langNote)}</span>`:""}<span class="sub" style="margin-top:-4px">Data: ${esc(p.src)}')
rep('''${alts.length?alts.map(x=>prodRow(x)).join(""):`<span class="sub" style="line-height:1.4">I appen hentes grønne ${esc(p.cat)} fra Open Food Facts. I demoen finnes ingen ennå.</span>`}''', '<div id="altsOut" class="col g8">${altsHtml(p)}</div>')
rep('${r!=="Lav"&&p.id!=="custom"?`<div style="height:1px', '${r!=="Lav"&&p.id!=="custom"&&!p.own?`<div style="height:1px')

# ---- lookup: Open Food Facts name search results ----
rep('(q.length>=3&&p.ing.toLowerCase().includes(q))', '(q.length>=3&&(p.ing||"").toLowerCase().includes(q))||(p.sq&&p.sq.includes(q))')
rep('<div class="card empty">Ingen varer i demoen matcher. I appen søkes det i hele Open Food Facts.</div>', '<div class="card empty">${q.length<3?"Skriv minst tre bokstaver for å søke i Open Food Facts.":S.offBusy?"Søker i Open Food Facts …":S.offErr&&!S.offDone[q]?"Fikk ikke kontakt med Open Food Facts.":"Ingen varer med ingrediensliste funnet."}</div>')
rep('<span class="sub">fra Open Food Facts</span>', '<span class="sub">${S.offBusy?"søker …":"fra Open Food Facts"}</span>')

# ---- settings: Kassalapp key, about/update ----
rep('${sw("kassal","Bruk Kassalapp som reserve","Hvis Open Food Facts mangler varen")}</div></div>',
    '${sw("kassal","Bruk Kassalapp som reserve","Hvis Open Food Facts mangler varen")}${S.kassal?`<div style="padding:2px 14px 14px"><label class="col g6"><span class="sub">API-nøkkel fra kassal.app (gratis)</span><span class="search"><input id="kassalKey" value="${esc(S.kassalKey)}" placeholder="Lim inn nøkkelen" autocomplete="off" autocapitalize="off" spellcheck="false"></span></label></div>`:""}</div></div>')
rep('''>${S.clearArm?"Trykk igjen for å tømme historikken":"Tøm historikk"}</button>
  </div></div></div>`;''', '''>${S.clearArm?"Trykk igjen for å tømme historikken":"Tøm historikk"}</button>
  </div></div>
  <div class="col g8"><span class="lbl">Om appen</span><div class="card list">
   <button class="item" data-act="update"><span class="col grow" style="gap:1px"><span style="font-size:15px;font-weight:600">Se etter oppdatering</span><span class="sub">Versjon ${APP_VERSION}</span></span><span style="color:var(--mute)">${I.chev}</span></button>
  </div><span class="sub" style="line-height:1.4">Historikk, lagret og innstillinger ligger bare på denne telefonen.</span></div></div>`;''')

# ---- sheet hint ----
rep('<span class="sub">Prøv 7032069740125 eller 7310100565983.</span>', '<span class="sub">Tallene under strekkoden – 8 eller 13 siffer.</span>')

# ---- render hooks ----
rep('  const v=document.getElementById("view"); const st=v.scrollTop;', '  relabel(); const v=document.getElementById("view"); const st=v.scrollTop;')
rep('  if(S.sheet==="ean"){const i=document.getElementById("eanIn");i&&i.focus();}\n}', '  if(S.sheet==="ean"){const i=document.getElementById("eanIn");i&&i.focus();}\n  afterRender();\n}')
rep('S.history.unshift({pid,day:"I dag",', 'S.history.unshift({pid,ts:Date.now(),day:"I dag",')
rep('const TOP = {historikk:"hist",', 'const TOP = {henter:"scan",historikk:"hist",')

# ---- events ----
rep('''    case "useLes": { const ar=analyse(S.lesText); S.custom={id:"custom",brand:"FRA DITT BILDE",name:"Din vare",size:ar.tree.length+" ingredienser lest",ean:"",cat:"",src:"Ditt bilde av ingredienslisten",ing:S.lesText,a:ar}; S.history=S.history.filter(h=>h.pid!=="custom"); addHistory("custom"); S.pid="custom"; go("vare"); break; }''',
    '''    case "useLes": useLes(); break;
    case "torch": toggleTorch(); break;
    case "retryCam": stopCam(); document.getElementById("camErr").innerHTML=""; startCam(); break;
    case "doLookup": lookup(g); break;
    case "update": checkUpdate(true); break;''')
rep('  if(id==="lookQ"){S.lookQ=ev.target.value; S.lookFilter="alt"; document.getElementById("lookOut").innerHTML=lookOut();}',
    '  if(id==="lookQ"){S.lookQ=ev.target.value; S.lookFilter="alt"; document.getElementById("lookOut").innerHTML=lookOut(); offSearchSoon();}\n  if(id==="kassalKey"){S.kassalKey=ev.target.value.trim(); persist();}')
rep('''  const p=PRODUCTS.find(x=>x.ean&&x.ean===v);
  if(p){addHistory(p.id);S.pid=p.id;go("vare");} else {S.inputBar=v;go("ingendata");}''', '  if(v) lookup(v); else render(true);')
rep('    case "doScan":', '    case "doScanDemo":')

# ---- inject real layer before first render ----
real = open(f"{ROOT}/app-src/real.js", encoding="utf-8").read().replace("__VERSION__", version)
tail = "render();\n}\n</script>"
assert s.count(tail) == 1
expose = "\nglobalThis.__mage={analyse,PRODUCTS,RECIPES,ROWS,S,V,go,render,lookup,fromOFF,tidyOcr,pRate,recRating};\n" if test else "\n"
s = s.replace(tail, real + "\nrender();" + expose + "}\n</script>")
s = s.replace("<script>\n{", '<script src="vendor/zxing.min.js"></script>\n<script>\n{', 1)

# ---- data ----
def put(ph, js):
    global s
    assert s.count(ph) == 1, ph
    s = s.replace(ph, js.replace("</", "<\\/"))
rows = load(f"{ROOT}/data/ingredienser.py")
put("/*__DATA__*/[]", json.dumps(rows, ensure_ascii=False))
put("/*__PRODUCTS__*/[]", open(f"{ROOT}/demo/products.js", encoding="utf-8").read().strip())
put("/*__RECIPES__*/[]", open(f"{ROOT}/demo/recipes.js", encoding="utf-8").read().strip())

# ---- write site ----
os.makedirs(f"{out}/vendor", exist_ok=True); os.makedirs(f"{out}/icons", exist_ok=True)
open(f"{out}/index.html", "w", encoding="utf-8").write(s)
open(f"{out}/version.json", "w").write(json.dumps({"version": version}))
sw = open(f"{ROOT}/app-src/sw.js", encoding="utf-8").read().replace("__VERSION__", version)
open(f"{out}/sw.js", "w", encoding="utf-8").write(sw)
for f in ["manifest.webmanifest", "README.md", ".nojekyll"]:
    shutil.copy(f"{ROOT}/app-src/{f}", f"{out}/{f}")
shutil.copy(f"{ROOT}/app-src/vendor/zxing.min.js", f"{out}/vendor/zxing.min.js")
shutil.copy(f"{ROOT}/app-src/vendor/ZXING-LICENSE.txt", f"{out}/vendor/ZXING-LICENSE.txt")
for n in ["icon-180.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"]:
    shutil.copy(f"{ROOT}/app-src/icons/{n}", f"{out}/icons/{n}")
print("built", out, "version", version, len(s), "bytes,", len(rows), "ingredients")

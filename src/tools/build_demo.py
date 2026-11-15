import json, sys, os
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from export_rows import load
src, tpl, out = sys.argv[1], sys.argv[2], sys.argv[3]
test = len(sys.argv) > 4 and sys.argv[4] == "--test"
rows = load(src)
html = open(tpl, encoding="utf-8").read()
def put(ph, js):
    global html
    assert html.count(ph) == 1, ph
    html = html.replace(ph, js.replace("</", "<\\/"))
put("/*__DATA__*/[]", json.dumps(rows, ensure_ascii=False))
put("/*__PRODUCTS__*/[]", open(ROOT + "/demo/products.js", encoding="utf-8").read().strip())
put("/*__RECIPES__*/[]", open(ROOT + "/demo/recipes.js", encoding="utf-8").read().strip())
if test:
    a = "render();\n}\n</script>"
    assert html.count(a) == 1
    html = html.replace(a, "render();\nglobalThis.__mage={analyse,PRODUCTS,RECIPES,ROWS,recRating,recIngRating,pRate,pHeart,rHeart,gentleState,ART,S,V,go,render,byName};\n}\n</script>")
open(out, "w", encoding="utf-8").write(html)
print(len(rows), "rows ->", out, len(html), "bytes")

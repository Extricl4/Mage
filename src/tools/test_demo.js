const fs = require("fs");
const html = fs.readFileSync(process.argv[2], "utf8");
const m = html.match(/<script>([\s\S]*)<\/script>/);
const els = {};
function el(id) { return els[id] || (els[id] = { id, innerHTML: "", scrollTop: 0, value: "", classList: { add() {}, remove() {} }, addEventListener() {}, focus() {} }); }
globalThis.document = { getElementById: el, createElement: () => ({ innerHTML: "", querySelector: () => ({ innerHTML: "" }) }) };
eval(m[1]);
const M = globalThis.__mage;
let fail = 0;
const ok = (c, msg) => { if (!c) { fail++; console.log("FAIL", msg); } };
// products
const exp = { minestrone: "Høy", finmix: "Lav", grovmix: "Høy", tinemelk: "Lav", kvikklunsj: "Høy", idunketchup: "Ikke vurdert", idunchili: "Høy", sorlandsis: "Ikke vurdert" };
for (const p of M.PRODUCTS) {
  const a = M.pRate(p);
  console.log(p.id.padEnd(12), a.overall.padEnd(12), "heart:", M.pHeart(p), "|", a.why.map(w => w.unknown ? "?" + w.unknown : w.e[0] + ":" + w.row.n).join(", "));
  ok(a.overall === exp[p.id], p.id + " expected " + exp[p.id] + " got " + a.overall);
}
ok(M.pHeart(M.PRODUCTS.find(p => p.id === "finmix")), "finmix heart");
ok(M.pHeart(M.PRODUCTS.find(p => p.id === "tinemelk")), "tinemelk heart");
// engine edge cases
const A = (t, lf) => M.analyse(t, lf).overall;
ok(A("laktosefri lettmelk, laktase") === "Lav", "laktosefri melk");
ok(A("Lettmelk, vitamin D.", true) === "Lav", "lf context");
ok(A("melk") === "Høy", "milk high");
ok(A("brunost") === "Høy" && A("ost") === "Lav", "brunost vs ost");
ok(A("paprikapulver") === "Lav" && A("paprika") === "Høy", "paprika");
ok(A("xyzabc") === "Ikke vurdert", "unknown grey");
ok(A("sukker. Kan inneholde spor av hvete og melk.") === "Lav", "traces");
ok(A("sukker, salt. Krydderet er bestrålt.") === "Lav", "trailing sentence cut");
ok(A("maltodekstrin") === "Lav", "malto not malt");
ok(A("E968") === "Høy" && A("sorbitol (E420)") === "Høy", "polyols");
ok(A("brokkoli") === "Middels", "brokkoli whole middels");
ok(A("polydekstrose") === "Høy", "polydextrose high");
// recipes
for (const r of M.RECIPES) {
  for (const i of r.ing) { if (i.r) ok(!!M.byName[i.r], r.id + " unknown row " + i.r); if (i.p) ok(!!M.PRODUCTS.find(p => p.id === i.p), r.id + " unknown product " + i.p); }
  const rr = M.recRating(r);
  ok(rr === "Lav", "recipe " + r.id + " rating " + rr + " :: " + r.ing.filter(i => M.recIngRating(i) !== "Lav").map(i => i.t).join(" | "));
  ok(r.steps.length >= 1 && r.art && r.art.length, r.id + " steps/art");
  try { const svg = M.ART.dish(r); ok(svg.includes("<svg") && svg.length > 300, r.id + " art small"); } catch (e) { fail++; console.log("FAIL art", r.id, e.message); }
}
console.log("\nhearts:", M.RECIPES.filter(M.rHeart).map(r => r.id).join(", "));
console.log("no heart:", M.RECIPES.filter(r => !M.rHeart(r)).map(r => r.id).join(", "));
for (const p of M.PRODUCTS) { try { ok(M.ART.pack(p).includes("<svg"), "pack " + p.id); } catch (e) { fail++; console.log("FAIL pack", p.id, e.message); } }
// swaps
for (const r of M.ROWS) for (const b of r.b) ok(!!M.byName[b], "swap " + r.n + " -> " + b);
const choc = M.byName["melkesjokolade"]; ok(choc.b.join() === "mørk sjokolade", "chocolate swap " + choc.b);
ok(M.byName["mørk sjokolade"].b.length === 0, "dark chocolate has no swaps");
// render all views
const S = M.S;
for (const v of ["historikk", "skanner", "slaa", "lagret", "innst", "kilder", "ingendata", "les"]) { try { S.view = v; M.render(); ok(el("view").innerHTML.length > 200, "render " + v); } catch (e) { fail++; console.log("FAIL render", v, e.message); } }
S.lookTab = "opp"; S.view = "slaa";
for (const c of ["Alle", "Frokost", "Lunsj", "Middag", "Mellommåltid", "Snacks", "Godteri", "Kaker", "Bakst"]) { S.recCat = c; M.render(); ok(!el("view").innerHTML.includes("Ingen oppskrifter"), "cat " + c); }
for (const p of M.PRODUCTS) { S.pid = p.id; S.view = "vare"; try { M.render(); } catch (e) { fail++; console.log("FAIL vare", p.id, e.message); } }
for (const r of M.RECIPES) { S.rid = r.id; S.view = "opp"; try { M.render(); } catch (e) { fail++; console.log("FAIL opp", r.id, e.message); } }
for (const r of M.ROWS) { S.row = r.n; S.view = "row"; try { M.render(); } catch (e) { fail++; console.log("FAIL row", r.n, e.message); } }
S.row = "mørk sjokolade"; S.view = "row"; M.render(); ok(!el("view").innerHTML.includes("dijonsennep") && !el("view").innerHTML.includes("Bytt ut med"), "dark choc no silly swaps");
S.row = "hvete"; M.render(); ok(el("view").innerHTML.includes("Bytt ut med") && el("view").innerHTML.includes("havre"), "wheat swaps");
S.strict = true; ok(A("tomatpuré") === "Høy", "strict"); S.strict = false;
S.triggers.Laktose = false; ok(A("melk") === "Lav", "trigger off"); S.triggers.Laktose = true;
ok(A("Fullkornsris 99,2%, havsalt 0,8%.") === "Lav", "decimal comma percentages (rice cakes)");
ok(A("Ris 92 %, havsalt 8 %") === "Lav" && A("Ris, havsalt, 8%") === "Lav", "loose percentages are not ingredients");
ok(M.analyse("Fullkornsris 99,2%, havsalt 0,8%").tree.length === 2, "rice cakes = 2 ingredients");
ok(A("fullkornshvetemel") === "Høy", "compound: fullkornshvetemel is wheat");
ok(A("makrellfilet, tomatpuré, rapsolje, salt") !== "Ikke vurdert", "compound: makrellfilet");
ok(A("vann, sukker, sitronsyre, aroma med navngitt smak") === "Lav", "citric acid known");
ok(A("syre: sitronsyre") === "Lav", "class prefix");
ok(A("_hvetemel_, vand") === "Høy", "allergen underscores + danish");
ok(A("gressløkpulver") !== "Høy", "chive compound not onion");
ok(A("løkolje") === "Høy", "onion oil fail-safe");
ok(A("melkesyrekultur") === "Lav" && A("mikrobiell løpe") === "Lav", "cultures and rennet");
ok(M.hardFlags({id:"x",name:"Kjøttdeig 14%",ing:"storfekjøtt, salt",fat:14}).some(f=>f.t==="Mye fett"), "kjøttdeig fat flag");
ok(!M.hardFlags({id:"y",name:"Karbonadedeig",ing:"storfekjøtt, salt",fat:4}).length, "karbonadedeig no flag");
ok(M.hardFlags({id:"z",name:"Pølse",ing:"svinekjøtt, bacon, salt"}).some(f=>f.t==="Mye fett"), "bacon flag via ingredients");
ok(M.hardFlags({id:"w",name:"Brus",ing:"kullsyreholdig vann, sukker"}).some(f=>f.t==="Kullsyre"), "carbonation flag");
ok(!M.pHeart({id:"v",name:"Smør",ing:"smør, salt"}), "no heart on fatty");
console.log(fail ? "\n" + fail + " FAILED" : "\nALL PASSED (" + M.RECIPES.length + " recipes, " + M.PRODUCTS.length + " products, " + M.ROWS.length + " ingredients)");
process.exit(fail ? 1 : 0);

const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = process.argv[2] || "/tmp/apptest", SHOT = "/tmp/appshots";
fs.mkdirSync(SHOT, { recursive: true });
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const srv = http.createServer((q, r) => { let f = path.join(ROOT, decodeURIComponent(q.url.split("?")[0])); if (f.endsWith("/")) f += "index.html"; fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); r.end(d); }); }).listen(8765);
let fail = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fail++; };

const OFFP = { code: "7044610000008", product_name_no: "Tomatsuppe med løk", brands: "Testmerke", quantity: "500 ml", ingredients_text_no: "Vann, tomatpuré 20 %, _hvetemel_, løk, sukker, salt, krydder.", categories_tags: ["en:soups", "en:tomato-soups"], categories: "Supper, Tomatsupper", image_front_small_url: "" };
const ALT = { code: "7000000000017", product_name_no: "Grønnsakssuppe uten løk", brands: "Snill", quantity: "400 ml", ingredients_text_no: "Vann, gulrot, potet, rapsolje, salt, maisstivelse.", categories_tags: ["en:soups"], categories: "Supper" };

async function run(cam, fn) {
  const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-video-capture=" + cam, "--no-sandbox"] });
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, permissions: ["camera"] });
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", e => errs.push(e.message)); page.on("console", m => { if (m.type() === "error" && !/fonts|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await page.route(/openfoodfacts\.org\/api\/v2\/product\/(\d+)/, r => { const ean = r.request().url().match(/product\/(\d+)/)[1]; r.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(ean === OFFP.code ? { status: 1, product: OFFP } : { status: 0 }) }); });
  await page.route(/openfoodfacts\.org\/api\/v2\/search/, r => r.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ products: [OFFP, ALT] }) }));
  await page.route(/openfoodfacts\.org\/cgi\/search/, r => r.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ products: [ALT] }) }));
  await page.goto("http://localhost:8765/");
  try { await fn(page); } catch (e) { fail++; console.log("FAIL exception", e.message); await page.screenshot({ path: SHOT + "/error.png" }); }
  ok(errs.length === 0, "no page errors " + errs.join(" | "));
  await b.close();
}
const txt = p => p.locator("#view").innerText();

(async () => {
  // 1) camera scans a known product
  await run("/tmp/bc/cam_7310100565983.y4m", async page => {
    ok((await txt(page)).includes("Ingen varer her ennå"), "history starts empty");
    await page.screenshot({ path: SHOT + "/1-historikk.png" });
    await page.click('button.scan');
    await page.waitForTimeout(600); await page.screenshot({ path: SHOT + "/2-skanner.png" });
    await page.waitForFunction(() => globalThis.__mage.S.view === "vare", null, { timeout: 15000 });
    const t = await txt(page); ok(/Fin Mix/i.test(t) && t.includes("LAV"), "camera scan → Semper Fin Mix, LAV");
    await page.screenshot({ path: SHOT + "/3-vare-finmix.png", fullPage: true });
    await page.reload(); await page.waitForTimeout(500);
    ok(/Fin Mix/i.test(await txt(page)), "history survives reload");
  });
  // 2) camera scans an unknown product → Open Food Facts (mocked) → HØY + green alternative
  await run("/tmp/bc/cam_7044610000004.y4m", async page => {
    await page.click('button.scan');
    await page.waitForFunction(() => globalThis.__mage.S.view === "vare", null, { timeout: 15000 });
    await page.waitForFunction(() => document.getElementById("altsOut") && /Grønnsakssuppe/.test(document.getElementById("altsOut").innerText), null, { timeout: 8000 });
    const t = await txt(page);
    ok(t.includes("Tomatsuppe med løk") && t.includes("HØY"), "OFF product rated HØY");
    ok(/prøv heller/i.test(t) && t.includes("Grønnsakssuppe uten løk"), "green alternative from OFF search");
    await page.screenshot({ path: SHOT + "/4-vare-off.png", fullPage: true });
    // manual barcode not in OFF → read ingredients → saved for that barcode
    await page.evaluate(() => { const M = globalThis.__mage; M.S.sheet = "ean"; M.go("skanner"); }); await page.waitForTimeout(300); await page.fill("#eanIn", "7000000000994"); await page.press("#eanIn", "Enter");
    await page.waitForFunction(() => globalThis.__mage.S.view === "ingendata", null, { timeout: 8000 });
    ok((await txt(page)).includes("Fant ikke varen"), "unknown barcode → Fant ikke varen");
    await page.screenshot({ path: SHOT + "/5-ingendata.png" });
    await page.click('[data-act="go"][data-arg="les"]');
    await page.fill("#lesText", "Ingredienser: rismel, sukker, solsikkeolje, salt.");
    await page.click('[data-act="useLes"]'); await page.waitForTimeout(300);
    const t2 = await txt(page); ok(t2.includes("Vare 7000000000994") && t2.includes("LAV"), "own ingredient list saved as product");
    await page.screenshot({ path: SHOT + "/6-les-vare.png", fullPage: true });
    await page.evaluate(() => globalThis.__mage.lookup("7000000000994")); await page.waitForTimeout(300);
    ok(await page.evaluate(() => globalThis.__mage.S.view === "vare"), "rescanning it is instant (stored on phone)");
    // name search
    await page.click('[data-act="tab"][data-arg="slaa"]'); await page.fill("#lookQ", "grønnsakssuppe"); await page.waitForTimeout(1500);
    ok((await txt(page)).includes("Grønnsakssuppe uten løk"), "name search in OFF");
    await page.screenshot({ path: SHOT + "/7-sok.png", fullPage: true });
    await page.click('[data-act="tab"][data-arg="innst"]'); await page.waitForTimeout(200);
    await page.screenshot({ path: SHOT + "/8-innst.png", fullPage: true });
    // OCR clean-up
    const o = await page.evaluate(() => globalThis.__mage.tidyOcr("TOMATSUPPE\nIngredienser: vann, to-\nmatpuré, sukker,\nsalt. Næringsinnhold per 100 g Energi 200 kJ"));
    ok(o === "vann, tomatpuré, sukker, salt.", "OCR tidy: " + o);
  });
  srv.close();
  console.log(fail ? fail + " FAILED" : "ALL APP TESTS PASSED");
  process.exit(fail ? 1 : 0);
})();

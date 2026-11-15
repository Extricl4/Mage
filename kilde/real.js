/* ================== REAL APP LAYER (camera, Open Food Facts, OCR, storage) ================== */
const APP_VERSION = "__VERSION__";
const LS = "mage.v1", LSP = "mage.products";
const F = "code,product_name,product_name_no,product_name_nb,product_name_nn,generic_name,brands,quantity,ingredients_text,ingredients_text_no,ingredients_text_nb,ingredients_text_nn,ingredients_text_sv,ingredients_text_da,ingredients_text_en,image_front_small_url,image_front_url,categories_tags,categories,lang";
const OFF = "https://world.openfoodfacts.org";
const SEED_IDS = new Set(PRODUCTS.map(p => p.id));
const ALTS = {};
const CAM = { stream: null, track: null, timer: 0, reader: null, busy: false, torch: false };

/* ---------- storage ---------- */
function persist() {
  try {
    localStorage.setItem(LS, JSON.stringify({ history: S.history.slice(0, 300), saved: S.saved, triggers: S.triggers, skanSom: S.skanSom, strict: S.strict, kassal: S.kassal, kassalKey: S.kassalKey, custom: S.custom && { ...S.custom, a: null } }));
  } catch (e) {}
}
function saveProd(p) {
  const i = PRODUCTS.findIndex(x => x.id === p.id);
  if (i > -1) PRODUCTS[i] = p; else PRODUCTS.push(p);
  try {
    const own = PRODUCTS.filter(x => !SEED_IDS.has(x.id) && !x.tmp).slice(-400);
    localStorage.setItem(LSP, JSON.stringify(own));
  } catch (e) {}
}
function loadState() {
  try {
    const d = JSON.parse(localStorage.getItem(LS) || "null");
    if (d) { Object.assign(S, d); S.triggers = { ...{ Fruktaner: true, Laktose: true, Fruktose: true, Polyoler: true, GOS: true }, ...(d.triggers || {}) }; }
    if (S.custom) S.custom.a = analyse(S.custom.ing);
    JSON.parse(localStorage.getItem(LSP) || "[]").forEach(p => { const i = PRODUCTS.findIndex(x => x.id === p.id); if (i > -1) PRODUCTS[i] = p; else PRODUCTS.push(p); });
  } catch (e) {}
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}
function relabel() {
  const now = new Date(), d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  S.history.forEach(h => {
    if (!h.ts) return;
    const d = new Date(h.ts), t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const s = d.toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long" });
    h.day = t === d0 ? "I dag" : t === d0 - 864e5 ? "I går" : s[0].toUpperCase() + s.slice(1);
    h.time = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  });
}

/* ---------- product images ---------- */
function packImg(p) {
  const base = p.pack === "none" ? `<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true"><rect width="100" height="100" fill="#2A2E33"/><path d="M30 38 L50 28 L70 38 L70 66 L50 76 L30 66 Z M30 38 L50 48 L70 38 M50 48 L50 76" fill="none" stroke="#7E868E" stroke-width="3" stroke-linejoin="round"/></svg>` : ART.pack(p);
  return base + (p.img ? `<img class="pimg" src="${esc(p.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : "");
}

/* ---------- Open Food Facts / Kassalapp ---------- */
const clean = s => String(s || "").replace(/_/g, "").replace(/\s+/g, " ").trim();
function fromOFF(o, ean) {
  ean = ean || o.code;
  const name = clean(o.product_name_no || o.product_name_nb || o.product_name_nn || o.product_name || o.generic_name || "");
  let ing = o.ingredients_text_no || o.ingredients_text_nb || o.ingredients_text_nn || "", langNote = "";
  if (!ing) {
    const other = [["sv", "svensk"], ["da", "dansk"], ["en", "engelsk"]].find(([l]) => o["ingredients_text_" + l]);
    if (o.ingredients_text && (!o.lang || ["no", "nb", "nn"].includes(o.lang))) ing = o.ingredients_text;
    else if (other) { ing = o["ingredients_text_" + other[0]]; langNote = `Ingredienslisten finnes bare på ${other[1]}. Ord appen ikke kjenner blir grå – ta gjerne bilde av den norske lista.`; }
    else if (o.ingredients_text) { ing = o.ingredients_text; langNote = "Ingredienslisten er kanskje ikke på norsk. Ord appen ikke kjenner blir grå."; }
  }
  const cats = (o.categories_tags || []).filter(t => /^en:/.test(t));
  const catName = clean((o.categories || "").split(",").pop() || "");
  return { id: "e" + ean, ean, brand: clean((o.brands || "").split(",")[0]).toUpperCase() || "UKJENT MERKE", name: name || "Ukjent navn", size: clean(o.quantity), cat: catName.toLowerCase(), cats, img: o.image_front_small_url || o.image_front_url || "", src: "Open Food Facts", ing: clean(ing), langNote, pack: "none", c1: "#2A2E33", c2: "#2A2E33" };
}
async function getJSON(url, opt = {}, ms = 9000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { ...opt, signal: ac.signal }); if (!r.ok) { const e = new Error("http " + r.status); e.status = r.status; throw e; } return await r.json(); }
  finally { clearTimeout(t); }
}
async function fetchOFF(ean) {
  try {
    const j = await getJSON(`${OFF}/api/v2/product/${ean}.json?fields=${F}`);
    return j && j.status === 1 && j.product ? fromOFF(j.product, ean) : null;
  } catch (e) { if (e.status === 404) return null; throw e; }
}
async function fetchKassal(ean) {
  const j = await getJSON(`https://kassal.app/api/v1/products/ean/${ean}`, { headers: { Authorization: "Bearer " + S.kassalKey, Accept: "application/json" } });
  const ps = (j && j.data && j.data.products) || []; const x = ps.find(q => q.ingredients) || ps[0];
  if (!x) return null;
  return { id: "e" + ean, ean, brand: clean(x.brand || x.vendor || "").toUpperCase() || "UKJENT MERKE", name: clean(x.name) || "Ukjent navn", size: x.weight ? x.weight + " " + (x.weight_unit || "") : "", cat: "", cats: [], img: x.image || "", src: "Kassalapp", ing: clean(x.ingredients), langNote: "", pack: "none", c1: "#2A2E33", c2: "#2A2E33" };
}

/* ---------- lookup after a scan ---------- */
async function lookup(raw) {
  const ean = String(raw || "").replace(/\D/g, ""); if (!ean) return;
  stopCam();
  const known = PRODUCTS.find(x => x.ean === ean && x.ing);
  if (known) { addHistory(known.id); S.pid = known.id; go("vare"); return; }
  S.looking = ean; S.offline = false; S.pendingEan = ean; S.pendingName = ""; S.pendingBrand = ""; S.inputBar = ean;
  go("henter");
  let p = null, failed = false;
  try { p = await fetchOFF(ean); } catch (e) { failed = true; }
  if ((!p || !p.ing) && S.kassal && S.kassalKey) { try { const k = await fetchKassal(ean); if (k && (k.ing || !p)) p = k; } catch (e) {} }
  if (S.view !== "henter" || S.looking !== ean) return;
  if (p && p.ing) { saveProd(p); addHistory(p.id); S.pid = p.id; S.pendingEan = ""; go("vare", false); return; }
  if (p) { S.pendingName = p.name; S.pendingBrand = p.brand; S.pendingImg = p.img; }
  S.offline = failed && !p;
  go("ingendata", false);
}
V.henter = () => `<div class="col g16"><div class="row sb"><h1>Henter varen …</h1><button class="icb" aria-label="Avbryt" data-act="back">${I.x}</button></div>
 <div class="card col g10" style="padding:26px 16px;align-items:center;text-align:center"><span class="spin" aria-hidden="true"></span><span style="font-weight:700">Strekkode ${esc(S.looking || "")}</span><span class="sub">Søker i Open Food Facts${S.kassal && S.kassalKey ? " og Kassalapp" : ""}</span></div></div>`;

V.ingendata = () => `<div class="col g16"><div class="row sb"><div class="row g10"><span style="width:32px;height:32px;border-radius:16px;background:#23272B;color:#C9CDD2;display:flex;align-items:center;justify-content:center;font-weight:700">!</span><h1>${S.offline ? "Ingen nett" : S.pendingName ? "Mangler ingredienser" : "Fant ikke varen"}</h1></div><button class="icb" aria-label="Lukk" data-act="back">${I.x}</button></div>
 <div class="card col g10" style="padding:22px 16px;align-items:center;text-align:center">
  ${S.pendingName ? `<span style="font-size:17px;font-weight:700">${esc(S.pendingBrand ? S.pendingBrand + " " : "")}${esc(S.pendingName)}</span>` : ""}
  <span style="color:#D2D6DA;line-height:1.45">${S.offline ? "Fikk ikke kontakt med Open Food Facts. Sjekk nettet og prøv igjen – eller ta bilde av ingredienslisten." : S.pendingName ? "Varen finnes i Open Food Facts, men uten ingrediensliste." : `Strekkoden ${esc(S.inputBar || "")} finnes ikke i Open Food Facts${S.kassal && S.kassalKey ? " eller Kassalapp" : ""} ennå.`}</span>
  <b style="font-size:14px">Ta bilde av ingredienslisten, så sjekker appen den likevel.</b></div>
 <button class="row g14" data-act="go" data-arg="les" style="padding:16px;border-radius:22px;border:0;background:var(--acc);color:#0E1012;text-align:left;cursor:pointer"><span class="img" style="width:48px;height:48px;border-radius:16px;background:rgba(14,16,18,.12);color:#0E1012">${I.text}</span><span class="col g4"><span style="font-size:17px;font-weight:700">Skann ingredienslisten</span><span style="font-size:13px;font-weight:500">Appen leser teksten og fargelegger hver ingrediens</span></span></button>
 ${S.offline ? `<button class="big ghost" data-act="doLookup" data-arg="${esc(S.inputBar || "")}">Prøv igjen</button>` : `<button class="row g14 card" data-act="toast" data-arg="Næringsinnhold sier ikke noe om FODMAP – bruk ingredienslisten" style="padding:16px;border-radius:22px;text-align:left;cursor:pointer;color:var(--ink)"><span class="img" style="width:48px;height:48px;border-radius:16px;background:#23272B;color:var(--ink)">${I.ingr}</span><span class="col g4"><span style="font-size:17px;font-weight:700">Hva med næringsinnhold?</span><span class="sub" style="font-size:13px">Viser ikke FODMAP – ingredienslisten er det som teller</span></span></button>`}
 <span class="sub" style="text-align:center;line-height:1.4">Svaret lagres på telefonen, så neste gang du skanner denne varen vet appen det med en gang.</span></div>`;

/* ---------- "Prøv heller": green alternatives from Open Food Facts ---------- */
function altsHtml(p) {
  const local = PRODUCTS.filter(x => x.cat && x.cat === p.cat && x.id !== p.id && x.ing && pRate(x).overall === "Lav");
  const remote = ALTS[p.id];
  if (remote === undefined && p.cats && p.cats.length) loadAlts(p);
  const list = [...local, ...(remote || []).filter(x => !local.some(l => l.id === x.id))].slice(0, 5);
  if (list.length) return list.map(x => prodRow(x)).join("");
  if (remote === undefined && p.cats && p.cats.length) return `<span class="sub">Leter etter grønne varer i samme kategori …</span>`;
  return `<span class="sub" style="line-height:1.4">Fant ingen grønne varer i samme kategori i Open Food Facts ennå.</span>`;
}
async function loadAlts(p) {
  ALTS[p.id] = null; const found = [];
  const tags = p.cats.slice().reverse().slice(0, 3);
  for (const tag of tags) {
    try {
      const j = await getJSON(`${OFF}/api/v2/search?categories_tags=${encodeURIComponent(tag)}&countries_tags=en:norway&fields=${F}&page_size=60`, {}, 12000);
      (j.products || []).map(o => fromOFF(o)).filter(x => x.ean && x.ing && !x.langNote && x.ean !== p.ean && !found.some(f => f.ean === x.ean)).forEach(x => { if (pRate(x).overall === "Lav") found.push(x); });
    } catch (e) { break; }
    if (found.length >= 3) break;
  }
  found.forEach(x => { x.tmp = true; if (!PRODUCTS.some(q => q.id === x.id)) PRODUCTS.push(x); });
  ALTS[p.id] = found.slice(0, 5);
  const el = document.getElementById("altsOut");
  if (el && S.view === "vare" && S.pid === p.id) el.innerHTML = altsHtml(p);
}

/* ---------- name search in Open Food Facts ---------- */
let offT = 0;
function offSearchSoon() {
  clearTimeout(offT);
  const q = S.lookQ.trim().toLowerCase();
  if (q.length < 3) return;
  offT = setTimeout(async () => {
    if (S.offDone[q]) return;
    S.offBusy = true; refreshLook();
    try {
      const j = await getJSON(`${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&fields=${F}&tagtype_0=countries&tag_contains_0=contains&tag_0=norway`, {}, 12000);
      (j.products || []).map(o => fromOFF(o)).filter(x => x.ean && x.ing).forEach(x => { if (!PRODUCTS.some(p => p.id === x.id)) { x.tmp = true; PRODUCTS.push(x); } const p = PRODUCTS.find(p => p.id === x.id); p.sq = (p.sq || []).concat(q); });
      S.offDone[q] = true;
    } catch (e) { S.offErr = true; }
    S.offBusy = false; refreshLook();
  }, 650);
}
function refreshLook() { const el = document.getElementById("lookOut"); if (el && S.view === "slaa") el.innerHTML = lookOut(); }
function keepProd(id) { const p = prod(id); if (p && p.tmp) { delete p.tmp; saveProd(p); } }

/* ---------- camera + barcode ---------- */
V.skanner = () => {
  const last = S.history[0]; const lp = last && (prod(last.pid) || null);
  return `<div class="col g16"><div class="row sb"><h1>Skann strekkode</h1><div class="row g8"><button class="icb ${CAM.torch ? "on" : ""}" aria-label="Lommelykt" aria-pressed="${CAM.torch}" data-act="torch">${I.light}</button><button class="icb" aria-label="Skriv inn strekkode" data-act="sheet" data-arg="ean">${I.kbd}</button></div></div>
  <div class="cam" id="cam"><video id="camV" playsinline muted autoplay></video>
   <span class="corner" style="left:30px;top:70px;border-right:0;border-bottom:0;border-top-left-radius:16px"></span><span class="corner" style="right:30px;top:70px;border-left:0;border-bottom:0;border-top-right-radius:16px"></span>
   <span class="corner" style="left:30px;bottom:70px;border-right:0;border-top:0;border-bottom-left-radius:16px"></span><span class="corner" style="right:30px;bottom:70px;border-left:0;border-top:0;border-bottom-right-radius:16px"></span>
   <span class="scanline"></span>
   <span class="cammsg" id="camMsg">Starter kameraet …</span>
  </div>
  <div id="camErr"></div>
  <span class="sub" style="text-align:center;margin-top:-6px">Hold strekkoden inne i rammen · søker i Open Food Facts</span>
  ${lp ? (() => { const r = pRate(lp).overall; return `<button class="item card" style="padding:12px 14px" data-act="openP" data-arg="${lp.id}">${dot(r)}<span class="col grow" style="gap:1px"><span class="sub">Sist skannet</span><span style="font-size:15px;font-weight:700">${esc(lp.brand)} ${esc(lp.name)}</span></span><span class="row g6">${pHeart(lp) ? heart() : ""}${tag(r, true)}</span></button>`; })() : ""}</div>`;
};
function camMsg(t) { const m = document.getElementById("camMsg"); if (m) m.textContent = t; }
function camError(e) {
  const box = document.getElementById("camErr"); if (!box) return;
  const name = e && e.name;
  const txt = !window.isSecureContext ? "Kameraet virker bare når appen åpnes over https." :
    name === "NotAllowedError" ? "Mage har ikke lov til å bruke kameraet. Åpne Innstillinger på iPhonen → Apper → Safari → Kamera og velg «Spør» eller «Tillat», og prøv igjen." :
    name === "NotFoundError" || name === "OverconstrainedError" ? "Fant ikke noe kamera." : "Kameraet startet ikke.";
  camMsg("Kameraet er av");
  box.innerHTML = `<div class="card col g10" style="padding:14px 16px"><span style="line-height:1.45">${txt}</span><div class="row g8"><button class="chip on" data-act="retryCam">Prøv igjen</button><button class="chip" data-act="sheet" data-arg="ean">Skriv inn strekkode</button></div></div>`;
}
async function startCam() {
  const v = document.getElementById("camV"); if (!v) return;
  CAM.busy = false;
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error("no media"), { name: window.isSecureContext ? "NotFoundError" : "Insecure" });
    if (!CAM.stream || !CAM.stream.active) {
      CAM.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      CAM.track = CAM.stream.getVideoTracks()[0];
      try { await CAM.track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch (e) {}
    }
    if (S.view !== "skanner" || S.sheet || !document.body.contains(v)) return;
    v.srcObject = CAM.stream; await v.play().catch(() => {});
    camMsg("Hold strekkoden inne i rammen");
    scanLoop(v);
  } catch (e) { camError(e); }
}
function stopCam() {
  clearInterval(CAM.timer); CAM.timer = 0;
  if (CAM.stream) CAM.stream.getTracks().forEach(t => t.stop());
  CAM.stream = null; CAM.track = null; CAM.torch = false;
}
function scanLoop(v) {
  clearInterval(CAM.timer);
  if (!window.ZXing) { camMsg("Strekkodeleseren lastet ikke"); return; }
  if (!CAM.reader) {
    const Z = window.ZXing, hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    CAM.reader = new Z.MultiFormatReader(); CAM.reader.setHints(hints);
  }
  const c = document.createElement("canvas"), ctx = c.getContext("2d", { willReadFrequently: true });
  CAM.timer = setInterval(() => {
    if (CAM.busy || !v.videoWidth) return;
    if (!document.body.contains(v)) { clearInterval(CAM.timer); return; }
    const vw = v.videoWidth, vh = v.videoHeight, cw = Math.round(vw * .86), ch = Math.round(vh * .5);
    const sc = Math.min(1, 1280 / cw); c.width = Math.round(cw * sc); c.height = Math.round(ch * sc);
    ctx.drawImage(v, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, c.width, c.height);
    try {
      const Z = window.ZXing;
      const res = CAM.reader.decodeWithState(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(c))));
      if (res && res.getText()) { CAM.busy = true; clearInterval(CAM.timer); if (navigator.vibrate) navigator.vibrate(40); lookup(res.getText()); }
    } catch (e) { /* no code in this frame */ }
  }, 160);
}
async function toggleTorch() {
  const t = CAM.track;
  try {
    if (!t) throw 0;
    const cap = t.getCapabilities ? t.getCapabilities() : {};
    if (cap.torch === false || (cap.torch === undefined && !/iPhone|iPad/.test(navigator.userAgent))) throw 0;
    CAM.torch = !CAM.torch; await t.applyConstraints({ advanced: [{ torch: CAM.torch }] });
    const b = document.querySelector('[data-act="torch"]'); if (b) { b.classList.toggle("on", CAM.torch); b.setAttribute("aria-pressed", CAM.torch); }
  } catch (e) { CAM.torch = false; toast("Lommelykten støttes ikke her – bruk den i Kontrollsenter"); }
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopCam();
  else { if (S.view === "skanner" && !S.sheet) startCam(); checkUpdate(false); }
});

/* ---------- read the ingredient list from a photo (OCR) ---------- */
V.les = () => {
  const a = analyse(S.lesText);
  return `<div class="col g14"><div class="row sb"><h1>Les ingredienser</h1><button class="icb" aria-label="Lukk" data-act="back">${I.x}</button></div>
  ${S.pendingName ? `<span class="sub" style="font-size:14px">For: <b style="color:var(--ink)">${esc(S.pendingName)}</b></span>` : ""}
  <label class="row g14" style="padding:16px;border-radius:22px;background:var(--acc);color:#0E1012;cursor:pointer"><span class="img" style="width:48px;height:48px;border-radius:16px;background:rgba(14,16,18,.12);color:#0E1012">${I.photo}</span><span class="col g4"><span style="font-size:17px;font-weight:700">Ta bilde av ingredienslisten</span><span style="font-size:13px;font-weight:500">Hold telefonen rett over teksten, god belysning</span></span><input type="file" id="ocrFile" accept="image/*" capture="environment" style="position:absolute;width:1px;height:1px;opacity:0"></label>
  <span class="sub" id="ocrStatus" style="line-height:1.4">${esc(S.ocrStatus || "")}</span>
  <label class="col g6"><span class="lbl">Ingrediensliste</span><textarea id="lesText" placeholder="Teksten fra bildet kommer her. Du kan også skrive eller lime inn.">${esc(S.lesText)}</textarea></label>
  <span class="sub" style="line-height:1.4">Sjekk at teksten stemmer med pakken og rett opp feil før du trykker «Bruk disse».</span>
  <div id="lesOut">${lesOut(a)}</div></div>`;
};
let tessP = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  return tessP || (tessP = new Promise((ok, no) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"; s.onload = ok; s.onerror = () => { tessP = null; no(new Error("load")); }; document.head.appendChild(s); }));
}
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const sc = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
  const x = c.getContext("2d"); x.filter = "grayscale(1) contrast(1.35)"; x.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}
function tidyOcr(t) {
  let s = t.replace(/-\s*\n\s*/g, "").replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ");
  const m = s.match(/ingredienser\s*[:;.]?/i); if (m) s = s.slice(m.index + m[0].length);
  const end = s.search(/(næringsinnhold|næringsdeklarasjon|næringsverdi|oppbevar|best før|holdbarhet|netto(vekt)?|produsert (av|for)|energi\s*\d)/i);
  if (end > 20) s = s.slice(0, end);
  return s.trim().replace(/[.;,\s]+$/, ".");
}
function ocrStatus(t) { S.ocrStatus = t; const el = document.getElementById("ocrStatus"); if (el) el.textContent = t; }
async function runOcr(file) {
  if (!file) return;
  try {
    ocrStatus("Laster tekstleseren (første gang tar det litt tid) …");
    await loadTesseract();
    const img = await shrink(file);
    const w = await Tesseract.createWorker("nor", 1, { logger: m => { if (m.status === "recognizing text") ocrStatus("Leser teksten … " + Math.round(m.progress * 100) + " %"); } });
    const { data } = await w.recognize(img);
    await w.terminate();
    const txt = tidyOcr(data.text || "");
    if (!txt) { ocrStatus("Fant ingen tekst. Prøv igjen med bedre lys og telefonen rett over teksten."); return; }
    S.lesText = txt; ocrStatus("Ferdig – sjekk teksten under.");
    if (S.view === "les") render(true);
  } catch (e) { ocrStatus("Klarte ikke å lese bildet" + (navigator.onLine ? "." : " – tekstleseren trenger nett første gang.") + " Du kan skrive inn lista i stedet."); }
}
function useLes() {
  const txt = S.lesText.trim(), ar = analyse(txt);
  if (!ar.tree.length) { toast("Ta bilde av eller skriv inn en ingrediensliste først"); return; }
  if (S.pendingEan) {
    const ean = S.pendingEan;
    const p = { id: "e" + ean, ean, brand: S.pendingBrand || "DITT BILDE", name: S.pendingName || "Vare " + ean, size: "", cat: "", cats: [], img: S.pendingImg || "", src: "Ditt bilde av ingredienslisten", ing: txt, own: true, pack: "none", c1: "#2A2E33", c2: "#2A2E33" };
    saveProd(p); addHistory(p.id); S.pid = p.id; S.pendingEan = ""; S.pendingName = ""; S.lesText = ""; S.ocrStatus = "";
    S.stack = [{ view: "skanner" }]; go("vare", false); return;
  }
  S.custom = { id: "custom", brand: "FRA DITT BILDE", name: "Din vare", size: ar.tree.length + " ingredienser lest", ean: "", cat: "", src: "Ditt bilde av ingredienslisten", ing: txt, a: ar };
  S.history = S.history.filter(h => h.pid !== "custom"); addHistory("custom"); S.pid = "custom"; go("vare");
}
app.addEventListener("change", ev => { if (ev.target.id === "ocrFile") runOcr(ev.target.files && ev.target.files[0]); });

/* ---------- updates ---------- */
async function checkUpdate(manual) {
  try {
    const j = await getJSON("version.json?t=" + Date.now(), { cache: "no-store" }, 5000);
    if (j.version && j.version !== APP_VERSION) {
      if (manual) { toast("Oppdaterer …"); setTimeout(() => location.reload(), 400); }
      else showUpdateBar();
    } else if (manual) toast("Du har nyeste versjon");
  } catch (e) { if (manual) toast("Fikk ikke sjekket – er du på nett?"); }
}
function showUpdateBar() {
  if (document.getElementById("upd")) return;
  const b = document.createElement("button"); b.id = "upd"; b.className = "updbar"; b.textContent = "Ny versjon av Mage – trykk for å oppdatere";
  b.onclick = () => location.reload(); document.getElementById("app").appendChild(b);
}
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});

/* ---------- after every render ---------- */
function afterRender() {
  persist();
  if (S.view === "skanner" && !S.sheet) startCam(); else stopCam();
  if (S.view === "vare") keepProd(S.pid);
}
loadState();

# Mage – FODMAP-skanner (PWA)

Live: https://extricl4.github.io/Mage/ (GitHub Pages fra `main`, rot-mappen).
Brukeren (Emil) har iPhone + Windows-PC og ingen Mac; appen er en web-app lagt til på Hjem-skjermen.

## Bygging
Ikke rediger `index.html`, `sw.js` eller `version.json` i rota for hånd – de genereres.
Rediger kildene i `src/`, og bygg så:

```
python3 src/tools/build_app.py .            # bygger appen inn i rota
python3 src/tools/build_app.py /tmp/t --test && node src/tools/test_app.js /tmp/t   # nettlesertest (playwright + Chrome)
python3 src/tools/build_demo.py src/data/ingredienser.py src/demo/template.html /tmp/d.html --test && node src/tools/test_demo.js /tmp/d.html
```
`test_demo.js` sjekker motoren og at alle oppskrifter blir «Lav». Kjør den etter hver endring i data eller oppskrifter.

## Filer
- `src/data/ingredienser.py` – alle ingredienser (navn, synonymer/E-nummer, vurdering, OK-mengde, kilde, skånsom, bytter)
- `src/demo/template.html` – felles UI og vurderingsmotor
- `src/demo/recipes.js`, `src/demo/products.js` – oppskrifter og innebygde varer
- `src/app-src/real.js` – kamera (ZXing), Open Food Facts, Kassalapp, tekstlesing (Tesseract), lagring, oppdateringer
- `src/app-src/sw.js`, `manifest.webmanifest`, ikoner

## Regler
- Kilder: Haukeland universitetssjukehus (NKFM) og Monash. Ved uenighet vinner den strengeste.
- Ukjent ingrediens = grå («Ikke vurdert») og regnes aldri som trygg.
- Alle oppskrifter må bli «Lav». Ingen hvitløk/løk, ingen hvete, laktosefrie meieriprodukter.
- Brukerens data (historikk, lagret, innstillinger) ligger bare i telefonens localStorage.

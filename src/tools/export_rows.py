"""Shared export: turns ingredienser.py into clean row dicts (deduped synonyms, gentle flag, swaps, checked-against)."""
import importlib.util

def load(src):
    spec = importlib.util.spec_from_file_location("ing", src)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    names = [r[0].lower() for r in m.ROWS]
    taken, out = set(), []
    for name, syn, cat, ftype, rating, ok, note, source in m.ROWS:
        keep = []
        for t in [x.strip() for x in syn.split(";") if x.strip()]:
            k = t.lower()
            if k == name.lower() or k in taken or k in names:
                continue
            taken.add(k); keep.append(t)
        if name in m.SKANSOM_JA: k = "Ja"
        elif name in m.SKANSOM_NOYTRAL or cat in m.SKANSOM_NOYTRAL_KAT: k = "Nøytral"
        else: k = "Nei"
        if name in getattr(m, "HARD", {}): k = "Nei"
        if "Haukeland" in source and "Monash" in source: chk = "Haukeland + Monash"
        elif "Haukeland" in source: chk = "Haukeland"
        elif "NHI" in source: chk = "Haukeland (via NHI)"
        elif "Monash" in source: chk = "Monash"
        elif "appen" in source: chk = "Appens vurdering (små mengder)"
        else: chk = "Ingen kilde – grå for sikkerhet"
        out.append({"n": name, "s": keep, "c": cat, "f": ftype, "r": rating, "ok": ok, "note": note,
                    "src": source, "k": k, "b": m.BYTT.get(name, []), "chk": chk, "h": list(getattr(m, "HARD", {}).get(name, ()))})
    return out

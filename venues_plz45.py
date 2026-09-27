#!/usr/bin/env python3
"""
Erzeugt die Venue-Importliste für das Außendienst-Cockpit:
alle REWE-, EDEKA-, Marktkauf-, Kaufland- und HIT-Märkte im PLZ-Gebiet 4 und 5.

Datenquelle: OpenStreetMap (Overpass API), frei nutzbar unter der ODbL.
Bitte "© OpenStreetMap-Mitwirkende" als Quelle nennen, wenn die Liste weitergegeben wird.

Aufruf (nur Python 3, keine Zusatzpakete):
    python3 venues_plz45.py

Ergebnis im selben Ordner:
    venues_plz45.csv       -> direkt in der App unter Mehr > Venues > CSV importieren
    venues_ohne_plz.csv    -> Märkte im Gebiet ohne PLZ in OSM, bitte kurz prüfen und ergänzen
"""
import csv
import json
import re
import sys
import time
import urllib.parse
import urllib.request

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
# Rahmen um die PLZ-Gebiete 4 und 5 (NRW, westl. Niedersachsen, Rheinland-Pfalz, Teile Hessens).
# Gefiltert wird danach exakt über die Postleitzahl.
BBOX = "49.0,5.8,53.4,10.2"
BRAND_RE = "rewe|edeka|e center|e-center|marktkauf|kaufland|^hit( |$)"

QUERY = f"""
[out:json][timeout:900];
(
  nwr["shop"~"^(supermarket|hypermarket)$"]["brand"~"{BRAND_RE}",i]({BBOX});
  nwr["shop"~"^(supermarket|hypermarket)$"]["name"~"{BRAND_RE}",i]({BBOX});
);
out center tags;
"""

HEADER = ["Kette", "Name", "Straße", "PLZ", "Ort", "Telefon", "E-Mail",
          "Ansprechpartner", "Promotion möglich", "Standmiete je Tag", "Notiz"]


def fetch():
    data = urllib.parse.urlencode({"data": QUERY}).encode()
    last = None
    for url in ENDPOINTS:
        for attempt in range(3):
            try:
                print(f"Lade Daten von {url} (Versuch {attempt + 1}) …", flush=True)
                req = urllib.request.Request(url, data=data, headers={"User-Agent": "aussendienst-cockpit-venue-export/1.0"})
                with urllib.request.urlopen(req, timeout=960) as r:
                    return json.loads(r.read().decode("utf-8"))["elements"]
            except Exception as e:  # noqa: BLE001
                last = e
                print(f"  fehlgeschlagen: {e}", flush=True)
                time.sleep(15 * (attempt + 1))
    sys.exit(f"Abbruch: Overpass nicht erreichbar ({last}). Später erneut versuchen.")


def chain_of(tags):
    text = " ".join(tags.get(k, "") for k in ("brand", "name", "operator")).lower()
    if "marktkauf" in text:
        return "Marktkauf"
    if "kaufland" in text:
        return "Kaufland"
    if "rewe" in text:
        return "REWE"
    if "edeka" in text or re.search(r"\be[ -]?center\b", text):
        return "EDEKA"
    brand_or_name = (tags.get("brand") or tags.get("name") or "").strip()
    if re.match(r"(?i)^hit(\s|$)", brand_or_name):
        return "HIT"
    return None


def row_of(el):
    t = el.get("tags", {})
    chain = chain_of(t)
    if not chain:
        return None
    street = " ".join(x for x in (t.get("addr:street") or t.get("addr:place", ""), t.get("addr:housenumber", "")) if x).strip()
    city = t.get("addr:city") or t.get("addr:town") or t.get("addr:village") or t.get("addr:suburb") or ""
    zip_ = (t.get("addr:postcode") or "").strip()
    name = t.get("name") or chain
    if name.strip().lower() in (chain.lower(), "rewe markt", "edeka markt") and city:
        name = f"{name} {city}"
    note = f"Quelle: OpenStreetMap ({el['type']}/{el['id']})"
    if t.get("website") or t.get("contact:website"):
        note += f"; Web: {t.get('website') or t.get('contact:website')}"
    if t.get("opening_hours"):
        note += f"; Öffnungszeiten: {t['opening_hours']}"
    return {
        "Kette": chain, "Name": name, "Straße": street, "PLZ": zip_, "Ort": city,
        "Telefon": t.get("phone") or t.get("contact:phone") or "",
        "E-Mail": t.get("email") or t.get("contact:email") or "",
        "Ansprechpartner": "", "Promotion möglich": "", "Standmiete je Tag": "", "Notiz": note,
    }


def write(path, rows):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=HEADER, delimiter=";", quoting=csv.QUOTE_ALL)
        w.writeheader()
        w.writerows(rows)


def main():
    elements = fetch()
    seen, main_rows, no_zip = set(), [], []
    for el in elements:
        key = (el.get("type"), el.get("id"))
        if key in seen:
            continue
        seen.add(key)
        r = row_of(el)
        if not r:
            continue
        if re.match(r"^[45]\d{4}$", r["PLZ"]):
            main_rows.append(r)
        elif not r["PLZ"]:
            no_zip.append(r)
    # doppelte Märkte (z. B. Gebäude und Punkt für denselben Markt) zusammenfassen
    uniq = {}
    for r in main_rows:
        k = (r["Kette"], r["PLZ"], r["Straße"].lower() or r["Name"].lower())
        if k not in uniq or (not uniq[k]["Telefon"] and r["Telefon"]):
            uniq[k] = r
    rows = sorted(uniq.values(), key=lambda r: (r["PLZ"], r["Kette"], r["Name"]))
    write("venues_plz45.csv", rows)
    write("venues_ohne_plz.csv", sorted(no_zip, key=lambda r: (r["Kette"], r["Ort"])))
    counts = {}
    for r in rows:
        counts[r["Kette"]] = counts.get(r["Kette"], 0) + 1
    print("\nFertig: venues_plz45.csv mit", len(rows), "Märkten")
    for k in sorted(counts):
        print(f"  {k:<10} {counts[k]}")
    print(f"  mit Telefon: {sum(1 for r in rows if r['Telefon'])}, mit E-Mail: {sum(1 for r in rows if r['E-Mail'])}")
    print("Zur Prüfung ohne PLZ (liegen teils außerhalb von 4/5):", len(no_zip), "-> venues_ohne_plz.csv")


if __name__ == "__main__":
    main()

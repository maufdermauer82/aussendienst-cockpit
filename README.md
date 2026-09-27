# Außendienst-Cockpit

Straßen-Tracker, Leads mit E-Mail-Erinnerung, Vertragserfassung, Venues, Projektpartner, Einsatzplanung und Reporting für das Außendienst- und Promotion-Team. Die App läuft unter `https://app.mauerwerk-group.de`, die Daten liegen in Supabase in Frankfurt.

```
.
├── web/                         ← die App (statische Dateien, wird veröffentlicht)
│   ├── index.html
│   ├── assets/config.js         ← Supabase-URL und öffentlicher Schlüssel
│   ├── assets/js/               ← Anwendung (drei Dateien, in dieser Reihenfolge geladen)
│   └── CNAME                    ← app.mauerwerk-group.de (für GitHub Pages)
├── src/styles.css               ← Gestaltung (wird zu web/assets/app.css gebaut)
├── scripts/build.mjs            ← holt Bibliotheken, Schriften, Icons und baut das CSS
├── supabase/
│   ├── migrations/              ← Datenbankschema, Zugriffsregeln, Speicher, Zeitplan
│   └── functions/
│       ├── admin-users/         ← Zugänge anlegen/sperren (nur Admins)
│       └── lead-reminders/      ← Erinnerungs-Mails, alle 5 Minuten
├── werkzeuge/venues_plz45.py    ← Venue-Liste für PLZ 4 und 5 erzeugen
└── .github/workflows/pages.yml  ← veröffentlicht web/ automatisch
```

## Was bereits eingerichtet ist

Das Supabase-Projekt **aussendienst-cockpit** (`mjrqviuybuhqlrgylyxm`, Region Frankfurt) ist angelegt und vollständig vorbereitet:

- Datenbanktabellen mit Zugriffsregeln (Row Level Security), getestet für Admin und Mitarbeiter
- Login über Supabase Auth; das **erste** angelegte Konto wird automatisch Admin
- privater Dateispeicher `files` mit getrennten Bereichen für Fotos, Vertragsunterlagen und Lohnabrechnungen
- Edge Functions `admin-users` und `lead-reminders`
- Zeitplan: alle 5 Minuten prüft die Datenbank anstehende Rückrufe

Wer was darf:

| Bereich | Admin | Mitarbeiter |
|---|---|---|
| Straßen-Tracker, Leads | lesen und schreiben | lesen und schreiben |
| Verträge | alle | nur eigene (selbst erfasst oder als Kundenberater) |
| Reports | alle | alle lesen, nur eigene schreiben |
| Einsatzplanung, Venues, Partner | lesen und schreiben | nur lesen |
| Mitarbeiter-Stammdaten | alle | Name und Kontakt aller; Adresse, Geburtsdatum usw. nur eigene |
| Lohnabrechnungen, Zugänge, Datensicherung | ja | nein |

Welche Bereiche Mitarbeiter ändern dürfen, steht in der Tabelle `app_config` unter `staff_write` und lässt sich dort anpassen.

---

## Schritt 1: Drei Einstellungen im Supabase-Dashboard

Öffne [supabase.com/dashboard](https://supabase.com/dashboard) und wähle das Projekt **aussendienst-cockpit**.

**1a. Adresse der App hinterlegen** (damit Bestätigungs- und Passwort-Links funktionieren)
Authentication › URL Configuration:
- *Site URL:* `https://app.mauerwerk-group.de`
- *Redirect URLs:* `https://app.mauerwerk-group.de/**` hinzufügen

**1b. Mailversand für die Rückruf-Erinnerungen**
Edge Functions › Secrets (bzw. „Manage secrets“) und diese Werte anlegen:

| Name | Beispiel |
|---|---|
| `MAIL_FROM` | `Außendienst-Cockpit <noreply@mauerwerk-group.de>` |
| `SMTP_HOST` | Postausgangsserver eures Mail-Anbieters, z. B. `smtp.ionos.de` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `noreply@mauerwerk-group.de` |
| `SMTP_PASS` | Passwort des Postfachs |
| `APP_URL` | `https://app.mauerwerk-group.de` |

Wichtig: Supabase erlaubt aus Edge Functions **nur Port 465** (SSL), nicht 587. Alle großen Anbieter (IONOS, Strato, all-inkl, Microsoft 365 mit SMTP-AUTH) unterstützen 465. Alternativ statt SMTP einen Schlüssel `RESEND_API_KEY` von [resend.com](https://resend.com) eintragen; dann die Domain dort einmalig verifizieren.

**1c. Mails für Passwort-Zurücksetzen** (empfohlen)
Supabase verschickt Systemmails anfangs über einen eigenen Server, der nur wenige Mails pro Stunde erlaubt. Unter Authentication › Emails › SMTP Settings dieselben SMTP-Daten eintragen (hier darf auch Port 587 genutzt werden).

## Schritt 2: App veröffentlichen

Wähle **eine** der drei Varianten.

### Variante A: GitHub Pages (automatisch bei jeder Änderung)

1. Das Repository `aussendienst-cockpit` ist bereits angelegt und befüllt.
   - Kostenlose GitHub-Konten können Pages nur mit **öffentlichen** Repositories nutzen. Das ist hier unkritisch: Im Code stehen keine Geheimnisse, der Schlüssel in `config.js` ist ausdrücklich für den Browser gedacht, und alle Daten sind durch Login und Zugriffsregeln geschützt. Für ein privates Repository braucht ihr GitHub Pro oder Team.
2. Der Workflow baut die App bei jedem Push selbst (Bibliotheken, Schriften, Icons, CSS) und veröffentlicht sie.
3. Im Repository: Settings › Pages › *Source*: **GitHub Actions**. Der Workflow „App veröffentlichen“ läuft danach automatisch (Reiter „Actions“).
4. Settings › Pages › *Custom domain*: `app.mauerwerk-group.de` eintragen und speichern.
5. Beim Domain-Anbieter von mauerwerk-group.de einen DNS-Eintrag anlegen:
   - Typ `CNAME`, Name `app`, Ziel `DEIN-GITHUB-NAME.github.io`
6. Nach einigen Minuten in Settings › Pages „Enforce HTTPS“ aktivieren.

### Variante B: Eigener Webspace per FTP (alles bleibt in Deutschland)

1. Beim Hoster die Subdomain `app.mauerwerk-group.de` mit eigenem Ordner und SSL (Let's Encrypt) anlegen.
2. Einmal die fertigen Dateien bauen: [Node.js](https://nodejs.org) installieren, im Projektordner `npm install` und danach `npm run build` ausführen. Das legt Bibliotheken, Schriften, Icons und das CSS in `web/assets` ab (alles lokal, keine Einbindung externer Server).
3. Den **Inhalt** des Ordners `web/` per FTP/SFTP in den Subdomain-Ordner laden (inkl. der versteckten Datei `.htaccess`). Die Datei `CNAME` wird hier nicht gebraucht.
4. Fertig. PHP oder eine Datenbank beim Hoster sind nicht nötig.

### Variante C: Netlify, Vercel oder Cloudflare Pages

Repository verbinden, als Build-Befehl `npm install && npm run build` und als Veröffentlichungsordner `web` angeben. Die eigene Domain im jeweiligen Dashboard hinzufügen und den angezeigten DNS-Eintrag beim Domain-Anbieter setzen. Diese Dienste erlauben private Repositories kostenlos.

**Datenschutz-Hinweis zur Wahl:** Bei A und C wird die App-Oberfläche über Server in den USA ausgeliefert (dabei fallen IP-Adressen der Nutzer an). Die eigentlichen Daten liegen in allen Varianten in Frankfurt. Wer alles in Deutschland halten will, nimmt Variante B.

## Schritt 3: Ersten Admin anlegen

1. `https://app.mauerwerk-group.de` öffnen. Solange noch niemand registriert ist, zeigt die App „Ersten Admin anlegen“.
2. Name, E-Mail und Passwort (mindestens 10 Zeichen) eingeben.
3. Die Bestätigungs-Mail öffnen und den Link anklicken, danach anmelden.
4. **Danach die öffentliche Registrierung abschalten:** Supabase-Dashboard › Authentication › Sign In / Providers › Email › „Allow new users to sign up“ ausschalten. Neue Mitarbeiter legst du ab jetzt nur noch in der App an. (Selbst wenn jemand sich vorher registriert: Neue Konten sind gesperrt, bis ein Admin sie freischaltet.)

## Schritt 4: Team einrichten

1. Mehr › Mitarbeiter › „Mitarbeiter“: Stammdaten, Kontakt, Foto.
2. Mehr › Zugänge › „Zugang“: Mitarbeiter wählen, Rolle festlegen, Start-Passwort notieren und persönlich übergeben. Jeder kann es danach über sein Profilbild oben rechts ändern.
3. Auf dem Handy wie eine App nutzen: iPhone-Safari „Teilen“ › „Zum Home-Bildschirm“, Android-Chrome „⋮“ › „Zum Startbildschirm hinzufügen“.
4. Venues: `werkzeuge/venues_plz45.py` ausführen (`python3 venues_plz45.py`), die erzeugte CSV unter Mehr › Venues › „CSV importieren“ einspielen.

## Erinnerungs-Mails prüfen

Einen Lead mit Anrufzeitpunkt in 5 Minuten und eigener E-Mail-Adresse anlegen. Spätestens 10 Minuten vor dem Termin kommt die Mail. Kommt nichts:
- Supabase-Dashboard › Edge Functions › `lead-reminders` › Logs zeigt Fehler wie „Kein Mailversand konfiguriert“ oder SMTP-Meldungen.
- Die Zeile „ohne Adresse“ im Log bedeutet: Beim Lead und beim zuständigen Mitarbeiter fehlt eine E-Mail-Adresse.

## Betrieb

**Free-Plan:** Das Projekt pausiert nach 7 Tagen ohne jeden Zugriff (im Dashboard mit einem Klick wieder startbar). Grenzen: 500 MB Datenbank, 1 GB Dateien, keine automatischen Backups. Für den Echtbetrieb mit Lohnabrechnungen empfiehlt sich der Pro-Plan (Organization › Billing) mit täglichen Backups; ein Umzug ist dafür nicht nötig.

**Datensicherung:** Mehr › Datensicherung › „Sicherung herunterladen“ sichert alle Datensätze als JSON (Dateien wie Fotos und PDFs sind nicht enthalten). Im Free-Plan mindestens monatlich herunterladen.

**Datenschutz (DSGVO):** Im Supabase-Dashboard unter Organization › Legal Documents den Auftragsverarbeitungsvertrag (DPA) abschließen. Die App ins Verzeichnis der Verarbeitungstätigkeiten aufnehmen, Mitarbeiter über gespeicherte Daten informieren und Löschfristen festlegen.

## Änderungen einspielen

- **App:** die Dateien in `web/assets/js/` bzw. `src/styles.css` ändern und committen. Bei Variante A baut und veröffentlicht GitHub automatisch, bei B `npm run build` ausführen und die geänderten Dateien per FTP hochladen.
- **Datenbank und Functions** (für Entwickler, mit der [Supabase CLI](https://supabase.com/docs/guides/cli)):
  ```
  supabase link --project-ref mjrqviuybuhqlrgylyxm
  supabase db push
  supabase functions deploy admin-users
  supabase functions deploy lead-reminders --no-verify-jwt
  ```

## Fehlerbehebung

| Problem | Lösung |
|---|---|
| „App noch nicht konfiguriert“ | `web/assets/config.js` fehlt oder wurde nicht hochgeladen. |
| Login klappt nicht, „Bitte zuerst die Bestätigungs-Mail öffnen“ | Link in der Mail anklicken. Kommt keine Mail: Schritt 1a und 1c prüfen. |
| Bestätigungslink führt ins Leere | In Schritt 1a Site URL und Redirect URL auf die App-Adresse setzen. |
| „Zugang noch nicht freigeschaltet“ | Ein Admin muss den Zugang unter Mehr › Zugänge auf „Aktiv“ setzen. |
| „Keine Berechtigung für diese Aktion“ | Gewollt, z. B. wenn ein Mitarbeiter Einsätze ändern will. Siehe Rechte-Tabelle oben. |
| Seite lädt nach Wochen nicht mehr | Supabase-Projekt pausiert (Free-Plan). Im Dashboard „Restore project“. |
| GitHub Pages zeigt 404 | Settings › Pages › Source muss „GitHub Actions“ sein; unter „Actions“ prüfen, ob der Workflow durchlief. |

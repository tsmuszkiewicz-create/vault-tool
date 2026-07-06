# Vault – dein schlankes Obsidian-Ersatz-Tool

Eine kleine PWA (Progressive Web App), die direkt gegen deinen bestehenden
Markdown-Vault auf Google Drive arbeitet. Kein Server, keine Datenbank,
kein Plugin-System – nur die vier Dinge, die du wirklich brauchst:

1. Notizen lesen & bearbeiten (Markdown)
2. `[[Wikilinks]]` + Backlinks
3. Tags + Volltextsuche
4. Aufgabenverwaltung über den gesamten Vault (inkl. Verknüpfung zu Rocks/Zielen/10-Punkte-Plan)

Läuft auf Desktop und Handy (als installierte App), sobald sie einmal online gehostet ist.

---

## 1. Einmalige Einrichtung (ca. 10 Minuten)

### 1.1 Google-Cloud-Projekt & OAuth-Client anlegen

1. Gehe zu [console.cloud.google.com](https://console.cloud.google.com) und wähle ein Projekt
   (oder lege ein neues an – reicht die kostenlose Stufe).
2. **APIs & Dienste → Bibliothek** → nach "Google Drive API" suchen → **Aktivieren**.
3. **APIs & Dienste → Anmeldedaten → + Anmeldedaten erstellen → OAuth-Client-ID**.
   - Falls noch nicht geschehen: OAuth-Zustimmungsbildschirm einmal konfigurieren
     (Nutzertyp "Extern" reicht, Status "Test" mit deiner eigenen E-Mail als Testnutzer).
   - Anwendungstyp: **Webanwendung**
   - **Autorisierte JavaScript-Quellen**: trage hier alle Domains ein, unter denen
     du die App später öffnest, z. B.:
     - `http://localhost:8080` (zum lokalen Testen)
     - `https://<dein-name>.github.io` (falls du über GitHub Pages hostest)
4. Die generierte **Client-ID** kopieren.

### 1.2 Konfiguration eintragen

Öffne `js/config.js` und trage ein:

```js
CLIENT_ID: 'DEINE_CLIENT_ID.apps.googleusercontent.com',
ROOT_FOLDER_ID: '1TxmGBrBUTBisa44bDqFXaQz1QgoOoF3a', // dein "Lugert Verlag"-Vault
```

Die `ROOT_FOLDER_ID` ist bereits auf deinen Vault-Ordner voreingestellt (den
Unterordner "Lugert Verlag", nicht den übergeordneten Drive-Ordner mit den
losen Dateien). Falls du den Vault verschiebst, findest du die ID in der
Drive-URL nach `.../folders/`.

---

## 2. Lokal testen

Da Google OAuth einen "richtigen" Origin braucht, reicht Doppelklick auf
`index.html` nicht aus. Starte stattdessen einen simplen lokalen Server:

```bash
cd vault-tool
python3 -m http.server 8080
```

Dann `http://localhost:8080` im Browser öffnen (dieser Origin muss wie oben
in den "Autorisierten JavaScript-Quellen" eingetragen sein).

---

## 3. Für unterwegs online stellen (nötig für Handy-Zugriff)

`localhost` ist von deinem Handy aus nicht erreichbar. Für echten
Desktop-und-Handy-Zugriff muss die App auf einer echten HTTPS-Domain liegen.
Am einfachsten & kostenlos:

**GitHub Pages** (empfohlen):
1. Neues (privates oder öffentliches) GitHub-Repo anlegen, Inhalt von
   `vault-tool/` hineinlegen und pushen.
2. Repo-Einstellungen → **Pages** → Branch auswählen → Speichern.
3. Du bekommst eine URL wie `https://<dein-name>.github.io/<repo>/`.
4. Diese URL zusätzlich in Google Cloud unter "Autorisierte JavaScript-Quellen" eintragen.

Alternativen: Netlify oder Vercel (Drag-and-drop-Deploy, auch kostenlos).

Danach auf dem Handy die URL öffnen → Browser-Menü → **"Zum Startbildschirm
hinzufügen"** (iOS Safari) bzw. **"App installieren"** (Android Chrome) –
fertig ist die installierte App-Kachel.

> Hinweis: Da der Code nur clientseitig läuft und dein eigener OAuth-Client
> nur dir Zugriff gibt, ist ein öffentliches GitHub-Repo unbedenklich – es
> liegen keine Zugangsdaten oder Notizinhalte im Code, nur die Client-ID
> (die allein keinen Zugriff erlaubt, da Google zusätzlich deine Anmeldung
> verlangt).

---

## 4. Bedienung

- **Anmelden** mit deinem Google-Konto (dem, das Zugriff auf den Vault hat).
- **Sync-Button** (Kreis-Pfeile, unten in der Seitenleiste) lädt/aktualisiert
  den gesamten Vault-Inhalt. Beim ersten Mal dauert das je nach Notizanzahl
  ein paar Sekunden.
- **Aufgaben-Tab**: aggregiert automatisch alle `- [ ]`-Zeilen aus dem
  gesamten Vault (außer 01 Inbox/05 Daily Notes bei den Datums-Kategorien)
  in: Überfällig, Heute, Diese Woche, Nächste 30 Tage, Ohne Datum, Privat
  (Tag `#privat`). Checkbox anklicken = direkt in Drive gespeichert.
  "+ Aufgabe" legt eine neue Zeile in `TASKS.md` an (wird beim ersten Mal
  automatisch erstellt, falls sie noch fehlt).
- **Strategische Verknüpfung**: Aufgaben mit Tags wie `#rock-q3-r1`,
  `#qziel-q3-z1` oder `#plan-q3-p1` bekommen automatisch ein Badge, das zur
  passenden Notiz in `03 Bereiche/Führung & Strategie` verlinkt (Q3 Rocks /
  Quartalsziele Q3 / Q3 10-Punkte-Plan) – genau das Schema aus deiner
  📋 Übersicht.md.
- **Notizen-Tab**: Ordnerbaum links, Notiz anklicken zum Lesen. "Bearbeiten"
  öffnet den rohen Markdown-Text zum Editieren, "Speichern" schreibt direkt
  zurück nach Drive.
- **`[[Wikilinks]]`** im Text sind klickbar und öffnen die verlinkte Notiz.
  Nicht gefundene Ziele werden gestrichelt/blass dargestellt.
- **Backlinks** stehen am Ende jeder Notiz.
- **Tags** (Seitenleiste unten) zeigen alle Notizen + Aufgaben mit diesem Tag.
- **Suche** (oben in der Seitenleiste) durchsucht Titel und Inhalt aller Notizen.

---

## 5. Bewusste Grenzen (kein Obsidian-Ersatz 1:1)

- Kein Plugin-System, keine Graph-Ansicht.
- Checkboxen sind nur im Aufgaben-Dashboard direkt klickbar, nicht in der
  normalen Notiz-Lesevansicht (dort read-only) – Bearbeiten geht über den
  "Bearbeiten"-Button.
- Kein Offline-Bearbeiten: Notizinhalte werden live von Drive geladen/geschrieben,
  nur die App-Oberfläche selbst funktioniert dank Service Worker offline.
- Bilder/Anhänge (`07 Anhänge`) werden nicht eingebettet angezeigt, nur Text.
- Die YAML-Frontmatter-Verarbeitung ist bewusst einfach gehalten (flache
  Felder + Listen) – reicht für `tags`, `status`, `date`, wie sie im Vault
  aktuell genutzt werden.

## 6. Struktur

```
vault-tool/
├── index.html        Haupt-Shell (Login + App)
├── manifest.json      PWA-Manifest (installierbar)
├── sw.js               Service Worker (App-Shell-Cache, keine Drive-Daten)
├── css/style.css       Design (angelehnt an dein bestehendes aufgaben.html)
├── js/config.js        Deine Einstellungen (Client-ID, Vault-Ordner-ID)
├── js/drive.js         Google-OAuth + Drive-Read/Write (Basis: aufgaben.html)
├── js/markdown.js       Frontmatter/Wikilinks/Tags/Task-Parsing + Rendering
├── js/vault.js          Rekursiver Vault-Index, Backlinks, Tag-Index, Suche
├── js/tasks.js           Task-Aggregation, Kategorien, strategische Verknüpfung
├── js/app.js              UI-Logik (Sidebar, Notiz-Editor, Dashboard, Modal)
└── icons/                 App-Icons
```

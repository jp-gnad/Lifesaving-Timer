# Lifesaving Timer

Eine bewusst einfache, helle Web-App zur Zeitnahme im Rettungssport. Events, Personen und Ergebnisse sind öffentlich und ohne Anmeldung erreichbar.

## Funktionen

- Öffentliche Eventübersicht
- Personen mit Name, Jahrgang, Altersklasse, Geschlecht und Gliederung
- Einzelzeitnahme auf mehreren Geräten gleichzeitig
- Separate Tasten für Start, Lap und Stopp
- Letzten Lap zurücknehmen, Versuch verwerfen und Abschnittszeiten korrigieren
- Feste Lap-Anzahl je Disziplin; Normalmodus mit bis zu 20 Laps
- Zuordnung der Person erst nach dem Stoppen
- Live-Rangliste nach Disziplin und Geschlecht, automatisch alle 3 Sekunden aktualisiert
- Speicherung im Format `mm:ss,00` (intern auf Hundertstelsekunden genau)

## Technik

Die App besteht aus statischem HTML, CSS und JavaScript, einem Cloudflare Worker als API und einer Cloudflare-D1-Datenbank. Es gibt keinen Build-Schritt und keine Frontend-Abhängigkeiten. Dadurch bleibt die App klein und die Bereitstellung übersichtlich.

## Einmalige Veröffentlichung auf Cloudflare

### 1. Node.js installieren

Installiere die aktuelle LTS-Version von [Node.js](https://nodejs.org/). `npm` wird dabei automatisch mitinstalliert. Öffne danach ein neues Terminal und prüfe:

```powershell
node --version
npm --version
```

### 2. Projekt vorbereiten

Öffne PowerShell im Ordner dieses Repositorys und führe aus:

```powershell
npm install
npx wrangler login
```

Beim Login öffnet sich Cloudflare im Browser. Dort den Zugriff bestätigen.

### 3. D1-Datenbank erstellen

```powershell
npx wrangler d1 create lifesaving-timer-db
```

Der Befehl zeigt eine `database_id` an. Öffne `wrangler.jsonc` und ersetze dort exakt:

```text
00000000-0000-0000-0000-000000000000
```

durch diese ID. Anführungszeichen beibehalten und die Datei speichern.

### 4. Tabellen anlegen

```powershell
npm run db:remote
```

Die Rückfrage zum Anwenden der Migration mit `y` bestätigen.

### 5. App veröffentlichen

```powershell
npm run deploy
```

Wrangler zeigt anschließend die öffentliche Adresse, üblicherweise:

```text
https://lifesaving-timer.<deine-subdomain>.workers.dev
```

Diese Adresse ist der öffentliche App-Link. Der GitHub-Link selbst zeigt weiterhin den Quellcode und kann keine D1-Datenbank ausführen.

## Lokal testen

Zuerst die lokale Datenbank initialisieren, danach den Entwicklungsserver starten:

```powershell
npm run db:local
npm run dev
```

Die App ist anschließend unter [http://localhost:8787](http://localhost:8787) erreichbar. Lokale Testdaten sind von der veröffentlichten Datenbank getrennt.

## Automatische Deployments über GitHub (optional)

Nach der ersten erfolgreichen Veröffentlichung kann Cloudflare jeden Push auf `main` automatisch bereitstellen:

1. Im [Cloudflare Dashboard](https://dash.cloudflare.com/) **Workers & Pages** öffnen.
2. Den Worker **lifesaving-timer** auswählen.
3. **Settings → Builds → Connect** auswählen.
4. GitHub autorisieren und `jp-gnad/Lifesaving-Timer` verbinden.
5. Produktionsbranch `main` auswählen.
6. Build-Befehl leer lassen; Deploy-Befehl `npx wrangler deploy` verwenden.

Der Worker-Name im Dashboard muss genau `lifesaving-timer` heißen. Datenbankmigrationen bei späteren Schemaänderungen weiterhin einmal mit `npm run db:remote` anwenden.

## Wichtiger Hinweis zum öffentlichen Betrieb

Wie gewünscht gibt es keine Konten und keine Rollen. Deshalb kann jeder Besucher nicht nur Ergebnisse sehen, sondern über die Oberfläche auch Events, Personen und Ergebnisse anlegen oder löschen. Das ist für einen unkomplizierten ersten Stand geeignet, aber nicht gegen absichtliche Manipulation geschützt. Vor einer größeren öffentlichen Veranstaltung sollte mindestens ein einfacher Verwaltungszugang ergänzt werden.

## Projektstruktur

```text
public/                 Oberfläche
src/index.js            Worker-API
migrations/             D1-Datenbankschema
wrangler.jsonc          Cloudflare-Konfiguration
```

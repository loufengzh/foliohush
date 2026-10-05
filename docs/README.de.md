# Foliohush

**Ein ruhiger Platz für den nächsten Gedanken.**

Foliohush ist eine Schreibanwendung mit lokaler Speicherung, großzügigem Layout und einem React-Editor. Schreibe einen Entwurf, halte wichtige Zwischenstände fest und nimm deinen Text als JSON, Markdown oder HTML mit.

[English](../README.md) · [简体中文](README.zh-CN.md) · [Русский](README.ru.md) · Deutsch

## Funktionen

- **Ein übersichtlicher Schreibtisch.** Dokumentenliste, Titelsuche, Überschriftennavigation, Fokusmodus, Wortzahl und geschätzte Lesezeit.
- **Formatierung direkt am Text.** Markiere Text für Fett, Kursiv, Durchstreichen, Hervorhebung, Inline-Code und Links. Über die Blockauswahl oder `/` in einem leeren Absatz fügst du Überschriften, Listen, Zitate, Codeblöcke und Trennlinien ein.
- **Benannte Zwischenstände.** Speichere Snapshots manuell und stelle frühere Fassungen wieder her. Vor jeder Wiederherstellung wird der aktuelle Entwurf als Snapshot gesichert. Pro Dokument bleiben die neuesten 12 Snapshots erhalten.
- **Automatisches Speichern im Browser.** Dokumente und Snapshots liegen gemeinsam in `localStorage`. Speicherfehler werden angezeigt; beschädigte oder inkompatible Daten werden nicht unbemerkt überschrieben. Vor jedem Schreiben werden die erwarteten Speicherdaten verglichen; Web Locks koordinieren beteiligte Tabs, sofern verfügbar. Erkannte Konflikte pausieren das Speichern.
- **Dateien zum Mitnehmen.** JSON enthält ein Dokument samt Snapshots. Markdown und HTML dienen zum Lesen oder zur weiteren Veröffentlichung. Ein geprüfter JSON-Import erstellt immer ein neues Dokument. Bei Speicherfehlern kann ein TXT-Notfallexport den aktuellen Editorinhalt retten.
- **Wiederverwendbarer Quellcode.** Die React-Komponente `FolioEditor` bietet typisierte Callbacks, anpassbaren Platzhaltertext und einen bearbeitbaren beziehungsweise schreibgeschützten Modus.

Dies ist ein einzelnes Anwendungsrepository, kein veröffentlichtes npm-Komponentenpaket. Eine gehostete Live-Demo gehört nicht zum Lieferumfang. Die Benutzeroberfläche ist derzeit englisch; diese README übersetzt die Dokumentation, nicht die Oberfläche.

## Lokal starten

Benötigt werden **Node.js 22.12 oder neuer** und npm. Der enthaltene CI-Workflow verwendet Node 24.

Im Repository-Verzeichnis ausführen:

```sh
npm ci
npm run dev
```

Öffne die von Vite ausgegebene Adresse, normalerweise `http://127.0.0.1:5173`. Konto, API-Schlüssel und Backend sind nicht erforderlich. Für die Installation werden Abhängigkeiten benötigt; Schriftdateien werden über Fontsource lokal gebündelt und zur Laufzeit nicht von einem Schrift-CDN geladen.

Produktions-Build erstellen und lokal prüfen:

```sh
npm run build
npm run preview
```

Die Ausgabe liegt in `dist/` und kann über einen statischen Webhost bereitgestellt werden. `npm run preview` dient der lokalen Prüfung, nicht als Produktionsserver. Ein anderer Hostname, ein anderes Protokoll oder ein anderer Port bedeutet einen separaten Browserspeicher.

## Schreiben, sichern, weiterarbeiten

1. Klicke auf **New document** und gib der Seite einen Titel.
2. Schreibe los. Markierter Text öffnet die schwebende Formatleiste.
3. Tippe `/` in einen leeren Absatz. Filtere Blocktypen nach Namen, wähle mit den Pfeiltasten, füge mit Enter ein oder schließe mit Escape.
4. Öffne vor größeren Änderungen **Snapshots**, gib einen Namen ein und wähle **Save snapshot**.
5. Lade mit **Export → Full-fidelity backup** das aktuelle Dokument samt Snapshots als JSON herunter. Sichere mehrere Dokumente einzeln.
6. **Import a JSON backup** lädt eine exportierte Datei als eigenständigen neuen Entwurf.

| Aktion                | Tastenkürzel               |
| --------------------- | -------------------------- |
| Fett                  | Strg/⌘ + B                 |
| Kursiv                | Strg/⌘ + I                 |
| Rückgängig            | Strg/⌘ + Z                 |
| Fokusmodus umschalten | Strg/⌘ + Umschalt + F      |
| Blockmenü öffnen      | `/` in einem leeren Absatz |

Die Wortzählung trennt Text an Leerraum. Die Lesezeit basiert auf etwa 220 Wörtern pro Minute und beträgt mindestens eine Minute. Beides sind Näherungen, besonders bei Sprachen ohne Leerzeichen zwischen Wörtern.

## Eine Kopie außerhalb des Browsers behalten

**Browserspeicher ist kein Backup. Das Löschen von Websitedaten entfernt Entwürfe und Snapshots. Es gibt weder Konto noch Cloud-Synchronisierung oder Wiederherstellung vom Server.** Ein anderer Browser, ein anderes Profil, Gerät, Host oder Port hat einen eigenen Arbeitsbereich. Privates Surfen und Browserrichtlinien können die Aufbewahrung zusätzlich einschränken.

- Exportiere wichtige Dokumente regelmäßig als JSON und bewahre die Dateien an einem Ort deiner Wahl auf. Ein Export enthält das ausgewählte Dokument, nicht die ganze Bibliothek.
- Snapshots teilen sich den Speicher mit dem Entwurf und schützen nicht vor Geräteverlust oder gelöschten Websitedaten. Beim dreizehnten Snapshot entfällt der älteste. Auch der Snapshot vor einer Wiederherstellung zählt zum Limit von 12.
- Bei **Not saved** oder einer Speicherwarnung solltest du vor dem Schließen oder Neuladen exportieren. **Export → Emergency plain text** lädt bei ungespeichertem Stand den aktuellen Text als TXT ohne Formatierung und Snapshots herunter. Die App garantiert keinen automatischen erneuten Versuch nach einer Speicherpause.
- Bearbeite denselben Arbeitsbereich möglichst nicht in mehreren Tabs gleichzeitig. Vor dem Schreiben vergleicht die App den Speicher mit den zuletzt gelesenen oder gespeicherten Bytes und verwendet `navigator.locks`, sofern verfügbar. Ohne Web Locks bleibt nur ein optimistischer Vergleich; ein Wettlauf gleichzeitiger Schreibvorgänge ist möglich. Konflikte pausieren das Speichern, eine automatische Zusammenführung gibt es nicht.
- In einem bereits geladenen Tab kannst du ohne Netzwerk weiterschreiben. Es gibt keinen Service Worker und keine installierbare PWA; das Offline-Öffnen oder -Neuladen einer gehosteten Version ist daher nicht garantiert.
- Lokale Dokumente und heruntergeladene Backups werden von Foliohush nicht verschlüsselt. Software mit Zugriff auf das Browserprofil oder die Dateien kann sie möglicherweise lesen.

## Umfang und Grenzen

Foliohush ist für **textbasiertes Schreiben** gedacht: Absätze, Überschriften der Ebenen 1–3, Aufzählungen, nummerierte Listen, Zitate, Codeblöcke, Trennlinien und Inline-Formatierung. Bilder, Anhänge, Tabellen, eingebettete Inhalte, Zusammenarbeit, Veröffentlichungskonten, KI-Dienste sowie Markdown-/HTML-Dateiimporte werden nicht unterstützt. Die aktuelle Oberfläche bietet außerdem weder Dokumentlöschung noch einen Gesamtexport des Arbeitsbereichs.

Ein Arbeitsbereich enthält höchstens **50 Dokumente** mit jeweils **12 Snapshots**. Der gespeicherte Arbeitsbereich sowie jede importierte oder exportierte JSON-Datei sind auf **4 MiB** begrenzt. Browserlimits können niedriger liegen; Snapshots zählen zum Gesamtvolumen. Diese Grenzen dienen dem Schutz und garantieren keine flüssige Bearbeitung nahe am Limit.

Der Editor prüft dokumentverändernde Transaktionen vor der Übernahme und weist nicht unterstützte Änderungen mit einem Hinweis zurück. Der JSON-Import akzeptiert ausschließlich das versionierte Foliohush-Format und prüft Knoten, Attribute sowie die Komplexität. Links müssen absolute `http:`-, `https:`- oder `mailto:`-Adressen sein. Das verringert Risiken, bestätigt aber nicht die Vertrauenswürdigkeit eines Linkziels. Importierte Dokumente erhalten neue IDs, damit eine Datei keinen vorhandenen Entwurf über dessen Kennung ersetzt.

Markdown kann nicht jede Rich-Text-Eigenschaft darstellen: Unterstreichung und Hervorhebung verlieren ihr Aussehen, behalten aber den Text; alphabetische und römische Listenzeichen werden zu Zahlen. Das Dokumentformat unterstützt Listen ab 0 und die Markierungstypen `1`, `a`, `A`, `i`, `I`; JSON und HTML erhalten diese Attribute. HTML exportiert die unterstützte Formatierung als eigenständige Seite ohne die Gestaltung der App. Beide Formate enthalten keine Snapshots und lassen sich nicht über die App zurückimportieren. Für ein wiederherstellbares Backup ist JSON vorgesehen.

## Entwicklung und Prüfung

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Unter Linux können zusätzliche Systemabhängigkeiten nötig sein: `npx playwright install --with-deps chromium`. Der CI-Workflow ist für Typprüfung, Unit-/jsdom-Tests, Produktions-Build und Chromium-Browsertests konfiguriert. Tests im echten Browser und die visuelle Prüfung stehen noch aus; jsdom ersetzt beides nicht. Siehe [Prüfprotokoll, Englisch](verification.md). Eine vorhandene Konfiguration bedeutet nicht, dass entfernte CI-Läufe bereits erfolgreich waren.

- [Architektur und Komponentenintegration, Englisch](architecture.md)
- [Beitragsleitfaden, Englisch](../CONTRIBUTING.md)
- [Sicherheitshinweise, Englisch](../SECURITY.md)
- [Drittanbieterhinweise, Englisch](../THIRD_PARTY_NOTICES.md)

## Herkunft und Lizenz

Anwendungshülle, Gestaltung, Slash-Menü, Snapshot-Ablauf, Validierung und Exporte sind Projektcode. Der Editor basiert auf [Tiptap](https://tiptap.dev) und [ProseMirror](https://prosemirror.net). React stellt die UI-Laufzeit bereit, Vite die Build-Werkzeuge, Lucide die Symbole. DM Sans und Libre Caslon Text werden über Fontsource ausgeliefert.

Das Design ist von großzügigen, redaktionellen Schreiboberflächen inspiriert. Foliohush ist nicht mit Medium verbunden, verwendet dessen Markenauftritt nicht und beansprucht die zugrunde liegende Editortechnik nicht als Eigenentwicklung.

Der eigene Projektcode steht unter der [MIT-Lizenz](../LICENSE), Copyright 2026 loufengzh. Abhängigkeiten und Schriftarten behalten ihre jeweiligen Lizenzen; siehe [Drittanbieterhinweise](../THIRD_PARTY_NOTICES.md).

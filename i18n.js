/**
 * SACRVM DESKTOP — the desktop's own UI strings, per language.
 *
 * English lives inline in desktop.js as the fallback of every T() call; this
 * file only adds other languages. desktop.js hands each table to
 * sac.i18n.add() at boot, next to the kit's own (kit/js/i18n/). Keys are
 * written without their "desktop." prefix here and gain it on the way in.
 */
(function () {
    const de = {
        "tile.install": "App installieren",
        "tile.install-first": "Deine erste App installieren",
        "tile.options": "Optionen für {name}",
        "tile.medium": "Mittlere Kachel",
        "tile.wide": "Breite Kachel",
        "tile.large": "Große Kachel",
        "tile.remove": "Von diesem Desktop entfernen",

        "accent.blue": "Blau (Standard)",
        "accent.teal": "Petrol",
        "accent.green": "Grün",
        "accent.violet": "Violett",
        "accent.pink": "Pink",
        "accent.orange": "Orange",
        "accent.yellow": "Gelb",
        "accent.slate": "Schiefer",
        "accent.shipped": "Farbe der App",
        "accent.desktop": "Farbe des Desktops",
        "accent.custom": "Eigene",
        "accent.label": "Akzentfarbe",
        "accent.app-label": "Akzentfarbe — {name}",
        "accent.hint": "Eine Farbe färbt den ganzen Desktop neu. Eine App mit eigener " +
            "Akzentfarbe behält sie — das ist ihre Identität, nicht deine, es sei denn, " +
            "du färbst sie über ihre Kachel oder hier um.",
        "accent.app-hint": "Das färbt {name} auf diesem Desktop um: Die App hinter diesem " +
            "Dialog und ihre Kachel ziehen mit. Die Akzentfarbe des Desktops selbst stellst " +
            "du auf dem Startbildschirm ein.",
        "accent.app-follows": "Gerade trägt sie die Akzentfarbe deines Desktops und folgt ihr.",

        "origin.unknown": "unbekannte Herkunft",

        "notapp.title": "Keine App, die dieser Desktop installieren kann",
        "notapp.body": "Dieser Desktop installiert SACRVM-APPKIT-Apps — ein Repository, " +
            "dessen GitHub Pages im Stammverzeichnis eine app.json ausliefert, neben dem " +
            "einen Custom Element, das die App ist. Jedes andere Repository, so gut es " +
            "auch ist, hat hier nichts zu lesen.\n\n" +
            "Eine zu bauen ist wenig Arbeit: von der Vorlage starten, fünf Texte umbenennen, " +
            "Pages einschalten.",
        "notapp.looked": "Gesucht unter: {url}",
        "notapp.how": "So baust du eine",

        "confirm.install-title": "{name} installieren?",
        "confirm.update-title": "{name} aktualisieren?",
        "confirm.no-description": "Keine Beschreibung.",
        "confirm.origin": "Herkunft: {origin}",
        "confirm.version": "Version: {version} · läuft als: {kind}",
        "confirm.unversioned": "ohne Version",
        "confirm.runs-code": "Mit der Installation darf diese App ihren eigenen Code auf " +
            "deinem Desktop ausführen.",
        "confirm.install": "Installieren",
        "confirm.update": "Aktualisieren",
        "kind.view": "Ansicht",
        "kind.window": "Fenster",

        "toast.installed": "{name} installiert.",
        "toast.purged": "{name} und seine Daten sind gelöscht.",
        "toast.nothing": "Nichts installiert.",

        "size.bytes": "{n} Bytes",
        "size.item": "1 Eintrag",
        "size.items": "{n} Einträge",

        "common.cancel": "Abbrechen",
        "common.delete": "Löschen",
        "common.and": " und ",

        "remove.title": "{name} entfernen?",
        "remove.unsaved": "{name} ist mit ungespeicherter Arbeit geöffnet. Entfernen " +
            "schließt die App, und diese Arbeit geht verloren.",
        "remove.body": "Die App verschwindet vom Desktop DIESES Browsers — nur dort war " +
            "sie.\n\nDie App selbst bleibt unverändert unter {origin}, und sie wieder zu " +
            "installieren ist ein Einfügen.",
        "remove.data": "Sie hat hier {data} gespeichert. Das bleibt standardmäßig erhalten, " +
            "eine Neuinstallation bringt es zurück — oder lösche es jetzt, was sich nicht " +
            "rückgängig machen lässt.",
        "remove.keep": "Entfernen, Daten behalten",
        "remove.remove": "Entfernen",
        "remove.purge": "Entfernen + Daten löschen",

        "remove-all.title": "Alle {n} Apps entfernen?",
        "remove-all.unsaved-one": "{names} ist mit ungespeicherter Arbeit geöffnet, die " +
            "verloren geht.",
        "remove-all.unsaved": "{names} sind mit ungespeicherter Arbeit geöffnet, die " +
            "verloren geht.",
        "remove-all.body": "Der Desktop dieses Browsers wird geleert. Jede App bleibt, wo " +
            "sie lebt — an keiner Herkunft wird etwas gelöscht.",
        "remove-all.data": "{n} davon haben hier {items} gespeichert. Das ist deine Arbeit, " +
            "sie bleibt erhalten, solange du nichts anderes sagst.",
        "remove-all.remove": "Alle entfernen",

        "store.rate": "GitHub bremst diesen Browser gerade für eine Minute aus.",
        "store.http": "GitHub antwortete mit {status}.",
        "store.unreachable": "GitHub war nicht erreichbar.",
        "store.loading": "Frage GitHub nach der Liste …",
        "store.empty": "Gerade sind keine Apps im Store.",
        "store.failed": "Die Liste konnte nicht geladen werden. {reason} Eine " +
            "Repository-URL einzufügen funktioniert weiterhin.",
        "store.install": "Installieren",
        "store.installed": "Installiert",

        "installer.title": "App installieren",
        "installer.read": "Manifest lesen",
        "installer.tab-url": "Per URL",
        "installer.tab-store": "App Store",
        "installer.paste": "Füge die Repository-URL der App ein — oder ihre app.json, " +
            "falls die woanders liegt.",
        "installer.url-label": "Repository-URL der App",
        "installer.scope": "Nur SACRVM-APPKIT-Apps — ein Repository, das eine app.json im " +
            "Stammverzeichnis seiner GitHub Pages ausliefert. Alles andere hat nichts zu lesen.",

        "settings.title": "Einstellungen",
        "settings.done": "Fertig",
        "settings.you": "Du",
        "settings.name": "Dein Name",
        "settings.picture": "Bild-URL (optional)",
        "settings.you-hint": "Apps können das lesen, um dich zu begrüßen und deinen Avatar " +
            "einzufärben. Es ist ein Name in diesem Browser, mehr nicht — kein Konto, kein " +
            "Passwort, nichts geprüft, und nichts verlässt dieses Gerät, außer eine App, " +
            "die du installiert hast, schickt es weg.",
        "settings.theme": "Design",
        "settings.language": "Sprache",
        "settings.this-desktop": "Dieser Desktop",
        "settings.this-desktop-hint": "Deine Apps und diese Einstellungen liegen in diesem " +
            "Browser, auf diesem Gerät. Niemand sonst sieht sie, und es gibt kein Konto, " +
            "mit dem du sie verlieren könntest.",
        "settings.remove-all": "Alle Apps entfernen",
        "settings.clear-files": "Deine Dateien löschen",
        "settings.clear-orphans": "Übrige Daten löschen",

        "orphans.line-one": "{size} Daten gehören zu 1 App, die nicht auf diesem Desktop " +
            "ist ({ids}).",
        "orphans.line": "{size} Daten gehören zu {n} Apps, die nicht auf diesem Desktop " +
            "sind ({ids}).",
        "orphans.line-tail": "Eine Neuinstallation übernimmt sie wieder — hier gelöscht, " +
            "sind sie endgültig weg.",
        "orphans.title": "Übrige Daten löschen?",
        "orphans.body": "Alles, was {ids} in diesem Browser gespeichert hat, wird gelöscht. " +
            "Die Apps sind schon nicht mehr auf diesem Desktop; das ist ihre Arbeit.\n\n" +
            "Das lässt sich nicht rückgängig machen.",

        "files.line": "Deine Dateien — woraus Apps öffnen und wohin sie speichern — liegen " +
            "auch hier: {data}, gemeinsam für alle Apps auf diesem Desktop.",
        "files.empty": "Dateien, die du aus einer App speicherst, landen auch hier, in " +
            "einem Bereich, den alle Apps auf diesem Desktop teilen. Noch ist nichts " +
            "gespeichert.",
        "files.title": "Deine Dateien löschen?",
        "files.body": "Die {data}, aus denen alle Apps auf diesem Desktop öffnen und in die " +
            "sie speichern, werden aus diesem Browser gelöscht. Dateien, die du stattdessen " +
            "auf diesem Gerät gespeichert hast, bleiben unberührt.\n\n" +
            "Das lässt sich nicht rückgängig machen.",

        "about.description": "Ein Desktop, den du selbst füllst — jede App darauf kommt " +
            "aus dem Repository von jemand anderem.",
        "about.yours-title": "Deiner, in diesem Browser",
        "about.yours": "Apps, Einstellungen und die Dateien, die du speicherst, liegen im " +
            "Speicher dieses Browsers — es gibt keinen Server und kein Konto. Wer diese " +
            "Adresse sonst besucht, sieht einen leeren Desktop.",
        "about.url-title": "Installieren heißt, sich eine URL zu merken",
        "about.url": "Der Desktop liest das Manifest der App von der Adresse, die du " +
            "einfügst — ein Abruf, keine Ausführung — und zeigt, was drinsteht, bevor du " +
            "bestätigst. Der Code der App lädt erst, wenn du sie zum ersten Mal öffnest, " +
            "und eine App zu entfernen vergisst die Adresse wieder.",
        "about.trust-title": "Was eine App darf",
        "about.trust": "Eine installierte App führt ihren eigenen Code in dieser Seite aus. " +
            "Installiere, was du vertraust, so wie bei einer Browser-Erweiterung — genau " +
            "deshalb steht die Herkunft auf jeder Kachel.",
        "about.built-title": "Gebaut mit",
        "about.built": "SACRVM APPKIT, MIT — unverändert in diesem Repository mitgeliefert; " +
            "kit/VERSION nennt die Version. Die Hinweise zu Drittanbietern liegen im " +
            "Appkit-Repository.",
        "about.more": "Die lange Version — wie das hier funktioniert, ausführlich",

        "host.palette": "Apps & Befehle — {key}",
        "host.about": "Über SACRVM DESKTOP",
        "host.you": "Du: {name} · Einstellungen",

        "palette.open": "{name} öffnen",
    };

    const prefixed = (table) => Object.fromEntries(
        Object.entries(table).map(([k, v]) => ["desktop." + k, v]));

    window.desktopStrings = { de: prefixed(de) };
})();

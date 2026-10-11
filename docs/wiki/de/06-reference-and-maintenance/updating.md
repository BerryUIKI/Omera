# Omera aktualisieren

Omera kann nach Veröffentlichungen suchen und ein geprüftes Installationspaket herunterladen. Die Installation erfordert Ihre Aktion; die Schritte hängen vom Betriebssystem ab.

## Nach Updates suchen

Wählen Sie **Hilfe > Nach Updates suchen**. Die Prüfung beim Start lässt sich unter **Einstellungen > Allgemein** umschalten. Lesen Sie vor der Installation die Versionshinweise.

## Herunterladen und installieren

1. Wählen Sie den automatischen Download, um das Paket aus der offiziellen GitHub-Veröffentlichung zu laden.
2. Omera prüft die Signatur vor dem Angebot zur Installation und erneut vor dem Start des Installationsprogramms. Ein Fehler erlaubt keine Installation.
3. Unter Windows kann der EXE-Installer die gewählte stille Installation verwenden. Unter macOS öffnet Omera das geprüfte DMG; schließen Sie die Installation ab und öffnen Sie Omera erneut. Unter Linux wird ein AppImage gestartet; DEB/RPM-Pakete benötigen den Paketmanager. Ein automatischer Neustart ist nicht auf jeder Plattform garantiert.

Fehlen die Vertrauenskonfiguration oder die Signatur, oder schlägt die Prüfung fehl, öffnen Sie mit **Im Browser herunterladen** oder **GitHub Releases** die [offizielle Release-Seite](https://github.com/BerryUIKI/Omera/releases). Wählen Sie das Paket für Ihr Betriebssystem und Ihre Architektur und installieren Sie es nach dessen Anleitung. Deaktivieren Sie die Prüfung nicht und verwenden Sie keine nicht vertrauenswürdigen Spiegelserver. Ältere Builds ohne Update-Vertrauen benötigen zunächst ein manuelles Upgrade auf einen vertrauenswürdigen Build.

## Bibliothek behalten

Programmdateien und Benutzerdaten werden getrennt gespeichert. Halten Sie vor einem Upgrade eine aktuelle Datenbanksicherung vor und bewahren Sie Originalmedien und Einstellungen auf. Schemamigrationen beim Start werden nur ergänzt; vor Version 1.0 bleiben Erkennung und Import älterer Daten unterstützt. Löschen Sie beim Upgrade keine Anwendungsdaten oder ursprünglichen Altdaten.

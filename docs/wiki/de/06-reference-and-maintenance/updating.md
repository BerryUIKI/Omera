# Omera aktualisieren

Omera kann nach Veröffentlichungen suchen und ein geprüftes Installationspaket herunterladen. Die Installation erfordert Ihre Aktion; die Schritte hängen vom Betriebssystem ab.

## Nach Updates suchen

Wählen Sie **Hilfe > Nach Updates suchen**. Die Prüfung beim Start lässt sich unter **Einstellungen > Allgemein** umschalten. Lesen Sie vor der Installation die Versionshinweise.

## Herunterladen und installieren

1. Wählen Sie unter Windows **Jetzt aktualisieren**, um das Update mit einem Klick herunterzuladen und zu installieren. Die stille Installation lässt sich vorher auswählen. Unter macOS/Linux wählen Sie zuerst **Update herunterladen**.
2. Omera prüft das heruntergeladene Paket und seine Signatur erneut vor dem Start des Installationsprogramms. Schlägt die Prüfung fehl, wird nicht installiert. Bei einem Startfehler können Sie das heruntergeladene Paket erneut verwenden.
3. Windows aktualisiert die vorhandene Anwendung ohne separaten Deinstallationsschritt und öffnet Omera nach Erfolg erneut. Unter macOS öffnen Sie über die Installationsaktion das geprüfte DMG, schließen die Installation ab und öffnen Omera erneut. Unter Linux startet die Installationsaktion ein AppImage; DEB/RPM-Pakete benötigen den Paketmanager. Unter macOS/Linux ist ein automatischer Neustart nicht garantiert.

Fehlen die Vertrauenskonfiguration oder die Signatur, oder schlägt die Prüfung fehl, öffnen Sie mit **Im Browser herunterladen** oder **GitHub Releases** die [offizielle Release-Seite](https://github.com/BerryUIKI/Omera/releases). Wählen Sie das Paket für Ihr Betriebssystem und Ihre Architektur und installieren Sie es nach dessen Anleitung. Deaktivieren Sie die Prüfung nicht und verwenden Sie keine nicht vertrauenswürdigen Spiegelserver. Ältere Builds ohne Update-Vertrauen benötigen zunächst ein manuelles Upgrade auf einen vertrauenswürdigen Build.

## Bibliothek behalten

Programmdateien und Benutzerdaten werden getrennt gespeichert. Halten Sie vor einem Upgrade eine aktuelle Datenbanksicherung vor und bewahren Sie Originalmedien und Einstellungen auf. Schemamigrationen beim Start werden nur ergänzt; vor Version 1.0 bleiben Erkennung und Import älterer Daten unterstützt. Löschen Sie beim Upgrade keine Anwendungsdaten oder ursprünglichen Altdaten.

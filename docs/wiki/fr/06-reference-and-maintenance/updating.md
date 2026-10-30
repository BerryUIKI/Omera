# Mettre Omera à jour

Omera peut rechercher les nouvelles versions et télécharger un programme d’installation vérifié. L’installation demande une action de votre part ; les étapes dépendent du système d’exploitation.

## Rechercher les mises à jour

Choisissez **Aide > Rechercher les mises à jour**. La vérification au démarrage se règle dans **Préférences > Général**. Lisez les notes de version avant l’installation.

## Télécharger et installer

1. Sous Windows, choisissez **Mettre à jour maintenant** pour télécharger et installer la mise à jour en un clic. Vous pouvez choisir l’installation silencieuse avant de commencer. Sous macOS/Linux, choisissez d’abord **Télécharger la mise à jour**.
2. Omera vérifie le paquet téléchargé, puis vérifie à nouveau sa signature avant de lancer l’installateur. Un échec de vérification bloque l’installation ; un échec de lancement permet de réessayer avec le paquet téléchargé.
3. Windows met à jour l’application existante sans étape de désinstallation séparée et rouvre Omera après réussite. Sous macOS, utilisez l’action d’installation pour ouvrir le DMG vérifié, terminez l’installation puis rouvrez Omera. Sous Linux, l’action d’installation lance un AppImage ; les paquets DEB/RPM nécessitent le gestionnaire de paquets. Le redémarrage automatique n’est pas garanti sous macOS/Linux.

Si la configuration de confiance ou la signature manque, ou si la vérification échoue, utilisez **Télécharger dans le navigateur** ou **GitHub Releases** pour ouvrir la [page officielle des versions](https://github.com/BerryUIKI/Omera/releases). Choisissez le paquet adapté au système et à l’architecture, puis suivez ses instructions d’installation manuelle. Ne désactivez pas la vérification et n’utilisez pas de miroir non fiable. Les anciennes versions sans configuration de confiance nécessitent une première mise à niveau manuelle vers une version de confiance.

## Conserver la bibliothèque

Les fichiers du programme et les données personnelles sont stockés séparément. Conservez une sauvegarde récente de la base avant la mise à niveau, ainsi que les médias originaux et les paramètres. Les migrations de schéma au démarrage sont ajoutées sans modifier les migrations appliquées. Avant la version 1.0, la détection et l’import des anciennes données restent pris en charge. Ne supprimez pas les données de l’application ou les sources anciennes pendant la mise à niveau.

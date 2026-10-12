# Sauvegarde d'instantanés Cloud & Miroir multimédia

Omera intègre un moteur de sauvegarde cloud et de synchronisation différentielle delta (`src-tauri/src/cloud_backup.rs` et `src-tauri/src/cloud_sync.rs`) qui permet des sauvegardes automatisées de base de données et la mise en miroir incrémentielle des fichiers médias distants, sans recourir à des outils tiers.

---

## 1. Fournisseurs de stockage pris en charge

Configurez vos points de terminaison distants dans **Préférences > Sauvegarde Cloud** :

| Fournisseur | Protocoles & Points de terminaison pris en charge | Remarques |
| :--- | :--- | :--- |
| **AWS S3 / Compatible** | AWS S3, Cloudflare R2, MinIO, Backblaze B2, Wasabi | Authentification native en Rust avec AWS Signature Version 4 (SigV4) signée en HMAC-SHA256. |
| **WebDAV** | Nextcloud, ownCloud, Synology DiskStation, QNAP NAS | Authentification HTTP Basic standard sur HTTPS. |
| **Chemin local / Réseau** | Disque local, SSD externe USB, partages réseau SMB / NFS | Entrées/sorties directes haute performance sur le système de fichiers sans surcharge protocolaire réseau. |

---

## 2. Instantanés de la base de données

Les instantanés contiennent `omera.db` et `manifest.json`, avec les données de bibliothèque, étiquettes et notes. Médias, paramètres et identifiants sont exclus. Configurez une destination dans **Paramètres > Cloud et sauvegarde**, puis choisissez **Créer un instantané maintenant**. Les noms sont uniques ; la publication locale est atomique. Aucune sauvegarde existante n’est supprimée automatiquement.

### Sauvegardes automatiques

Par défaut : **désactivées**, intervalle de **sept jours**. Activez, choisissez **1–365 jours**, puis **Enregistrer les préférences**. Annuler et un échec d’enregistrement conservent la planification enregistrée. Omera vérifie toutes les 30 secondes lorsqu’il fonctionne ; la première tentative commence à la prochaine vérification. L’intervalle suivant commence après une sauvegarde réussie. Fermer Omera arrête la planification. Désactiver arrête les futures tentatives ; celle en cours peut se terminer.

**Planification enregistrée** affiche séparément des modifications le statut, le dernier succès/essai, la prochaine date, l’archive et l’erreur. Un échec ou une interruption impose **une heure** d’attente, même après redémarrage. Changer de destination crée une nouvelle planification ; changer uniquement les identifiants conserve les dates. Un état corrompu est préservé et suspend la planification jusqu’à réparation et redémarrage.

### Restauration

La restauration valide l’instantané et le prépare pour le prochain démarrage. Fermez et relancez Omera ; actualiser la fenêtre ne suffit pas. La base actuelle est conservée dans `omera.pre-restore-<UUID>.db` avant l’activation transactionnelle. Les médias ou identifiants manquants ne sont pas restaurés.

---

## 3. Miroir multimédia incrémentiel & Synchronisation Delta (`cloud_sync.rs`)

Tandis que les instantanés sécurisent votre base de données, la **Synchronisation Delta** offre une mise en miroir unidirectionnelle par téléversement incrémentiel des fichiers physiques d'images et de vidéos depuis votre bibliothèque locale vers un stockage distant ou réseau.

### Fonctionnalités de synchronisation (Implémentées) :
- **Stratégies de détection des modifications** :
  - *Empreinte rapide* : Compare la taille du fichier local et celle du fichier distant via les métadonnées HTTP HEAD (la plus rapide, idéale pour les connexions modérées).
  - *Somme de contrôle stricte* : Calcule des sommes SHA-256 locales pour vérifier la conformité avec les en-têtes distants (`x-amz-meta-sha256` sur S3) octet par octet.
- **Limiteur de bande passante par seau de jetons** : Fixez un plafond de vitesse d'envoi (Ko/s) afin que la synchronisation d'arrière-plan ne sature pas la bande passante de votre studio.
- **Concurrence des workers** : Configurez le nombre de threads d'envoi simultanés (de 1 à 16 threads, 4 par défaut).
- **Mode simulation (Dry-Run)** : Simule l'exécution de la synchronisation et indique les fichiers à téléverser et à ignorer sans modifier le stockage distant.
- **Suivi de progression en temps réel** : Émet des événements réguliers indiquant les octets transférés, le débit, le pourcentage achevé et le temps estimé restant, avec annulation atomique coopérative.

### Limites actuelles et fonctionnalités prévues :
- **Téléversement unidirectionnel uniquement** : Le chemin de synchronisation actuel pousse les fichiers locaux indexés vers la cible distante. Le téléchargement/rapatriement de fichiers distants vers le stockage local n'est pas implémenté.
- **Aucune synchronisation des suppressions** : Supprimer un fichier localement ne supprime pas le fichier distant ; le stockage distant conserve les médias.
- **Aucune logique delta par ETag** : La détection s'appuie sur la taille et les en-têtes SHA-256 ; les ETag HTTP du fournisseur ne sont pas utilisés pour invalider le cache.
- **Synchronisation bidirectionnelle planifiée** : Une synchronisation bidirectionnelle complète avec détection des modifications distantes, réconciliation descendante et gestion des conflits est planifiée pour de futures versions.

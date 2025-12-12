# Configuration du Cron de synchronisation Agenda.ch

## 1. Copier le script sur le NAS

```bash
# Depuis votre Mac, copier le script vers le NAS
scp /Users/gregory/Dev/poge-employes/scripts/sync-agenda.js gregory@10.10.10.140:/volume1/scripts/
```

## 2. Se connecter au NAS

```bash
ssh gregory@10.10.10.140
```

## 3. Installer les dépendances (une seule fois)

```bash
cd /volume1/scripts
npm init -y
npm install mysql2
```

## 4. Tester le script manuellement

```bash
cd /volume1/scripts
node sync-agenda.js --appointments
```

## 5. Configurer le Cron (toutes les 5 minutes)

### Option A : Via l'interface Synology DSM

1. Ouvrir **Panneau de configuration** → **Planificateur de tâches**
2. Créer → **Tâche planifiée** → **Script défini par l'utilisateur**
3. Configurer :
   - Nom : `Sync Agenda.ch`
   - Utilisateur : `root` ou votre utilisateur
   - Planification : Toutes les 5 minutes
   - Script :
     ```bash
     cd /volume1/scripts && /usr/local/bin/node sync-agenda.js --appointments >> /volume1/scripts/sync.log 2>&1
     ```

### Option B : Via crontab (SSH)

```bash
# Éditer le crontab
crontab -e

# Ajouter cette ligne (toutes les 5 minutes)
*/5 * * * * cd /volume1/scripts && /usr/local/bin/node sync-agenda.js --appointments >> /volume1/scripts/sync.log 2>&1
```

## 6. Vérifier les logs

```bash
tail -f /volume1/scripts/sync.log
```

## 7. Vérifier que ça fonctionne

```sql
-- Depuis n'importe quelle app, vérifier la dernière sync
SELECT * FROM poge_agenda.agenda_sync_log ORDER BY finished_at DESC LIMIT 5;
```

---

## Variables d'environnement (optionnel)

Si vous voulez externaliser la config, créez `/volume1/scripts/.env` :

```bash
AGENDA_API_TOKEN=b3a1f075-a36f-4a23-a3f9-dc7374544a30
DB_HOST=10.10.10.140
DB_USER=poge_user
DB_PASSWORD=Griotte24!@#
DB_NAME=poge_agenda
```

Et modifiez le script pour utiliser `dotenv`.

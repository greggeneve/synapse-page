#!/bin/bash
# Script de synchronisation Agenda.ch pour cron
# Exécution toutes les 5 minutes

SCRIPT_DIR="/volume1/Dev/poge-employes/scripts"
LOG_DIR="/volume1/Dev/logs"
LOG_FILE="$LOG_DIR/sync-agenda.log"

# Créer le dossier de logs si nécessaire
mkdir -p "$LOG_DIR"

# Rotation des logs (garder max 10MB)
if [ -f "$LOG_FILE" ] && [ $(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null) -gt 10485760 ]; then
    mv "$LOG_FILE" "$LOG_FILE.old"
fi

# Exécution de la sync
echo "=== $(date '+%Y-%m-%d %H:%M:%S') ===" >> "$LOG_FILE"
cd "$SCRIPT_DIR"
/usr/local/bin/node sync-agenda.js --all >> "$LOG_FILE" 2>&1
echo "" >> "$LOG_FILE"

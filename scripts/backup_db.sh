#!/bin/bash
# Script de respaldo automático para la base de datos de Solaris Control

BACKUP_DIR="/home/jhonclavijotro/solar_farm_backups"
DATA_DB="/home/jhonclavijotro/control_mods/data/solar_farm.db"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/solar_farm_${TIMESTAMP}.db"

mkdir -p "${BACKUP_DIR}"

if [ -f "${DATA_DB}" ]; then
    # Use sqlite3 .backup if available, or cp
    if command -v sqlite3 >/dev/null 2>&1; then
        sqlite3 "${DATA_DB}" ".backup '${BACKUP_FILE}'"
    else
        cp "${DATA_DB}" "${BACKUP_FILE}"
    fi
    echo "[$(date)] Respaldo de la base de datos completado exitosamente: ${BACKUP_FILE}"
    
    # Keep only the last 30 daily backups
    find "${BACKUP_DIR}" -name "solar_farm_*.db" -type f -mtime +30 -delete
else
    echo "[$(date)] Error: No se encontró la base de datos en ${DATA_DB}"
fi

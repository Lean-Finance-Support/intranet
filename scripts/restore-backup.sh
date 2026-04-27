#!/usr/bin/env bash
#
# Restaura un backup cifrado de R2 en una base de datos PostgreSQL.
#
# Uso:
#   ./scripts/restore-backup.sh <fecha-iso> <connection-string-destino>
#
# Ejemplo:
#   ./scripts/restore-backup.sh 2026-04-27 'postgresql://postgres:PASS@db.xxxx.supabase.co:5432/postgres'
#
# Variables de entorno requeridas:
#   R2_ACCESS_KEY_ID
#   R2_SECRET_ACCESS_KEY
#   R2_ENDPOINT
#   R2_BUCKET
#   BACKUP_GPG_PASSPHRASE
#
# Requiere instalado: aws-cli, gpg, pg_restore (>= v17).

set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Uso: $0 <fecha-iso> <connection-string-destino>"
  echo "Ejemplo: $0 2026-04-27 'postgresql://...'"
  exit 1
fi

DATE="$1"
TARGET_DB="$2"
PREFIX="${3:-daily}"

: "${R2_ACCESS_KEY_ID:?falta R2_ACCESS_KEY_ID}"
: "${R2_SECRET_ACCESS_KEY:?falta R2_SECRET_ACCESS_KEY}"
: "${R2_ENDPOINT:?falta R2_ENDPOINT}"
: "${R2_BUCKET:?falta R2_BUCKET}"
: "${BACKUP_GPG_PASSPHRASE:?falta BACKUP_GPG_PASSPHRASE}"

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

KEY="${PREFIX}/${DATE}.dump.gpg"
echo "==> Descargando s3://${R2_BUCKET}/${KEY}"
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
AWS_DEFAULT_REGION=auto \
AWS_EC2_METADATA_DISABLED=true \
  aws s3 cp "s3://${R2_BUCKET}/${KEY}" "${WORKDIR}/backup.dump.gpg" \
    --endpoint-url "$R2_ENDPOINT"

echo "==> Descifrando"
gpg --batch --yes \
  --passphrase "$BACKUP_GPG_PASSPHRASE" \
  -o "${WORKDIR}/backup.dump" \
  -d "${WORKDIR}/backup.dump.gpg"

echo "==> Verificando contenido del dump"
pg_restore --list "${WORKDIR}/backup.dump" | head -n 30
echo "..."
echo "Total entradas: $(pg_restore --list "${WORKDIR}/backup.dump" | wc -l)"

echo
read -r -p "¿Restaurar en el destino indicado? (escribe 'si' para continuar): " CONFIRM
if [ "$CONFIRM" != "si" ]; then
  echo "Cancelado."
  exit 1
fi

echo "==> Restaurando en destino"
pg_restore --no-owner --no-acl --clean --if-exists \
  --schema=public \
  -d "$TARGET_DB" \
  "${WORKDIR}/backup.dump"

echo "==> Hecho."
echo "NOTA: solo se ha restaurado el schema 'public'."
echo "Para auth/storage, edita este script o usa pg_restore manualmente."

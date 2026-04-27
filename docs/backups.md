# Backups de la base de datos

## Resumen

- **Frecuencia:** diaria a las 03:00 UTC.
- **Origen:** proyecto Supabase prod (`wgxugccbatusioubnsfl`), schemas `public` + `auth` + `storage`.
- **Cifrado:** GPG simétrico AES-256.
- **Destino:** Cloudflare R2, bucket `leanfinance-db-backups`.
- **Retención:** 30 días los diarios (`daily/`), 180 días los del día 1 de cada mes (`monthly/`).
- **Verificación:** restore semanal en contenedor Postgres efímero (`.github/workflows/backup-restore-test.yml`).

## Ubicación de los secretos

- GitHub Actions secrets del repo `Lean-Finance-Support/intranet`:
  - `SUPABASE_DB_URL` — connection string de prod (Session mode, puerto 5432).
  - `BACKUP_GPG_PASSPHRASE` — passphrase de cifrado.
  - `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET`.
- Copia de la passphrase: gestor de contraseñas personal **y** del responsable técnico de LeanFinance.
- **Sin la passphrase los backups son irrecuperables.**

## Restaurar un backup

### Opción A: en local con el script

Requiere `aws-cli`, `gpg` y `pg_restore` >= 17 instalados.

```bash
export R2_ACCESS_KEY_ID=...
export R2_SECRET_ACCESS_KEY=...
export R2_ENDPOINT=https://<accountid>.eu.r2.cloudflarestorage.com
export R2_BUCKET=leanfinance-db-backups
export BACKUP_GPG_PASSPHRASE=...

./scripts/restore-backup.sh 2026-04-27 'postgresql://postgres:PASS@db.<ref>.supabase.co:5432/postgres'
```

El script restaura solo el schema `public`. Para `auth`/`storage` edita el flag `--schema`.

### Opción B: paso a paso manual

```bash
# 1. Descargar
aws s3 cp s3://leanfinance-db-backups/daily/2026-04-27.dump.gpg . \
  --endpoint-url "$R2_ENDPOINT"

# 2. Descifrar
gpg --batch --passphrase "$BACKUP_GPG_PASSPHRASE" \
  -o backup.dump -d 2026-04-27.dump.gpg

# 3. Inspeccionar contenido sin restaurar
pg_restore --list backup.dump | less

# 4. Restaurar (cuidado, --clean borra objetos existentes)
pg_restore --no-owner --no-acl --clean --if-exists \
  --schema=public \
  -d "$TARGET_DB_URL" \
  backup.dump
```

## Restaurar en una emergencia real

1. **No hagas nada en prod todavía.** Confirma el alcance del problema.
2. Si la BD prod sigue accesible: descarga el backup más reciente y restáuralo en un proyecto Supabase **nuevo** primero, valida los datos, y luego decide qué hacer con prod.
3. Si la BD prod no existe: crea un proyecto Supabase nuevo, aplica las migraciones de `supabase/migrations/`, y luego restaura el backup encima.
4. Tras restaurar, recordar:
   - Volver a configurar `public.app_settings` (URL del proyecto + `webhook_secret`).
   - Re-deploy de las edge functions con `supabase functions deploy ...`.
   - Volver a setear los secretos de las edge functions con `supabase secrets set ...`.
   - Revisar que los triggers de `pg_net` estén activos.

## Comprobar el estado

- Workflow diario: <https://github.com/Lean-Finance-Support/intranet/actions/workflows/backup-db.yml>
- Workflow de verificación semanal: <https://github.com/Lean-Finance-Support/intranet/actions/workflows/backup-restore-test.yml>
- Listar backups: `aws s3 ls s3://leanfinance-db-backups/daily/ --endpoint-url "$R2_ENDPOINT"`

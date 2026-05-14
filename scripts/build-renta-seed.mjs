#!/usr/bin/env node
// Genera la migración seed de renta.deductions a partir de los archivos
// supabase/seeds/renta/deductions/*.json.
//
// Uso:
//   node scripts/build-renta-seed.mjs
//
// Reescribe supabase/migrations/20260514110100_renta_seed_deductions.sql
// embebiendo todos los JSON en un único literal jsonb.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const SEEDS_DIR = join(ROOT, "supabase/seeds/renta/deductions");
const MIGRATION_PATH = join(
  ROOT,
  "supabase/migrations/20260514110100_renta_seed_deductions.sql",
);

const files = readdirSync(SEEDS_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

const allDeductions = [];
const summary = {};
for (const file of files) {
  const ccaa = file.replace(".json", "");
  const raw = readFileSync(join(SEEDS_DIR, file), "utf8");
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr)) {
    console.error(`[WARN] ${file} no es un array, ignorado.`);
    continue;
  }
  summary[ccaa] = arr.length;
  for (const d of arr) {
    allDeductions.push(d);
  }
}

// Validar IDs únicos.
const seen = new Set();
for (const d of allDeductions) {
  if (seen.has(d.id)) {
    console.error(`[ERROR] id duplicado: ${d.id}`);
    process.exit(1);
  }
  seen.add(d.id);
}

console.error(`[build-renta-seed] ${allDeductions.length} deducciones de ${Object.keys(summary).length} CCAA`);
for (const [ccaa, count] of Object.entries(summary)) {
  console.error(`  ${ccaa}: ${count}`);
}

// JSON serializado y escapado para PostgreSQL string literal.
const jsonLiteral = JSON.stringify(allDeductions).replaceAll("'", "''");

const sql = `-- Seed del catálogo de deducciones autonómicas.
--
-- Carga las deducciones del manual "Renta 2025 — Parte 2" de la AEAT.
-- Origen: archivos supabase/seeds/renta/deductions/<CCAA>.json (extraídos del
-- PDF oficial). Para regenerar esta migración tras editar los JSON, ejecuta:
--
--     node scripts/build-renta-seed.mjs
--
-- NOTAS:
-- - Navarra y País Vasco NO están: tienen régimen foral propio (no aparecen
--   en el manual de la AEAT).
-- - Para deducciones con fórmulas de cálculo complejas (% sobre cuota,
--   prorrateos, etc.) solo se encoda el gate básico de elegibilidad; el
--   importe lo calcula el asesor revisando la submission.
-- - Total deducciones cargadas: ${allDeductions.length} en ${Object.keys(summary).length} CCAA.

-- Idempotencia: TRUNCATE garantiza que deducciones eliminadas del manual
-- desaparezcan de la BD al re-ejecutar el seed.
TRUNCATE TABLE renta.deductions;

INSERT INTO renta.deductions (
  id, ccaa_code, title, what_covers, requirements, legal_reference,
  eligibility_rule, extra_fields, display_order, is_active
)
SELECT
  (row->>'id')::text,
  (row->>'ccaa_code')::text,
  (row->>'title')::text,
  (row->>'what_covers')::text,
  COALESCE(row->'requirements', '[]'::jsonb),
  (row->>'legal_reference')::text,
  COALESCE(row->'eligibility_rule', '{"all_of":[]}'::jsonb),
  COALESCE(row->'extra_fields', '[]'::jsonb),
  COALESCE((row->>'display_order')::int, 0),
  COALESCE((row->>'is_active')::boolean, true)
FROM jsonb_array_elements('${jsonLiteral}'::jsonb) AS row;
`;

writeFileSync(MIGRATION_PATH, sql, "utf8");
console.error(`[build-renta-seed] Escrita ${MIGRATION_PATH}`);


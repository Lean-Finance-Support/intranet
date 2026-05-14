-- Placeholder / no-op.
--
-- Esta migración originalmente cargaba el catálogo de deducciones contra el
-- esquema antiguo (columna `summary`). Posteriormente:
--   - 20260514130000_renta_split_summary.sql: dropea `summary` y añade
--     `what_covers` + `requirements`.
--   - 20260514140000_renta_reseed_deductions.sql: TRUNCATE + INSERT con el
--     catálogo en su forma final.
--
-- Se mantiene el archivo (con contenido neutro) porque en entornos donde ya
-- estaba aplicada cambiar su contenido no la re-ejecuta — el control de
-- Supabase es por timestamp del nombre, no por hash. Pero en entornos fresh
-- el archivo SÍ se aplica en orden, así que NO puede referenciar columnas
-- que se añaden más tarde. El verdadero seed lo hace 20260514140000.

SELECT 1;

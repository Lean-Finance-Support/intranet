# Seeds del schema `renta`

Catálogo data-driven de deducciones autonómicas del IRPF. Los archivos
`deductions/<ES-XX>.json` los carga la migración
`20260514110100_renta_seed_deductions.sql` con `INSERT … ON CONFLICT (id) DO UPDATE`.

## Esquema de cada entry

Cada archivo es un array de objetos con esta forma exacta (los campos extra los
ignora la migración):

```json
{
  "id": "mad-alquiler-joven",
  "ccaa_code": "ES-MD",
  "title": "Deducción por arrendamiento de la vivienda habitual",
  "summary": "Inquilino menor de 35 años con base liquidable limitada.",
  "legal_reference": "Art. 4 Ley 4/2024 de la Comunidad de Madrid",
  "eligibility_rule": {
    "all_of": [
      { "op": "eq", "path": "ccaa", "value": "ES-MD" },
      { "op": "eq", "path": "housing.type", "value": "alquiler" },
      { "op": "age_lt", "path": "birth_date", "value": 35 },
      { "op": "lte", "path": "income_base", "value": 25620 }
    ]
  },
  "extra_fields": [
    { "key": "annual_rent_eur", "label": "Renta anual pagada (€)", "kind": "number", "required": true, "min": 0 },
    { "key": "landlord_nif", "label": "NIF del arrendador", "kind": "text", "required": false },
    { "key": "property_reference", "label": "Referencia catastral del inmueble", "kind": "text", "required": false }
  ],
  "display_order": 10,
  "is_active": true
}
```

## Operadores soportados por `eligibility_rule`

Ver `lib/renta/rule-engine.ts`. Resumen:

- Composición: `{ "all_of": [...] }`, `{ "any_of": [...] }`, `{ "not": {...} }`.
- Comparaciones: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `between`, `truthy`.
- Edad del declarante (sobre `birth_date`): `age_gte`, `age_lt`. Ejemplo:
  `{ "op": "age_lt", "path": "birth_date", "value": 35 }`.
- Hijos: `any_kid_age_lt`, `any_kid_age_between`. Ejemplo:
  `{ "op": "any_kid_age_lt", "value": 3 }`.
- Paths útiles: `ccaa`, `birth_date`, `civil_status`, `kids.length`,
  `housing.type`, `housing.monthly_rent_eur`, `disability_pct`,
  `income_base`, `monoparental`, `large_family`, `municipality`,
  `small_municipality`, `declaration_mode`.

## Tipos de `extra_fields[].kind`

`text` · `number` · `date` · `boolean` · `select` · `textarea`.

`select` requiere `options: [{ value, label }]`.

## Convención de `id`

`<prefix-ccaa>-<slug-deduccion>`. Prefijos:

| CCAA               | Prefijo |
|--------------------|---------|
| Andalucía          | `and`   |
| Aragón             | `arg`   |
| Asturias           | `ast`   |
| Illes Balears      | `bal`   |
| Canarias           | `can`   |
| Cantabria          | `ctb`   |
| Castilla-La Mancha | `clm`   |
| Castilla y León    | `cyl`   |
| Cataluña           | `cat`   |
| Extremadura        | `ext`   |
| Galicia            | `gal`   |
| Comunidad de Madrid| `mad`   |
| Región de Murcia   | `mur`   |
| Navarra            | `nav`   |
| País Vasco         | `pvc`   |
| La Rioja           | `rio`   |
| Comunitat Valenciana| `val`  |

## Aplicar a BD

```bash
supabase db push  # aplica todas las migraciones nuevas, incluida la seed
```

# Respaldos ventas_* — 2026-07-03

Export de las 4 tablas `ventas_*` del proyecto Supabase `nxyhgbrretusqbgfodmo`
tomado inmediatamente antes de eliminarlas de ese proyecto
(migración `supabase/migrations/20260703200000_drop_ventas_tables.sql`).

Motivo: el módulo de ventas ya fue migrado a otro proyecto Supabase; aquí las
tablas quedaron huérfanas y expuestas al público (política RLS `ALL/public/true`
+ anon key publicada en el `index.html`). Se conservan estos CSV como red de
seguridad por si hiciera falta recuperar algún dato.

| Archivo | Tabla origen | Filas |
|---|---|---|
| `ventas_talentos_2026-07-03.csv` | `public.ventas_talentos` | 52 |
| `ventas_clientes_2026-07-03.csv` | `public.ventas_clientes` | 873 |
| `ventas_pms_2026-07-03.csv` | `public.ventas_pms` | 10 |
| `ventas_acciones_2026-07-03.csv` | `public.ventas_acciones` | 1007 |

Formato: CSV UTF-8 con header (todas las columnas). `null` → celda vacía;
columnas array (`categorias text[]`) serializadas como JSON dentro de la celda.

⚠️ Contienen datos de contacto (nombres, emails, teléfonos). Repo privado;
no publicar.

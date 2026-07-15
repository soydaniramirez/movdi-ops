# Onboarding — alta de una persona nueva en MOVDI·ops

Guía para dirección. Escrita a raíz del incidente del 2026-07-15 (Valeria y
Alfredo, ver "Qué salió mal" abajo): dos altas quedaron a medias y su primera
petición murió con `new row violates row-level security policy`.

## El modelo en una línea

Una persona funcional necesita **dos registros ligados**: su fila en
`personas` (nombre, nivel, áreas, manager) y su cuenta en Supabase Auth,
unidas por `personas.auth_user_id`. Ese vínculo alimenta `mi_nombre()`, la
función sobre la que descansa **toda** la RLS de escritura: sin él, la
persona puede ver la app (las lecturas van por email) pero no puede crear
ni editar nada.

## Flujo correcto (todo automático)

1. Entrar a **equipo → agregar persona** (solo dirección) y llenar el
   formulario completo:
   - **nombre / apellido / rol** — el `nombre` es la identidad operativa
     (aparece en `creado_por`, `para`, notificaciones). Debe ser único y no
     se cambia a la ligera.
   - **email** — al que llega la invitación. Se normaliza a minúsculas.
   - **área** — para peticiones por área y los formularios dinámicos.
     Nivel `rh` agrega el área `rh` automáticamente.
   - **nivel** — `ejecutivo` / `head` / `rh` / `ceo`. Controla pestañas y RLS.
   - **manager principal (+ apoyos)** — la relación del semáforo y de la
     visibilidad de equipos (qué ve su head). Para Digital hoy el manager
     principal es Dani.
2. Al guardar, la Server Action hace las tres cosas en cadena:
   - inserta la fila en `personas`,
   - invita el email a Auth (`inviteUserByEmail`, service_role solo aquí),
   - **liga `auth_user_id` de inmediato** con el id que devolvió el invite.
3. La persona recibe el correo, define su contraseña y entra. Listo — no hay
   pasos manuales en el dashboard de Supabase.

## Redes de seguridad (si algo del paso 2 falla)

- **Autocuración en el primer login**: si `auth_user_id` quedó vacío (invite
  manual, email ya existente en Auth, fallo transitorio), el layout protegido
  lo liga solo al cargar cualquier página, usando la policy
  `personas_self_link` (solo la fila propia, solo si sigue vacía).
- **Aviso en la app**: si ni eso se pudo, la persona ve un banner
  "tu cuenta no está terminada de configurar — avisa a dirección" en todas
  las páginas, y al intentar crear una petición recibe ese mismo mensaje en
  lugar del error crudo de RLS.

## Verificación (SQL, opcional pero recomendada tras cada alta)

```sql
-- ¿quedó alguien activo sin vínculo o sin cuenta en Auth?
select p.nombre, p.apellido, p.email,
       (p.auth_user_id is null)          as sin_vinculo,
       (u.id is null)                    as sin_cuenta_auth
from personas p
left join auth.users u on lower(u.email) = lower(p.email)
where coalesce(p.activo, true)
  and (p.auth_user_id is null or u.id is null);
```

Debe devolver 0 filas. Si devuelve `sin_vinculo = true` y la cuenta de Auth
sí existe, la reparación manual es:

```sql
update personas p
   set auth_user_id = u.id
  from auth.users u
 where lower(u.email) = lower(p.email)
   and p.email = '<email de la persona>'
   and p.auth_user_id is null;
```

(Es idempotente y no puede pisar un vínculo existente por el
`auth_user_id is null`.)

## Casos especiales

- **El email ya tenía cuenta en Auth** (recontratación, invite manual
  previo): el alta avisa "ya tenía cuenta — no se envió invitación". El
  vínculo se hace solo en su primer login. Si quieres dejarlo listo antes,
  corre el UPDATE de arriba.
- **Cambio de email**: el vínculo NO se recalcula solo. Cambia el email en
  Auth (dashboard) y en `personas` al mismo tiempo; `auth_user_id` no se
  toca porque la cuenta es la misma.
- **Baja**: usar "desactivar" en equipo (reasigna pendientes vía RPC
  transaccional). No borrar filas de `personas`.

## Qué salió mal el 2026-07-15 (contexto)

Valeria y Alfredo fueron dados de alta el 7-14, ya con el switch a la app
Next hecho. El alta de entonces insertaba la fila e invitaba a Auth, pero el
vínculo `auth_user_id` solo se llenaba en el primer login **del index.html
legado** — la app Next no lo hacía en ningún lado. Resultado: entraron bien
(lecturas por email), pero `mi_nombre()` les devolvía NULL y su primera
petición murió en la policy `peticiones_insert`. Se repararon ambas filas a
mano y se agregaron el vínculo-en-el-alta, la autocuración del layout y los
avisos de UX descritos arriba.

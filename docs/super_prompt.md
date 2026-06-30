# SUPER PROMPT — `envio_masivo_email`

> App SaaS clínica para **diseñar plantillas HTML de correo y hacer envíos masivos
> personalizados** desde un Excel, con remitente `notificaciones@cacsantabarbara.co`
> vía Resend y estadísticas de entrega/apertura/clic. Cliente: Clínica CAC Santa Bárbara.
> Reusa el patrón estandarizado del skill `cac-fullstack-app`.

---

## 0. Decisiones cerradas (no volver a preguntar)

| Tema | Decisión |
|---|---|
| Stack | React 19 + Vite + TypeScript + Tailwind CSS v4 |
| Backend | Supabase (Postgres + Auth + RLS + Edge Functions) |
| Auth | Mismo modelo de proyectos previos; admin inicial `juan.etayo@cacsantabarbara.co` |
| Correo | Resend, remitente `notificaciones@cacsantabarbara.co` (dominio `cacsantabarbara.co` ya verificado) |
| Editor de plantillas | **Dos modos en pestañas:** (a) Visual drag&drop `react-email-editor` (Unlayer); (b) Texto enriquecido |
| Volumen por campaña | Hasta ~500 destinatarios → Resend **Batch API** (lotes de 100) |
| Estadísticas | Completas: enviado / entregado / abierto / clic / rebote vía **webhooks de Resend** |
| Personalización | Variables `{{columna}}` reemplazadas por columnas del Excel; `{{email}}` siempre disponible |
| Excel | SheetJS (cliente). 1ª columna = email destino; columnas restantes libres |
| Routing / Deploy | `HashRouter` + GitHub Pages (cuenta `juanetayo-projects`), repo `envio_masivo_email` |
| Branding | Azul `#0D2D6B` / contraste `#16468E`; logos `logo_cacsb2.png` y `logo_cacsb_blanc.png` |

**Decisiones de alcance v1 (cerradas):**
- **Supabase:** proyecto **nuevo dedicado** en la org de pago (~US$10/mes) → BD aislada para PII de correo.
- **Programación:** **envío inmediato** al confirmar la campaña (sin cron en v1).
- **Adjuntos:** **sí** — archivos (PDF, etc.) iguales para toda la campaña, almacenados en Supabase Storage.
- **Usuarios:** se crea **solo el admin** `juan.etayo@cacsantabarbara.co`; el resto se da de alta desde el módulo.

---

## 1. Objetivo y alcance

Aplicación interna que permita a usuarios autorizados:

1. Iniciar sesión (Auth + roles, admin = `juan.etayo@cacsantabarbara.co`).
2. **Diseñar plantillas** de correo en dos modos (visual Unlayer / texto enriquecido) y guardarlas.
3. **Exportar el HTML** de una plantilla (descarga `.html` + copiar al portapapeles) para pegar en Gmail.
4. **Importar un Excel** variable: 1ª columna = email, resto columnas libres → variables `{{...}}`.
5. **Crear y enviar campañas** que fusionan plantilla + filas del Excel, personalizadas por destinatario.
6. **Ver estadísticas** de cada campaña: enviados, entregados, aperturas, clics, rebotes.

Fuera de alcance v1: secuencias automáticas, A/B testing, programación diferida (se deja P2 en backlog).

---

## 2. Modelo de datos (Supabase / Postgres)

> Migraciones en `supabase/migrations/`. RLS activo en TODAS las tablas. PII fuera de git.

```sql
-- perfiles (patrón estándar auth-y-roles)
profiles (
  id uuid pk references auth.users,
  email text, nombre text,
  rol text check (rol in ('admin','editor')) default 'editor',
  created_at timestamptz default now()
)

-- plantillas reutilizables
plantillas (
  id uuid pk default gen_random_uuid(),
  nombre text not null,
  tipo text check (tipo in ('visual','texto')) not null,
  design_json jsonb,         -- diseño Unlayer (solo tipo 'visual'), para re-editar
  html text not null,        -- HTML final exportado/renderizado
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
)

-- campañas de envío
campanias (
  id uuid pk default gen_random_uuid(),
  nombre text not null,
  plantilla_id uuid references plantillas(id),
  asunto text not null,
  remitente_nombre text default 'CAC Santa Bárbara',
  adjuntos jsonb default '[]',   -- [{nombre, path_storage, mime, size}] iguales para toda la campaña
  total_destinatarios int default 0,
  estado text check (estado in ('borrador','enviando','enviada','error')) default 'borrador',
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  enviada_at timestamptz
)

-- un registro por destinatario (la unidad de tracking)
envios (
  id uuid pk default gen_random_uuid(),
  campania_id uuid references campanias(id) on delete cascade,
  email text not null,
  datos jsonb not null,      -- {columna: valor} de la fila del Excel para el merge
  resend_id text,            -- id devuelto por Resend (correlación con webhook)
  estado text check (estado in
    ('pendiente','enviado','entregado','abierto','clic','rebote','fallido')) default 'pendiente',
  error text,
  enviado_at timestamptz, entregado_at timestamptz,
  abierto_at timestamptz, clic_at timestamptz
)

-- log crudo de eventos del webhook (auditoría / depuración)
eventos_email (
  id uuid pk default gen_random_uuid(),
  envio_id uuid references envios(id) on delete cascade,
  resend_id text, tipo text, payload jsonb,
  created_at timestamptz default now()
)
```

Índices: `envios(campania_id)`, `envios(resend_id)`, `envios(estado)`.

**Storage:** bucket privado `adjuntos-campanias` para los archivos adjuntos.
La Edge Function los descarga con `service_role` y los pasa a Resend como
`attachments` (base64). Límite total del correo en Resend: ~40 MB.

**RLS:** usuarios autenticados leen/escriben plantillas, campañas y envíos
(app interna). Solo `admin` gestiona usuarios. La Edge Function de envío y el
webhook usan `service_role` (bypass RLS).

---

## 3. Edge Functions (Deno / Supabase)

### 3.1 `admin-usuarios`  *(reusar tal cual del skill)*
Alta / baja / reset de contraseña, solo-admin, con `service_role`.

### 3.2 `enviar-campania`
- **Input:** `{ campania_id }`. Auth: usuario autenticado.
- Lee `campanias` + `plantillas` + `envios` con `estado='pendiente'`.
- Para cada envío: hace **merge** de `{{variables}}` en `html` y `asunto` usando `datos`
  (escape HTML de los valores; variable faltante → cadena vacía + warning).
- Agrupa en **lotes de 100** y llama **Resend Batch API** (`POST /emails/batch`).
  - `from: "CAC Santa Bárbara <notificaciones@cacsantabarbara.co>"`
  - `headers: { "X-Entity-Ref-ID": <envio.id> }` para correlación, y `tags`.
  - **Adjuntos:** descarga los archivos de `campanias.adjuntos` desde Storage
    (`service_role`), los codifica base64 y los incluye en `attachments` de cada
    correo del lote (mismos archivos para toda la campaña).
  - Respeta rate-limit (2 req/s plan free → pausa entre lotes). Para 500 = 5 lotes.
- Guarda `resend_id` por envío, marca `estado='enviado'`/`enviado_at`, o `'fallido'`+`error`.
- Actualiza `campanias.estado` a `enviada` (o `error`) y `enviada_at`.
- **Idempotencia:** solo procesa `pendiente`, para poder reintentar fallidos.

### 3.3 `resend-webhook`
- **Input:** eventos de Resend (`email.sent`, `email.delivered`, `email.opened`,
  `email.clicked`, `email.bounced`, `email.complained`).
- **Verifica la firma** del webhook (Svix `webhook-signature` + signing secret).
- Mapea `data.email_id` → `envios.resend_id` (o `X-Entity-Ref-ID` → `envios.id`).
- Actualiza `estado` y el timestamp correspondiente; inserta en `eventos_email`.
- Config del endpoint y secret se hace en el panel de Resend (anotar en README).

**Secrets (Supabase):** `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`.

---

## 4. Frontend — páginas y componentes

Reusar `src/components/ui.tsx` (Card, FilterBar, Modal, CrudTable, PageHeader) y
`AuthProvider` del skill. Header azul con `logo_cacsb_blanc.png`.

1. **Login** — header azul institucional + recuperación de contraseña.
2. **Dashboard** — cards de métricas (degradado): campañas enviadas, correos
   totales, tasa de entrega, tasa de apertura, tasa de clic. Gráfico Recharts de
   envíos por mes.
3. **Plantillas** — lista (CrudTable) + editor con **dos pestañas**:
   - *Visual:* `react-email-editor` (`<EmailEditor/>`, `editor.exportHtml()` →
     guarda `html` + `design` JSON; al editar, `loadDesign(design_json)`).
   - *Texto enriquecido:* editor WYSIWYG (TipTap o React-Quill) → guarda `html`.
   - Botón **Exportar HTML** (descarga `.html` + “Copiar para Gmail”).
   - Panel lateral con las variables `{{...}}` disponibles e instrucción de uso.
4. **Nueva campaña (wizard 4 pasos):**
   1. Datos: nombre, asunto, elegir plantilla.
   2. Importar Excel (SheetJS `sheet_to_json`): valida que la 1ª columna sean
      emails válidos; muestra preview en tabla; lista columnas detectadas como
      variables; descarta filas sin email.
   3. **Adjuntos (opcional):** subir archivos (PDF, etc.) al bucket
      `adjuntos-campanias`; se guardan sus metadatos en `campanias.adjuntos`.
   4. Vista previa del merge con un destinatario real (render del HTML + asunto + lista de adjuntos).
   5. Confirmar → crea `campania` + N `envios (pendiente)` → invoca
      `enviar-campania`. Barra de progreso por estado.
5. **Informe / Estadísticas** — por campaña: tarjetas (enviados/entregados/
   abiertos/clic/rebote), gráfico de barras de estados, **tabla filtrable de
   envíos** (FilterBar por estado/email) y **export a Excel** (ExcelJS con
   colores). Auto-refresh suave para reflejar eventos del webhook.
6. **Usuarios** (solo admin) — alta/baja/reset vía `admin-usuarios`.

Routing `HashRouter`: `/login /dashboard /plantillas /campanias/nueva
/campanias/:id/informe /usuarios`.

---

## 5. Dependencias clave

```
react-email-editor          # editor visual Unlayer
@tiptap/react + extensiones  # (o react-quill) texto enriquecido
xlsx (SheetJS)               # importar Excel
exceljs + file-saver         # export informe con colores
recharts                     # gráficos
@supabase/supabase-js
react-router-dom             # HashRouter
tailwindcss v4
```
Cuidado con el bundle (Unlayer/exceljs/tiptap): **lazy-load** del editor y del
módulo de export (ver gotchas del skill).

---

## 6. Orden de ejecución (para la sesión de desarrollo)

1. Scaffold Vite+TS+Tailwind, branding, `vite.config.ts` con `base:'/envio_masivo_email/'`, `ui.tsx`.
2. Crear proyecto Supabase (tras confirmar costo) → migraciones §2 + RLS + seed admin.
3. Auth + roles + login + módulo usuarios (`admin-usuarios`).
4. Plantillas (dos pestañas + export HTML).
5. Wizard de campaña + import Excel + merge + `enviar-campania`.
6. `resend-webhook` + configurar endpoint/secret en Resend.
7. Informe estadístico + export Excel.
8. Deploy GitHub Actions → Pages (secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
9. Verificar end-to-end: login → diseñar → importar Excel de prueba → enviar a
   1–2 correos reales → ver entregado/abierto en el informe.

---

## 7. Decisiones resueltas (todas cerradas ✅)

- **P1 → Proyecto Supabase nuevo dedicado** (~US$10/mes). Confirmar costo al usuario justo antes de crearlo.
- **P2 → Envío inmediato** en v1 (sin cron; programación a futuro queda en backlog).
- **P3 → Solo admin inicial** `juan.etayo@cacsantabarbara.co`; resto desde el módulo de usuarios.
- **P4 → Con adjuntos** (mismos archivos para toda la campaña, vía Supabase Storage + Resend `attachments`).

---

## 8. Notas de seguridad / cumplimiento

- Dato sensible de pacientes ⇒ Ley 1581 (habeas data): Auth + RLS obligatorios;
  los Excel con PII **nunca** se versionan (`.gitignore`).
- `RESEND_API_KEY` y `RESEND_WEBHOOK_SECRET` solo como secrets de Supabase/Actions;
  jamás en el repo ni en el cliente.
- Verificar firma del webhook para evitar inyección de eventos falsos.
- Escapar los valores del Excel al hacer merge (evitar romper el HTML / inyección).

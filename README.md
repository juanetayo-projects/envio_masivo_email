# envio_masivo_email

Aplicación interna de **CAC Santa Bárbara** para diseñar plantillas HTML de correo
y realizar envíos masivos personalizados desde un archivo Excel, con estadísticas
de entrega/apertura/clic.

## Funcionalidades

- Autenticación con Supabase Auth + roles (admin/editor) y módulo de usuarios.
- Diseño de plantillas en dos modos: **editor visual** (Unlayer) y **texto enriquecido** (TipTap).
- Exportar el HTML de la plantilla (descarga `.html` + copiar para Gmail).
- Importación de destinatarios desde Excel (1ª columna = email; demás columnas = variables).
- Personalización con variables `{{columna}}`.
- Envío masivo vía **Resend** (`notificaciones@cacsantabarbara.co`) con adjuntos opcionales.
- Informe estadístico por campaña + export a Excel.

## Stack

React 19 + Vite + TypeScript + Tailwind CSS v4 · Supabase (Postgres, Auth, RLS,
Edge Functions, Storage) · Resend · Recharts · SheetJS · ExcelJS · GitHub Pages.

## Desarrollo

```bash
npm install
cp .env.example .env.local   # rellenar con las credenciales de Supabase
npm run dev
```

## Configuración requerida (Supabase secrets)

Para el envío y el tracking, configurar en el panel de Supabase
(Edge Functions → Secrets):

- `RESEND_API_KEY` — clave de la cuenta Resend.
- `RESEND_WEBHOOK_SECRET` — secret del webhook de Resend (Svix).

El webhook de Resend debe apuntar a:
`https://<ref>.supabase.co/functions/v1/resend-webhook`

## Despliegue

Automático a GitHub Pages vía GitHub Actions al hacer push a `main`.
Secrets del repo: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

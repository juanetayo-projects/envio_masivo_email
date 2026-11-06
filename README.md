# envio_masivo_email

Aplicación web para diseñar plantillas de correo y hacer envíos masivos personalizados desde
un archivo Excel, con estadísticas de entrega, apertura y clic. Sirve para campañas de
CAC Santa Bárbara y para envíos no clínicos, con remitentes configurables.

**Producción:** <https://juanetayo-projects.github.io/envio_masivo_email/>

## Funcionalidades

### Campañas
- **Asistente de 5 pasos:** datos, destinatarios, adjuntos, revisión y envío.
- **Remitente por campaña:** se elige una dirección autorizada y se ajustan el nombre visible y el "responder a".
- **Destinatarios desde Excel o CSV:** la primera columna es el correo y las demás son variables `{{columna}}`.
  Las variables admiten tildes y no distinguen mayúsculas.
- **Editar, eliminar, agregar o corregir** registros antes de enviar, sin modificar el archivo.
- **Depuración al importar:** descarta correos repetidos, y excluye dominios inexistentes y correos en la lista de bloqueo.
- **Filtro por cualquier columna** del Excel.
- **Envío de prueba:** va siempre al correo de quien inició sesión, con el asunto marcado `[PRUEBA]`.
- **Barra de progreso en vivo.** Si se cierra la ventana, el servidor termina la campaña.
- **Informe por campaña:** métricas, reintento de fallidos y exportación a Excel.
- **Eliminar una o varias campañas** (solo administradores), con sus destinatarios y adjuntos.

### Dashboard
- Filtros por fechas, remitente y campaña.
- Tarjetas de campañas, enviados, tasas de entrega, apertura, clic y rebote, fallidos, omitidos, pendientes y bajas.
- Embudo, resultado de los envíos y serie por día o por mes.
- Mapa de calor por día y hora (hora de Colombia) de envíos, aperturas o clics.
- Últimas campañas y principales dominios.

### Configuración
- **Plantillas:** editor visual (Unlayer), texto enriquecido (TipTap) o HTML pegado, con avisos de
  imágenes temporales, `<script>`, tamaño y enlaces de baja que no funcionarían.
- **Imágenes:** suben a GitHub Pages y entregan la URL o el código `<img>`.
- **Remitentes** (solo administradores): direcciones autorizadas para enviar.
- **Usuarios** (solo administradores): altas, bajas, activación y contraseñas.

### Cumplimiento
- **Lista de bloqueo:** rebotes permanentes, quejas y bajas entran solos; también hay altas manuales.
- **Baja voluntaria:** `List-Unsubscribe` de un clic y enlace `{{enlace_baja}}` o pie automático.
- **Retención:** los datos personales se conservan 12 meses.

## Stack

React 19 + Vite + TypeScript + Tailwind CSS v4 · Supabase (Postgres, Auth, RLS, Edge Functions,
Storage, pg_cron, pg_net, Vault) · Resend · Recharts · SheetJS · ExcelJS · GitHub Pages.

`xlsx` 0.20.3 se instala desde el CDN oficial de SheetJS, porque la versión de npm tiene
vulnerabilidades sin corrección publicada allí.

## Desarrollo

```bash
npm install
cp .env.example .env.local   # rellenar con las credenciales de Supabase
npm run dev
```

Pruebas, compilación y revisión de código:

```bash
npm test
```

```bash
npm run build
```

```bash
npm run lint
```

Haz `git pull` antes de trabajar: cada imagen subida desde la app crea un commit en `main`.

## Configuración requerida

Secrets de Supabase (Edge Functions → Secrets):

| Secret | Para qué |
|---|---|
| `RESEND_API_KEY` | Enviar correos con Resend |
| `RESEND_WEBHOOK_SECRET` | Validar la firma del webhook de Resend |
| `GITHUB_IMAGENES_TOKEN` | Subir imágenes. Token de grano fino, solo para este repositorio, con Contents de lectura y escritura. **Tiene vencimiento:** al expirar, créalo de nuevo y reemplaza el secret |

El webhook de Resend debe apuntar a `https://<ref>.supabase.co/functions/v1/resend-webhook`.

Secrets del repositorio en GitHub: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y, opcional, `VITE_UNLAYER_PROJECT_ID`.

Cada dirección del catálogo de remitentes debe pertenecer a un dominio verificado en Resend.

## Cómo funciona el envío

`enviar-campania` procesa una tanda de unos 90 s y responde; la app vuelve a llamarla hasta terminar.
Si se cierra la ventana, `pg_cron` invoca `procesar-cola` cada minuto y el servidor termina la campaña.

- **Sin duplicados:** cada lote usa su `lote_id` como `Idempotency-Key` de Resend (válida 24 h), y un
  bloqueo impide dos tandas simultáneas de la misma campaña.
- **Errores:** los temporales se reintentan solos. Los definitivos quedan como `fallido` y se reintentan
  desde el informe. Una clave inválida o una cuota agotada detienen la campaña y lo muestran en el informe.
- **Lista de bloqueo:** `reclamar_lote` omite los correos bloqueados justo antes de enviar.
- **Baja:** abrir el enlace nunca da de baja, porque los antivirus abren los enlaces de los correos; hay que
  confirmar en la página o usar el "un clic" del cliente de correo.

## Imágenes de plantillas

La función `imagenes` sube cada archivo a `public/images/correos` con un commit, y GitHub Pages lo publica
tras el despliegue (1 o 2 minutos).

**El repositorio es público:** las imágenes quedan públicas y siguen en el historial aunque se eliminen.
No subas documentos ni fotos con datos personales.

## Retención de datos

Cada día a las 3:00 a. m. de Colombia, la función `retencion` anonimiza a los destinatarios de las campañas
con más de 12 meses y borra sus eventos y adjuntos. Se conservan los estados, para las métricas, y la lista de
bloqueo, para seguir respetando las bajas. Los enlaces de baja de esas campañas dejan de funcionar, igual que
los de una campaña eliminada.

## Infraestructura

| Función | JWT | Uso |
|---|---|---|
| `enviar-campania` | Sí | Procesa una tanda desde la app |
| `enviar-prueba` | Sí | Envía la prueba al usuario actual |
| `eliminar-campanias` | Sí | Borra campañas y adjuntos (administradores) |
| `imagenes` | Sí | Lista, sube y elimina imágenes en GitHub |
| `admin-usuarios` | Sí | Gestión de usuarios (administradores) |
| `procesar-cola` | No, token de Vault | Continúa las campañas en cola |
| `retencion` | No, token de Vault | Aplica la retención de 12 meses |
| `baja` | No, token del envío | Registra la baja del destinatario |
| `resend-webhook` | No, firma Svix | Recibe los eventos de Resend |

Tareas de `pg_cron`:
- `procesar-cola-envios`: cada minuto; solo llama a la función si hay campañas en cola.
- `retencion-datos`: cada día a las 8:00 UTC.

Ambas usan el token `cola_envio_token`, guardado en Vault. Las migraciones `0009` y `0014` solo funcionan en
Supabase, y llevan la URL de este proyecto.

## Despliegue

Un push a `main` solo publica la app en GitHub Pages. **La base de datos y las funciones se despliegan aparte,**
y en este orden:

1. Migraciones de `supabase/migrations`, una por una, comprobando cada una.
2. Edge Functions. Las que importan de `_shared/` deben publicarse con esos archivos.
3. Push a `main`.

## Documentación relacionada

`docs/super_prompt.md` es la especificación inicial del proyecto, y hoy describe menos de lo que hace la app.

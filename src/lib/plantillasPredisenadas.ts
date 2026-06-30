// Plantillas prediseñadas — HTML responsive table-based (compatible Gmail/Outlook),
// con branding CAC Santa Bárbara y variables {{...}}.
// Patrones basados en proyectos open-source MIT (Cerberus, Colorlib, Lee Munroe).

export type PlantillaPredisenada = {
  id: string
  nombre: string
  descripcion: string
  categoria: string
  html: string
}

const AZUL = '#0D2D6B'
const AZUL2 = '#16468E'
const LOGO = 'https://juanetayo-projects.github.io/envio_masivo_email/images/logo_cacsb_blanc.png'

// Envoltura común: header azul con logo + tarjeta blanca + pie institucional
function envolver(contenido: string, encabezado = 'CAC Santa Bárbara'): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${encabezado}</title>
<style>
  @media only screen and (max-width:600px){
    .contenedor{width:100% !important}
    .pad{padding:24px !important}
  }
</style></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#334155;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" class="contenedor" width="600" cellpadding="0" cellspacing="0"
      style="width:600px;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(13,45,107,.08);">
      <tr>
        <td style="background:linear-gradient(135deg,${AZUL},${AZUL2});padding:28px 32px;text-align:center;">
          <img src="${LOGO}" alt="CAC Santa Bárbara" height="44" style="height:44px;display:inline-block;">
        </td>
      </tr>
      <tr><td class="pad" style="padding:36px 40px;">
        ${contenido}
      </td></tr>
      <tr>
        <td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.6;">
          Clínica CAC Santa Bárbara · Cúcuta, Colombia<br>
          Este es un mensaje automático, por favor no responda a este correo.
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`
}

const h1 = `margin:0 0 16px;font-size:22px;color:${AZUL};font-weight:bold;`
const p = 'margin:0 0 16px;font-size:15px;line-height:1.6;color:#475569;'
const boton = (texto: string, enlace = '{{enlace}}') =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr>
    <td style="background:${AZUL};border-radius:8px;">
      <a href="${enlace}" style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;">${texto}</a>
    </td></tr></table>`

export const PLANTILLAS_PREDISENADAS: PlantillaPredisenada[] = [
  {
    id: 'recordatorio-cita',
    nombre: 'Recordatorio de cita',
    descripcion: 'Aviso de cita médica con fecha, hora y médico.',
    categoria: 'Citas',
    html: envolver(`
      <h1 style="${h1}">Recordatorio de su cita</h1>
      <p style="${p}">Estimado(a) <strong>{{nombre}}</strong>, le recordamos su próxima cita médica:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border-radius:12px;padding:8px 0;margin-bottom:20px;">
        <tr><td style="padding:14px 20px;font-size:14px;color:#475569;">
          📅 <strong>Fecha:</strong> {{fecha}}<br><br>
          🕐 <strong>Hora:</strong> {{hora}}<br><br>
          🩺 <strong>Profesional:</strong> {{medico}}<br><br>
          📍 <strong>Sede:</strong> {{sede}}
        </td></tr>
      </table>
      <p style="${p}">Por favor llegue 15 minutos antes. Si no puede asistir, le agradecemos cancelar con anticipación.</p>
      ${boton('Confirmar asistencia')}
    `),
  },
  {
    id: 'bienvenida',
    nombre: 'Bienvenida',
    descripcion: 'Mensaje de bienvenida para nuevos pacientes o usuarios.',
    categoria: 'General',
    html: envolver(`
      <h1 style="${h1}">¡Bienvenido(a), {{nombre}}!</h1>
      <p style="${p}">Nos alegra darle la bienvenida a la familia de <strong>CAC Santa Bárbara</strong>. Estamos comprometidos con brindarle atención de la más alta calidad.</p>
      <p style="${p}">A partir de ahora podrá acceder a nuestros servicios y recibir información importante sobre su atención.</p>
      ${boton('Conocer nuestros servicios')}
      <p style="${p}">Si tiene cualquier duda, nuestro equipo está para ayudarle.</p>
    `),
  },
  {
    id: 'resultados',
    nombre: 'Resultados disponibles',
    descripcion: 'Notifica que los resultados de un examen están listos.',
    categoria: 'Resultados',
    html: envolver(`
      <h1 style="${h1}">Sus resultados están listos</h1>
      <p style="${p}">Estimado(a) <strong>{{nombre}}</strong>, le informamos que los resultados de su examen de <strong>{{examen}}</strong> ya se encuentran disponibles.</p>
      <p style="${p}">Puede consultarlos de forma segura a través del siguiente enlace:</p>
      ${boton('Ver mis resultados')}
      <p style="${p}" >Por su seguridad, este enlace es personal e intransferible.</p>
    `),
  },
  {
    id: 'comunicado',
    nombre: 'Comunicado / Boletín',
    descripcion: 'Comunicado institucional o boletín informativo.',
    categoria: 'General',
    html: envolver(`
      <h1 style="${h1}">{{titulo}}</h1>
      <p style="${p}">Estimado(a) <strong>{{nombre}}</strong>,</p>
      <p style="${p}">{{mensaje}}</p>
      ${boton('Leer más')}
      <p style="${p}">Gracias por confiar en CAC Santa Bárbara.</p>
    `),
  },
  {
    id: 'encuesta',
    nombre: 'Encuesta de satisfacción',
    descripcion: 'Invita al paciente a calificar su experiencia.',
    categoria: 'General',
    html: envolver(`
      <h1 style="${h1}">¿Cómo fue su experiencia?</h1>
      <p style="${p}">Hola <strong>{{nombre}}</strong>, su opinión es muy importante para seguir mejorando. ¿Nos ayuda con una breve encuesta sobre su atención del {{fecha}}?</p>
      <p style="${p}">Solo le tomará un minuto.</p>
      ${boton('Responder encuesta')}
      <p style="${p}">¡Gracias por su tiempo!</p>
    `),
  },
]

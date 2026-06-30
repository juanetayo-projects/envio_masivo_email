// Plantillas prediseñadas — cada una se define con BLOQUES y de ahí se genera
// tanto el HTML (para preview/envío) como el DISEÑO Unlayer (para editar en visual).
// Branding CAC Santa Bárbara, variables {{...}}. Patrones open-source MIT.

import { construirDiseno } from './disenosUnlayer'
import type { Bloque } from './disenosUnlayer'

export type PlantillaPredisenada = {
  id: string
  nombre: string
  descripcion: string
  categoria: string
  html: string
  design: object
}

const AZUL = '#0D2D6B'
const AZUL2 = '#16468E'
const LOGO = 'https://juanetayo-projects.github.io/envio_masivo_email/images/logo_cacsb_blanc.png'

const h1 = `margin:0 0 16px;font-size:22px;color:${AZUL};font-weight:bold;`
const p = 'margin:0 0 16px;font-size:15px;line-height:1.6;color:#475569;'
const botonHtml = (texto: string, href = '{{enlace}}') =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr>
    <td style="background:${AZUL};border-radius:8px;">
      <a href="${href}" style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;">${texto}</a>
    </td></tr></table>`

// Convierte bloques al HTML del cuerpo (luego se envuelve con header/footer)
function bloquesAHtml(bloques: Bloque[]): string {
  return bloques.map((b) => {
    switch (b.t) {
      case 'titulo': return `<h1 style="${h1}">${b.texto}</h1>`
      case 'parrafo': return `<p style="${p}">${b.html}</p>`
      case 'boton': return botonHtml(b.texto, b.href)
      case 'divisor': return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;">`
      case 'html': return b.html
    }
  }).join('\n')
}

function envolver(contenido: string, titulo = 'CAC Santa Bárbara'): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo}</title>
<style>@media only screen and (max-width:600px){.contenedor{width:100% !important}.pad{padding:24px !important}}</style></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#334155;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" class="contenedor" width="600" cellpadding="0" cellspacing="0"
      style="width:600px;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(13,45,107,.08);">
      <tr><td style="background:linear-gradient(135deg,${AZUL},${AZUL2});padding:28px 32px;text-align:center;">
        <img src="${LOGO}" alt="CAC Santa Bárbara" height="44" style="height:44px;display:inline-block;">
      </td></tr>
      <tr><td class="pad" style="padding:36px 40px;">${contenido}</td></tr>
      <tr><td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.6;">
        Clínica CAC Santa Bárbara · Cúcuta, Colombia<br>Este es un mensaje automático, por favor no responda a este correo.
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`
}

// Helper: crea una plantilla a partir de bloques (genera html + design)
function crear(id: string, nombre: string, descripcion: string, categoria: string, bloques: Bloque[]): PlantillaPredisenada {
  return { id, nombre, descripcion, categoria, html: envolver(bloquesAHtml(bloques)), design: construirDiseno(bloques) }
}

const tablaResultadosHtml = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 16px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
  <thead><tr style="background:${AZUL};color:#ffffff;">
    <th align="left" style="padding:11px 14px;font-size:13px;">Examen</th>
    <th align="left" style="padding:11px 14px;font-size:13px;">Resultado</th>
    <th align="left" style="padding:11px 14px;font-size:13px;">Referencia</th>
  </tr></thead>
  <tbody>
    <tr><td style="padding:10px 14px;font-size:13px;color:#475569;border-top:1px solid #e2e8f0;">{{examen1}}</td><td style="padding:10px 14px;font-size:13px;color:#0f172a;border-top:1px solid #e2e8f0;font-weight:bold;">{{resultado1}}</td><td style="padding:10px 14px;font-size:13px;color:#94a3b8;border-top:1px solid #e2e8f0;">{{referencia1}}</td></tr>
    <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-size:13px;color:#475569;border-top:1px solid #e2e8f0;">{{examen2}}</td><td style="padding:10px 14px;font-size:13px;color:#0f172a;border-top:1px solid #e2e8f0;font-weight:bold;">{{resultado2}}</td><td style="padding:10px 14px;font-size:13px;color:#94a3b8;border-top:1px solid #e2e8f0;">{{referencia2}}</td></tr>
    <tr><td style="padding:10px 14px;font-size:13px;color:#475569;border-top:1px solid #e2e8f0;">{{examen3}}</td><td style="padding:10px 14px;font-size:13px;color:#0f172a;border-top:1px solid #e2e8f0;font-weight:bold;">{{resultado3}}</td><td style="padding:10px 14px;font-size:13px;color:#94a3b8;border-top:1px solid #e2e8f0;">{{referencia3}}</td></tr>
  </tbody>
</table>`

const socialHtml = `
<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:8px auto 0;"><tr>
  <td style="padding:0 8px;"><a href="{{facebook}}"><img src="https://cdn-icons-png.flaticon.com/32/733/733547.png" width="28" height="28" alt="Facebook" style="display:block;"></a></td>
  <td style="padding:0 8px;"><a href="{{instagram}}"><img src="https://cdn-icons-png.flaticon.com/32/2111/2111463.png" width="28" height="28" alt="Instagram" style="display:block;"></a></td>
  <td style="padding:0 8px;"><a href="{{whatsapp}}"><img src="https://cdn-icons-png.flaticon.com/32/733/733585.png" width="28" height="28" alt="WhatsApp" style="display:block;"></a></td>
  <td style="padding:0 8px;"><a href="{{web}}"><img src="https://cdn-icons-png.flaticon.com/32/1006/1006771.png" width="28" height="28" alt="Sitio web" style="display:block;"></a></td>
</tr></table>`

export const PLANTILLAS_PREDISENADAS: PlantillaPredisenada[] = [
  crear('recordatorio-cita', 'Recordatorio de cita', 'Aviso de cita médica con fecha, hora y médico.', 'Citas', [
    { t: 'titulo', texto: 'Recordatorio de su cita' },
    { t: 'parrafo', html: 'Estimado(a) <strong>{{nombre}}</strong>, le recordamos su próxima cita médica:' },
    { t: 'html', html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;margin:0 0 8px;"><tr><td style="padding:16px 20px;font-size:14px;color:#475569;line-height:2;">📅 <strong>Fecha:</strong> {{fecha}}<br>🕐 <strong>Hora:</strong> {{hora}}<br>🩺 <strong>Profesional:</strong> {{medico}}<br>📍 <strong>Sede:</strong> {{sede}}</td></tr></table>` },
    { t: 'parrafo', html: 'Por favor llegue 15 minutos antes. Si no puede asistir, agradecemos cancelar con anticipación.' },
    { t: 'boton', texto: 'Confirmar asistencia' },
  ]),
  crear('bienvenida', 'Bienvenida', 'Mensaje de bienvenida para nuevos pacientes o usuarios.', 'General', [
    { t: 'titulo', texto: '¡Bienvenido(a), {{nombre}}!' },
    { t: 'parrafo', html: 'Nos alegra darle la bienvenida a la familia de <strong>CAC Santa Bárbara</strong>. Estamos comprometidos con brindarle atención de la más alta calidad.' },
    { t: 'parrafo', html: 'A partir de ahora podrá acceder a nuestros servicios y recibir información importante sobre su atención.' },
    { t: 'boton', texto: 'Conocer nuestros servicios' },
  ]),
  crear('resultados', 'Resultados disponibles', 'Notifica que los resultados de un examen están listos.', 'Resultados', [
    { t: 'titulo', texto: 'Sus resultados están listos' },
    { t: 'parrafo', html: 'Estimado(a) <strong>{{nombre}}</strong>, los resultados de su examen de <strong>{{examen}}</strong> ya se encuentran disponibles.' },
    { t: 'parrafo', html: 'Puede consultarlos de forma segura en el siguiente enlace:' },
    { t: 'boton', texto: 'Ver mis resultados' },
    { t: 'parrafo', html: 'Por su seguridad, este enlace es personal e intransferible.' },
  ]),
  crear('comunicado', 'Comunicado / Boletín', 'Comunicado institucional o boletín informativo.', 'General', [
    { t: 'titulo', texto: '{{titulo}}' },
    { t: 'parrafo', html: 'Estimado(a) <strong>{{nombre}}</strong>,' },
    { t: 'parrafo', html: '{{mensaje}}' },
    { t: 'boton', texto: 'Leer más' },
  ]),
  crear('tabla-resultados', 'Tabla de resultados', 'Resumen en tabla (exámenes, valores, referencias).', 'Datos', [
    { t: 'titulo', texto: 'Resumen de resultados' },
    { t: 'parrafo', html: 'Estimado(a) <strong>{{nombre}}</strong>, este es el resumen de su atención del <strong>{{fecha}}</strong>:' },
    { t: 'html', html: tablaResultadosHtml },
    { t: 'boton', texto: 'Ver detalle completo' },
  ]),
  crear('encuesta', 'Encuesta de satisfacción', 'Invita al paciente a calificar su experiencia.', 'General', [
    { t: 'titulo', texto: '¿Cómo fue su experiencia?' },
    { t: 'parrafo', html: 'Hola <strong>{{nombre}}</strong>, su opinión es muy importante para seguir mejorando. ¿Nos ayuda con una breve encuesta sobre su atención del {{fecha}}?' },
    { t: 'boton', texto: 'Responder encuesta' },
  ]),
  crear('redes-sociales', 'Comunicado con redes sociales', 'Boletín con botones de redes sociales en el pie.', 'General', [
    { t: 'titulo', texto: '{{titulo}}' },
    { t: 'parrafo', html: 'Hola <strong>{{nombre}}</strong>,' },
    { t: 'parrafo', html: '{{mensaje}}' },
    { t: 'boton', texto: 'Saber más' },
    { t: 'divisor' },
    { t: 'parrafo', html: '<span style="display:block;text-align:center;color:#94a3b8;font-size:13px;">Síguenos en nuestras redes</span>' },
    { t: 'html', html: socialHtml },
  ]),
]

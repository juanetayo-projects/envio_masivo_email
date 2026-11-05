// Avisos para HTML pegado desde herramientas externas. No bloquean el guardado:
// indican lo que puede fallar al llegar al correo del destinatario.

const LIMITE_GMAIL_BYTES = 102 * 1024   // Gmail recorta los mensajes más largos

export function revisarHtml(html: string): string[] {
  const avisos: string[] = []

  const bytes = new TextEncoder().encode(html).length
  if (bytes > LIMITE_GMAIL_BYTES) {
    avisos.push(`Pesa ${Math.round(bytes / 1024)} KB: Gmail recorta los correos de más de 102 KB y oculta el resto.`)
  }

  const imagenes = [...html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1])
  if (imagenes.some((src) => /^data:/i.test(src))) {
    avisos.push('Tiene imágenes incrustadas (data:): Gmail y Outlook no las muestran. Usa imágenes alojadas en una URL pública.')
  }
  if (imagenes.some((src) => /^(file:|blob:|https?:\/\/(localhost|127\.0\.0\.1))/i.test(src) || /^(?!https?:|data:|cid:)/i.test(src))) {
    avisos.push('Tiene imágenes con rutas locales: el destinatario no podrá verlas.')
  }
  if (imagenes.some((src) => /^https?:\/\/[^/]*(temp|tmp)[^/]*\//i.test(src))) {
    avisos.push('Tiene imágenes en un almacenamiento temporal: pueden dejar de verse. Súbelas a un sitio permanente.')
  }

  const etiquetas = [...new Set([...html.matchAll(/<(script|form|iframe)\b/gi)].map((m) => m[1].toLowerCase()))]
  if (etiquetas.length > 0) {
    avisos.push(`Usa ${etiquetas.map((e) => `<${e}>`).join(', ')}: los clientes de correo lo bloquean y puede enviarlo a spam.`)
  }

  if (/unsubscribe|darse de baja|cancelar suscripci/i.test(html) && !/\{\{\s*enlace_baja\s*\}\}/i.test(html)) {
    avisos.push('Menciona una baja o "unsubscribe", pero no usa {{enlace_baja}}: ese enlace no funcionará. Reemplázalo por {{enlace_baja}}.')
  }

  return avisos
}

// Constructor de diseños nativos de Unlayer (para que las plantillas
// prediseñadas se puedan editar en el modo VISUAL, no solo HTML).
// Estructura basada en un export real de Unlayer (schemaVersion 16).

const AZUL = '#0D2D6B'
const AZUL2 = '#16468E'
const LOGO = 'https://juanetayo-projects.github.io/envio_masivo_email/images/logo_cacsb_blanc.png'

let n = 0
const uid = () => `b${(++n).toString(36)}${Math.random().toString(36).slice(2, 7)}`

export type Bloque =
  | { t: 'titulo'; texto: string }
  | { t: 'parrafo'; html: string }
  | { t: 'boton'; texto: string; href?: string }
  | { t: 'divisor' }
  | { t: 'html'; html: string }

function contenido(b: Bloque): any {
  const base = (type: string, values: any) => ({
    id: uid(), type,
    values: { _meta: { htmlID: `u_${type}_${uid()}`, htmlClassNames: `u_content_${type}` }, ...values },
  })
  switch (b.t) {
    case 'titulo':
      return base('heading', {
        text: b.texto, headingType: 'h1', color: AZUL, fontSize: '22px',
        textAlign: 'left', lineHeight: '130%', containerPadding: '12px 24px 4px',
      })
    case 'parrafo':
      return base('text', {
        text: `<p style="line-height:160%;margin:0;">${b.html}</p>`,
        fontSize: '15px', color: '#475569', textAlign: 'left',
        lineHeight: '160%', containerPadding: '8px 24px',
      })
    case 'boton':
      return base('button', {
        text: b.texto,
        href: { name: 'web', values: { href: b.href ?? '{{enlace}}', target: '_blank' } },
        buttonColors: { color: '#ffffff', backgroundColor: AZUL, hoverColor: '#ffffff', hoverBackgroundColor: AZUL2 },
        size: { autoWidth: true, width: '100%' },
        fontSize: '15px', lineHeight: '120%', textAlign: 'left',
        padding: '13px 28px', borderRadius: '8px', containerPadding: '14px 24px',
      })
    case 'divisor':
      return base('divider', {
        border: { borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: '#e2e8f0' },
        textAlign: 'center', containerPadding: '10px 24px',
      })
    case 'html':
      return base('html', { html: b.html, containerPadding: '0px', hideDesktop: false })
  }
}

function fila(contents: any[], opts: { fondo?: string; padding?: string } = {}): any {
  return {
    id: uid(),
    cells: [1],
    values: {
      _meta: { htmlID: `u_row_${uid()}`, htmlClassNames: 'u_row' },
      padding: '0px', columns: false, backgroundColor: '',
      columnsBackgroundColor: opts.fondo ?? '',
      backgroundImage: { url: '', fullWidth: true, repeat: 'no-repeat', size: 'custom', position: 'center' },
      hideDesktop: false, displayCondition: null,
    },
    columns: [{
      id: uid(),
      values: {
        _meta: { htmlID: `u_column_${uid()}`, htmlClassNames: 'u_column' },
        border: {}, padding: opts.padding ?? '0px', borderRadius: '0px', backgroundColor: '',
      },
      contents,
    }],
  }
}

// Construye el diseño completo: header azul con logo + filas de contenido + pie
export function construirDiseno(bloques: Bloque[]): object {
  const header = fila([
    contenido({ t: 'html', html: `<div style="text-align:center;padding:8px 0;"><img src="${LOGO}" alt="CAC Santa Bárbara" height="44" style="height:44px;"></div>` }),
  ], { fondo: AZUL, padding: '24px' })

  const cuerpo = fila(bloques.map(contenido), { fondo: '#ffffff', padding: '16px 8px' })

  const pie = fila([
    contenido({ t: 'html', html: `<div style="text-align:center;font-size:12px;color:#94a3b8;line-height:1.6;padding:8px;">Clínica CAC Santa Bárbara · Cúcuta, Colombia<br>Mensaje automático, por favor no responda a este correo.</div>` }),
  ], { fondo: '#f8fafc', padding: '16px' })

  return {
    counters: { u_row: 3, u_column: 3, u_content_html: 2, u_content_heading: 1, u_content_text: 1, u_content_button: 1 },
    body: {
      id: uid(),
      rows: [header, cuerpo, pie],
      headers: [], footers: [],
      values: {
        _meta: { htmlID: 'u_body', htmlClassNames: 'u_body' },
        popupWidth: '600px', contentWidth: '600px', contentAlign: 'center',
        fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
        preheaderText: '', linkStyle: { body: true, linkColor: AZUL2, linkUnderline: true },
        backgroundColor: '#f1f5f9',
        backgroundImage: { url: '', fullWidth: true, repeat: 'no-repeat', size: 'custom', position: 'center' },
      },
    },
    schemaVersion: 16,
  }
}

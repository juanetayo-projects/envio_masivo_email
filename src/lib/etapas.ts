// Cada envío guarda solo su último estado: quien hizo clic figura como "clic", aunque también
// se haya entregado y abierto. Las etapas reconstruyen ese recorrido, con las mismas reglas
// que las tarjetas del informe y metricas_campanias.
export const ETAPAS = [
  { key: 'enviado', label: 'Enviados', color: '#16468E', estados: ['enviado', 'entregado', 'abierto', 'clic', 'rebote'] },
  { key: 'entregado', label: 'Entregados', color: '#0D9488', estados: ['entregado', 'abierto', 'clic'] },
  { key: 'abierto', label: 'Abiertos', color: '#7C3AED', estados: ['abierto', 'clic'] },
  { key: 'clic', label: 'Clics', color: '#DB2777', estados: ['clic'] },
  { key: 'rebote', label: 'Rebotes', color: '#F59E0B', estados: ['rebote'] },
  { key: 'fallido', label: 'Fallidos', color: '#DC2626', estados: ['fallido'] },
  { key: 'pendiente', label: 'Pendientes', color: '#94A3B8', estados: ['pendiente'] },
  { key: 'enviando', label: 'En proceso', color: '#64748B', estados: ['enviando'] },
  { key: 'omitido', label: 'Omitidos', color: '#475569', estados: ['omitido'] },
] as const

// Todas las etapas, también las que están en cero.
export function contarEtapas(estados: string[]) {
  return ETAPAS.map((etapa) => ({
    ...etapa,
    valor: estados.filter((e) => (etapa.estados as readonly string[]).includes(e)).length,
  }))
}

export function alcanzoEtapa(estado: string, claveEtapa: string): boolean {
  const etapa = ETAPAS.find((x) => x.key === claveEtapa)
  return !!etapa && (etapa.estados as readonly string[]).includes(estado)
}

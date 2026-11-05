// Las pruebas usan la misma versión de xlsx que Vite empaqueta para el navegador (xlsx.mjs).
import { registerHooks } from 'node:module'

const xlsxNavegador = new URL('../node_modules/xlsx/xlsx.mjs', import.meta.url).href

registerHooks({
  resolve(especificador, contexto, siguiente) {
    if (especificador === 'xlsx') return { url: xlsxNavegador, shortCircuit: true }
    return siguiente(especificador, contexto)
  },
})

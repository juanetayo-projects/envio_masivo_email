import { PageHeader, Card } from '../components/ui'
import GaleriaImagenes from '../components/GaleriaImagenes'

export default function Imagenes() {
  return (
    <div className="max-w-4xl">
      <PageHeader titulo="Imágenes" />
      <p className="mb-4 text-sm text-slate-500">
        Sube las imágenes de tus plantillas y copia su URL o el código HTML para pegarlo en la plantilla.
      </p>
      <Card><GaleriaImagenes /></Card>
    </div>
  )
}

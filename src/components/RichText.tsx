import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import { useEffect } from 'react'

type Props = {
  value: string
  onChange: (html: string) => void
  variables?: string[]
}

export default function RichText({ value, onChange, variables = [] }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Image,
    ],
    content: value || '<p></p>',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'prose max-w-none min-h-[320px] p-4 focus:outline-none',
      },
    },
  })

  // Sincroniza si cambia el valor desde afuera (p.ej. al cargar otra plantilla)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '<p></p>', { emitUpdate: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor])

  if (!editor) return null

  const Btn = ({ on, active, children }: { on: () => void; active?: boolean; children: React.ReactNode }) => (
    <button type="button" onClick={on}
      className={`rounded px-2 py-1 text-sm ${active ? 'bg-[#0D2D6B] text-white' : 'hover:bg-slate-100'}`}>
      {children}
    </button>
  )

  function ponerEnlace() {
    const url = prompt('URL del enlace:')
    if (url) editor!.chain().focus().setLink({ href: url }).run()
    else editor!.chain().focus().unsetLink().run()
  }
  function ponerImagen() {
    const url = prompt('URL de la imagen:')
    if (url) editor!.chain().focus().setImage({ src: url }).run()
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-300 bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-2">
        <Btn on={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')}><b>B</b></Btn>
        <Btn on={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')}><i>I</i></Btn>
        <Btn on={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })}>H1</Btn>
        <Btn on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })}>H2</Btn>
        <Btn on={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')}>• Lista</Btn>
        <Btn on={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')}>1. Lista</Btn>
        <Btn on={ponerEnlace} active={editor.isActive('link')}>🔗 Enlace</Btn>
        <Btn on={ponerImagen}>🖼️ Imagen</Btn>
        {variables.length > 0 && (
          <select
            onChange={(e) => {
              if (e.target.value) {
                editor.chain().focus().insertContent(`{{${e.target.value}}}`).run()
                e.target.value = ''
              }
            }}
            className="ml-auto rounded border border-slate-300 px-2 py-1 text-sm text-slate-600">
            <option value="">+ Insertar variable</option>
            {variables.map((v) => <option key={v} value={v}>{`{{${v}}}`}</option>)}
          </select>
        )}
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

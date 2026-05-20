import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useState } from 'react'

interface NoteData {
  slug: string
  title: string
  content: string
  visibility: string
  editPermission: boolean
  updatedAtMs: number
}

interface Props {
  note: NoteData
  onSaved: (note: NoteData) => void
}

export default function NoteEditView({ note, onSaved }: Props) {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const editor = useEditor({
    extensions: [StarterKit],
    content: note.content,
  })

  async function handleSave() {
    if (!editor) return
    setSaving(true)
    setSaveError(null)
    const content = editor.getText()
    try {
      const res = await fetch(`/api/notes/${note.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error('Save failed')
      const data = await res.json() as { ok: boolean; updatedAtMs: number }
      onSaved({ ...note, content, updatedAtMs: data.updatedAtMs })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', color: '#e5e5e7' }}>{note.title}</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '0.4rem 1rem',
            background: saving ? '#333' : '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {saveError && <p style={{ color: '#f87171', marginBottom: '1rem', fontSize: '0.875rem' }}>{saveError}</p>}
      <div style={{ background: '#2a2a2a', borderRadius: 8, padding: '1rem', minHeight: 400 }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

import { useState, useEffect, lazy, Suspense } from 'react'
import NoteReadView from './components/NoteReadView'

const NoteEditView = lazy(() => import('./components/NoteEditView'))

interface NoteData {
  slug: string
  title: string
  content: string
  visibility: string
  editPermission: boolean
  updatedAtMs: number
}

interface AppProps {
  slug: string
}

export default function App({ slug }: AppProps) {
  const [note, setNote] = useState<NoteData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const isEditRoute = window.location.pathname.endsWith('/edit')

  useEffect(() => {
    if (!slug) {
      setError('No note specified.')
      setLoading(false)
      return
    }

    const cleanSlug = slug.replace(/\/edit$/, '')
    fetch(`/api/notes/${cleanSlug}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Note not found.' : 'Failed to load note.')
        return res.json() as Promise<NoteData>
      })
      .then((data) => {
        setNote(data)
        setLoading(false)
      })
      .catch((err: Error) => {
        setError(err.message)
        setLoading(false)
      })
  }, [slug])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#666' }}>
        Loading…
      </div>
    )
  }

  if (error || !note) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: '0.5rem' }}>
        <h1 style={{ color: '#e5e5e7', fontSize: '1.25rem' }}>Note not found</h1>
        <p style={{ color: '#666', fontSize: '0.9rem' }}>{error}</p>
      </div>
    )
  }

  if (isEditRoute && note.editPermission) {
    return (
      <Suspense fallback={<div style={{ color: '#666', padding: '2rem' }}>Loading editor…</div>}>
        <NoteEditView note={note} onSaved={setNote} />
      </Suspense>
    )
  }

  return <NoteReadView note={note} />
}

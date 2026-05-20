import { useMemo } from 'react'
import { marked } from 'marked'

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
}

export default function NoteReadView({ note }: Props) {
  const dateStr = note.updatedAtMs
    ? new Date(note.updatedAtMs).toLocaleDateString(undefined, { dateStyle: 'long' })
    : ''

  const bodyHtml = useMemo(
    () => marked(note.content ?? '', { gfm: true, breaks: false }) as string,
    [note.content],
  )

  return (
    <div className="container">
      <h1>{note.title}</h1>
      {dateStr && <p className="meta">Updated {dateStr}</p>}
      <div className="prose" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      {note.editPermission && (
        <a className="edit-link" href={`/${note.slug}/edit`}>
          Edit this note
        </a>
      )}
    </div>
  )
}

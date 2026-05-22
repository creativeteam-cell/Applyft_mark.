'use client'

import { useState, useRef } from 'react'

interface Concept {
  id: string
  emoji: string
  concept: string
  createdAt: string
}

interface CreativeLibraryProps {
  appCode: string
  concepts: Concept[]
  onConceptAdded: (concept: Concept) => void
  onConceptDeleted: (id: string) => void
}

export function CreativeLibrary({ appCode, concepts, onConceptAdded, onConceptDeleted }: CreativeLibraryProps) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result as string
      setPreview(base64)
      setUploading(true)

      try {
        const res = await fetch('/api/concepts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appCode, imageBase64: base64 }),
        })
        const data = await res.json()
        if (!data.error) {
          onConceptAdded(data)
          setPreview(null)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setUploading(false)
        if (fileRef.current) fileRef.current.value = ''
      }
    }
    reader.readAsDataURL(file)
  }

  async function handleDelete(id: string) {
    await fetch(`/api/concepts?app=${appCode}&id=${id}`, { method: 'DELETE' })
    onConceptDeleted(id)
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />

      {/* Upload button */}
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading || concepts.length >= 15}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-all disabled:opacity-40 mb-4"
        style={{ background: 'var(--surface)', border: '1px dashed var(--border)' }}
      >
        {uploading ? (
          <><span className="animate-spin">⟳</span> Analyzing creative...</>
        ) : (
          <><span>+</span> Upload creative image</>
        )}
      </button>

      {/* Preview while uploading */}
      {preview && uploading && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <img src={preview} alt="preview" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
          <div className="text-sm text-gray-400">GPT is analyzing the creative concept...</div>
        </div>
      )}

      {/* Concepts list */}
      {concepts.length === 0 && !uploading && (
        <div className="text-xs text-gray-600 py-2">No concepts yet — upload an image to extract a concept</div>
      )}

      <div className="space-y-2">
        {concepts.map(c => (
          <div key={c.id} className="flex items-start gap-3 px-4 py-3 rounded-xl"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <span className="text-xl flex-shrink-0">{c.emoji}</span>
            <p className="flex-1 text-sm text-gray-300 leading-relaxed">{c.concept}</p>
            <button
              onClick={() => handleDelete(c.id)}
              className="text-red-400 text-xs hover:text-red-300 transition-all flex-shrink-0 mt-0.5">
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

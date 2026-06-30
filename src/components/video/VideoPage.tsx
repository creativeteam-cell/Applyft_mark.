'use client'

import { useState, useRef, useCallback } from 'react'

type Tab = 'text' | 'image'
type Mode = 'std' | 'pro'
type Duration = '5' | '10' | '15'
type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4'
type TaskStatus = 'idle' | 'pending' | 'processing' | 'done' | 'error'
type KlingModel = 'kling-v3' | 'kling-v3-turbo' | 'kling-v2-6' | 'kling-v2-5-turbo'

interface ModelDef {
  id: KlingModel
  label: string
  description: string
  tags: string[]
}

const MODELS: ModelDef[] = [
  { id: 'kling-v3', label: 'Kling 3.0', description: 'Best quality, audio sync, storyboarding', tags: ['Best', 'HOT'] },
  { id: 'kling-v3-turbo', label: 'Kling 3.0 Turbo', description: 'Faster generation, slightly lower quality', tags: ['Fast', 'NEW'] },
  { id: 'kling-v2-6', label: 'Kling 2.6', description: 'Stable, good for realistic content', tags: ['Stable'] },
  { id: 'kling-v2-5-turbo', label: 'Kling 2.5 Turbo', description: 'Quick drafts and previews', tags: ['Fast', 'Draft'] },
]

const ASPECT_RATIOS: { value: AspectRatio; label: string }[] = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
]

export function VideoPage() {
  const [tab, setTab] = useState<Tab>('text')
  const [model, setModel] = useState<KlingModel>('kling-v3')
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [mode, setMode] = useState<Mode>('std')
  const [duration, setDuration] = useState<Duration>('5')
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9')
  const [sound, setSound] = useState(false)
  const [image, setImage] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [status, setStatus] = useState<TaskStatus>('idle')
  const [taskId, setTaskId] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [unitsUsed, setUnitsUsed] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const pollStatus = useCallback((id: string, type: 'text2video' | 'image2video') => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/video/status/${id}?type=${type}`)
        const data = await res.json()
        if (data.task_status === 'succeed') {
          stopPolling()
          setVideoUrl(data.task_result?.videos?.[0]?.url ?? null)
          setUnitsUsed(data.final_unit_deduction ?? null)
          setStatus('done')
        } else if (data.task_status === 'failed') {
          stopPolling()
          setError(data.task_status_msg ?? 'Generation failed')
          setStatus('error')
        }
      } catch {
        // keep polling
      }
    }, 4000)
  }, [stopPolling])

  const handleGenerate = async () => {
    if (!prompt.trim() && tab === 'text') return
    if (!image && tab === 'image') return
    setStatus('pending')
    setVideoUrl(null)
    setError(null)
    setUnitsUsed(null)

    try {
      const type = tab === 'text' ? 'text2video' : 'image2video'
      const body = tab === 'text'
        ? { model_name: model, prompt, negative_prompt: negativePrompt, mode, duration, aspect_ratio: aspectRatio, sound: sound ? 'on' : 'off' }
        : { model_name: model, image, prompt, negative_prompt: negativePrompt, mode, duration, sound: sound ? 'on' : 'off' }

      const res = await fetch(`/api/video/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      setTaskId(data.task_id)
      setStatus('processing')
      pollStatus(data.task_id, type)
    } catch (e: any) {
      setError(e.message)
      setStatus('error')
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      setImagePreview(dataUrl)
      const base64 = dataUrl.split(',')[1]
      setImage(base64)
    }
    reader.readAsDataURL(file)
  }

  const canGenerate = status !== 'pending' && status !== 'processing' &&
    (tab === 'text' ? prompt.trim().length > 0 : image !== null)

  return (
    <div className="flex h-screen pt-14" style={{ background: 'var(--bg)' }}>
      {/* Left panel */}
      <div className="w-[360px] flex-shrink-0 border-r flex flex-col" style={{ borderColor: 'var(--border)' }}>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
          {([['text', 'Text to Video'], ['image', 'Image to Video']] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-3 text-sm font-medium transition-all"
              style={{
                color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
                borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

          {/* Model selector */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Model</label>
            <div className="flex flex-col gap-1.5">
              {MODELS.map(m => (
                <button
                  key={m.id}
                  onClick={() => setModel(m.id)}
                  className="w-full text-left px-3 py-2.5 rounded-xl transition-all"
                  style={{
                    background: model === m.id ? 'rgba(79,110,247,0.12)' : 'var(--surface)',
                    border: `1px solid ${model === m.id ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium" style={{ color: model === m.id ? 'var(--accent)' : 'var(--text)' }}>
                      {m.label}
                    </span>
                    <div className="flex gap-1">
                      {m.tags.map(tag => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                          style={{ background: 'rgba(79,110,247,0.15)', color: 'var(--accent)' }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{m.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Image upload */}
          {tab === 'image' && (
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Reference image
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl border-2 border-dashed cursor-pointer flex items-center justify-center transition-all"
                style={{
                  borderColor: imagePreview ? 'transparent' : 'var(--border)',
                  minHeight: 160,
                  overflow: 'hidden',
                }}
              >
                {imagePreview
                  ? <img src={imagePreview} alt="reference" className="w-full object-cover rounded-xl" style={{ maxHeight: 240 }} />
                  : <div className="text-center p-6">
                      <div className="text-2xl mb-2">🎬</div>
                      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Click to upload image</div>
                    </div>
                }
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </div>
          )}

          {/* Prompt */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
              {tab === 'image' ? 'Motion prompt (optional)' : 'Prompt'}
            </label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder={tab === 'text' ? 'Describe the video...' : 'Describe how the image should move...'}
              rows={4}
              className="w-full rounded-xl px-3 py-2.5 text-sm resize-none outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>

          {/* Negative prompt */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Negative prompt
            </label>
            <textarea
              value={negativePrompt}
              onChange={e => setNegativePrompt(e.target.value)}
              placeholder="What to avoid..."
              rows={2}
              className="w-full rounded-xl px-3 py-2.5 text-sm resize-none outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>

          {/* Mode */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Quality</label>
            <div className="flex gap-2">
              {([['std', '720p Standard'], ['pro', '1080p Pro']] as [Mode, string][]).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: mode === m ? 'rgba(79,110,247,0.15)' : 'var(--surface)',
                    color: mode === m ? 'var(--accent)' : 'var(--text-muted)',
                    border: `1px solid ${mode === m ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Duration: {duration}s
            </label>
            <div className="flex gap-2">
              {(['5', '10', '15'] as Duration[]).map(d => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: duration === d ? 'rgba(79,110,247,0.15)' : 'var(--surface)',
                    color: duration === d ? 'var(--accent)' : 'var(--text-muted)',
                    border: `1px solid ${duration === d ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>

          {/* Aspect ratio (text only) */}
          {tab === 'text' && (
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Aspect ratio</label>
              <div className="flex flex-wrap gap-2">
                {ASPECT_RATIOS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setAspectRatio(value)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: aspectRatio === value ? 'rgba(79,110,247,0.15)' : 'var(--surface)',
                      color: aspectRatio === value ? 'var(--accent)' : 'var(--text-muted)',
                      border: `1px solid ${aspectRatio === value ? 'var(--accent)' : 'var(--border)'}`,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sound toggle */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Generate sound</span>
            <button
              onClick={() => setSound(s => !s)}
              className="relative w-10 h-5 rounded-full transition-all"
              style={{ background: sound ? 'var(--accent)' : 'rgba(255,255,255,0.1)' }}
            >
              <span
                className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                style={{ left: sound ? '22px' : '2px' }}
              />
            </button>
          </div>
        </div>

        {/* Generate button */}
        <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: canGenerate ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
              color: canGenerate ? '#fff' : 'var(--text-muted)',
              cursor: canGenerate ? 'pointer' : 'not-allowed',
            }}
          >
            {status === 'pending' || status === 'processing' ? 'Generating...' : 'Generate video'}
          </button>
          {mode === 'pro' && (
            <p className="text-center text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              Pro uses ~{Number(duration) * 8 / 5 * 2} units
            </p>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">

        {status === 'idle' && (
          <div className="text-center">
            <div className="text-5xl mb-4">🎬</div>
            <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text)' }}>Kling Video Generator</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Text to video or animate any image</p>
          </div>
        )}

        {(status === 'pending' || status === 'processing') && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full border-4 border-[var(--accent)] border-t-transparent animate-spin mx-auto mb-4" />
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
              {status === 'pending' ? 'Submitting task...' : 'Generating video...'}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {taskId ? 'Task submitted, please wait...' : 'Please wait...'}
            </p>
          </div>
        )}

        {status === 'done' && videoUrl && (
          <div className="w-full max-w-2xl flex flex-col gap-4">
            <video
              src={videoUrl}
              controls
              autoPlay
              loop
              className="w-full rounded-2xl"
              style={{ border: '1px solid var(--border)' }}
            />
            <div className="flex items-center justify-between">
              {unitsUsed && (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Units used: {unitsUsed}</p>
              )}
              <a
                href={videoUrl}
                download="video.mp4"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                Download
              </a>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center max-w-md">
            <div className="text-4xl mb-4">⚠️</div>
            <p className="text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>Generation failed</p>
            <p className="text-xs px-4 py-3 rounded-xl"
              style={{ color: '#f87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}>
              {error}
            </p>
            <button
              onClick={() => setStatus('idle')}
              className="mt-4 px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
            >
              Try again
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

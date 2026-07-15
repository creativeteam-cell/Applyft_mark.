// ElevenLabs: Scribe (транскрипция с диаризацией) + TTS (мультиязычная озвучка).
// Dubbing API не используем — дорого; собираем конвейер из дешёвых компонентов.
const EL_BASE = 'https://api.elevenlabs.io'

function elHeaders(): Record<string, string> {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) throw new Error('ELEVENLABS_API_KEY not set')
  return { 'xi-api-key': key }
}

export interface ScribeSegment {
  speaker: string
  text: string
  start: number  // seconds
  end: number
}

export interface ScribeResult {
  text: string
  language: string
  segments: ScribeSegment[]
}

// Scribe принимает видео напрямую по URL (mp4/mov) — ffmpeg не нужен
export async function scribeTranscribe(videoUrl: string): Promise<ScribeResult> {
  const form = new FormData()
  form.append('model_id', 'scribe_v1')
  form.append('cloud_storage_url', videoUrl)
  form.append('diarize', 'true')
  form.append('tag_audio_events', 'false')

  const res = await fetch(`${EL_BASE}/v1/speech-to-text`, {
    method: 'POST',
    headers: elHeaders(),
    body: form,
  })
  if (!res.ok) throw new Error(`Scribe ${res.status}: ${await res.text()}`)
  const data = await res.json()

  // Собираем сегменты по сменам говорящего
  const segments: ScribeSegment[] = []
  let current: ScribeSegment | null = null
  for (const w of data.words || []) {
    if (w.type === 'audio_event') continue
    const speaker = w.speaker_id || 'speaker_0'
    if (!current || current.speaker !== speaker) {
      if (current) segments.push(current)
      current = { speaker, text: w.text, start: w.start ?? 0, end: w.end ?? 0 }
    } else {
      current.text += w.text
      current.end = w.end ?? current.end
    }
  }
  if (current) segments.push(current)

  return {
    text: (data.text || '').trim(),
    language: data.language_code || 'unknown',
    segments: segments.map(s => ({ ...s, text: s.text.trim() })),
  }
}

// Text to Dialogue (eleven_v3): массив реплик разными голосами → один mp3.
// Поддерживает эмоции тегами в тексте: "[crying] Пап, прости..."
// Лимиты: до 10 уникальных голосов, суммарно ≤2000 символов на запрос.
export async function elevenDialogue(inputs: { text: string; voice_id: string }[]): Promise<Buffer> {
  const res = await fetch(`${EL_BASE}/v1/text-to-dialogue?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { ...elHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs, model_id: 'eleven_v3' }),
  })
  if (!res.ok) throw new Error(`ElevenLabs Dialogue ${res.status}: ${await res.text()}`)
  return Buffer.from(await res.arrayBuffer())
}

// Диалог с таймстемпами: voice_segments говорят, где в сгенерированном mp3
// начинается и кончается каждая реплика — нужно для окон липсинка.
export interface DialogueTiming { index: number; start: number; end: number } // секунды

export async function elevenDialogueTimed(inputs: { text: string; voice_id: string }[]): Promise<{ audio: Buffer; timings: DialogueTiming[] }> {
  const res = await fetch(`${EL_BASE}/v1/text-to-dialogue/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { ...elHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs, model_id: 'eleven_v3' }),
  })
  if (!res.ok) throw new Error(`ElevenLabs Dialogue ${res.status}: ${await res.text()}`)
  const data = await res.json()

  // Одна реплика может состоять из нескольких сегментов — берём min start / max end
  const byIndex = new Map<number, { start: number; end: number }>()
  for (const seg of data.voice_segments || []) {
    const i = seg.dialogue_input_index
    const cur = byIndex.get(i)
    byIndex.set(i, {
      start: cur ? Math.min(cur.start, seg.start_time_seconds) : seg.start_time_seconds,
      end: cur ? Math.max(cur.end, seg.end_time_seconds) : seg.end_time_seconds,
    })
  }
  const timings: DialogueTiming[] = [...byIndex.entries()]
    .map(([index, t]) => ({ index, start: t.start, end: t.end }))
    .sort((a, b) => a.index - b.index)

  return { audio: Buffer.from(data.audio_base64, 'base64'), timings }
}

// Мультиязычный TTS; один и тот же голос говорит на любом языке
export async function elevenTTS(text: string, voiceId: string): Promise<Buffer> {
  const res = await fetch(`${EL_BASE}/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { ...elHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  })
  if (!res.ok) throw new Error(`ElevenLabs TTS ${res.status}: ${await res.text()}`)
  return Buffer.from(await res.arrayBuffer())
}

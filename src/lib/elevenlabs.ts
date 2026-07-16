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

// Список голосов аккаунта (premade + добавленные), с тегами для автоподбора
export interface ElevenVoice {
  voice_id: string
  name: string
  labels: Record<string, string> // gender, age, accent, descriptive, use_case
  preview_url?: string           // готовый mp3-сэмпл голоса (хостится у EL)
}

let voicesCache: { at: number; voices: ElevenVoice[] } | null = null

export async function listElevenVoices(): Promise<ElevenVoice[]> {
  if (voicesCache && Date.now() - voicesCache.at < 60 * 60 * 1000) return voicesCache.voices
  const res = await fetch(`${EL_BASE}/v1/voices`, { headers: elHeaders() })
  if (!res.ok) throw new Error(`ElevenLabs voices ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const voices: ElevenVoice[] = (data.voices || []).map((v: any) => ({
    voice_id: v.voice_id,
    name: v.name,
    labels: v.labels || {},
    preview_url: v.preview_url || undefined,
  }))
  voicesCache = { at: Date.now(), voices }
  return voices
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

// Instant Voice Clone из аудио-сэмпла: возвращает voice_id клона.
// Создание бесплатное (не тратит символы), но занимает слот в аккаунте —
// после дубляжа клон надо удалить (deleteVoice).
export async function cloneVoice(name: string, sampleMp3: Buffer): Promise<string> {
  const form = new FormData()
  form.append('name', name)
  form.append('remove_background_noise', 'true')
  form.append('files', new Blob([new Uint8Array(sampleMp3)], { type: 'audio/mpeg' }), `${name}.mp3`)
  const res = await fetch(`${EL_BASE}/v1/voices/add`, {
    method: 'POST', headers: elHeaders(), body: form,
  })
  if (!res.ok) {
    const raw = await res.text()
    console.warn('[elevenlabs] clone error raw:', res.status, raw)
    // ElevenLabs отдаёт {"detail":{"status":"...","message":"..."}} или {"detail":"..."}
    let msg = raw
    try {
      const j = JSON.parse(raw)
      msg = j?.detail?.message || j?.detail?.status || (typeof j?.detail === 'string' ? j.detail : '') || raw
    } catch {}
    throw new Error(`${res.status}: ${msg}`.slice(0, 200))
  }
  const data = await res.json()
  return data.voice_id
}

export async function deleteVoice(voiceId: string): Promise<void> {
  await fetch(`${EL_BASE}/v1/voices/${voiceId}`, { method: 'DELETE', headers: elHeaders() }).catch(() => {})
}

// Освобождает один слот при нехватке места:
// 1) сначала наши временные клоны dub_* (безопасно),
// 2) если их нет — самый СТАРЫЙ клонированный голос (category='cloned').
// Premade/professional голоса не трогает никогда. Возвращает имя удалённого.
// protectIds — клоны, созданные в текущем прогоне: их удалять НЕЛЬЗЯ,
// иначе снесём голос говорящего, которого только что склонировали.
export async function freeVoiceSlot(protectIds: Set<string> = new Set()): Promise<string | null> {
  try {
    const res = await fetch(`${EL_BASE}/v1/voices`, { headers: elHeaders() })
    if (!res.ok) return null
    const data = await res.json()
    const cloned = (data.voices || []).filter((v: any) => v.category === 'cloned' && !protectIds.has(v.voice_id))
    if (!cloned.length) return null

    // приоритет — старые dub_* прошлых прогонов, затем самый старый клон
    const dub = cloned.filter((v: any) => typeof v.name === 'string' && v.name.startsWith('dub_'))
    const pickFrom = dub.length ? dub : cloned
    pickFrom.sort((a: any, b: any) =>
      (a.created_at_unix ?? a.created_at_unix_secs ?? 0) - (b.created_at_unix ?? b.created_at_unix_secs ?? 0))
    const victim = pickFrom[0]
    await deleteVoice(victim.voice_id)
    return victim.name || victim.voice_id
  } catch { return null }
}

// Клон с автоочисткой: при лимите освобождаем слот (не трогая клоны текущего
// прогона из protectIds) и пробуем снова
export async function cloneVoiceWithRetry(name: string, sampleMp3: Buffer, protectIds: Set<string> = new Set()): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await cloneVoice(name, sampleMp3)
    } catch (e: any) {
      const isLimit = /limit|maximum|quota|too many|no.*slot/i.test(e.message || '')
      if (!isLimit || attempt === 3) throw e
      const freed = await freeVoiceSlot(protectIds)
      console.warn(`[elevenlabs] voice limit — freed slot "${freed ?? 'none'}", retry ${attempt + 1}`)
      if (!freed) throw e
    }
  }
  throw new Error('clone failed after freeing slots')
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

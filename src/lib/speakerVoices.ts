// Автоподбор голосов ElevenLabs под говорящих из исходного видео.
// 1. ffmpeg вырезает 4-секундный аудио-сэмпл каждого говорящего
// 2. GPT-4o-audio слушает и классифицирует: пол, возраст, тембр
// 3. Матчер подбирает ближайший голос ElevenLabs по тегам (без повторов)
import OpenAI from 'openai'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { ElevenVoice, cloneVoice } from './elevenlabs'
import { updateQueue } from './queue'

const execFileAsync = promisify(execFile)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export interface SpeakerProfile {
  gender: 'male' | 'female' | 'unknown'
  age: 'child' | 'teen' | 'adult' | 'senior' | 'unknown'
  tone: string
}

async function getFfmpegPath(): Promise<string | null> {
  try {
    return (await import('ffmpeg-static')).default as unknown as string
  } catch {
    return null
  }
}

async function classifySnippet(mp3: Buffer): Promise<SpeakerProfile> {
  await updateQueue('openai', 1)
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-audio-preview',
      modalities: ['text'],
      messages: [{
        role: 'user',
        content: [
          { type: 'input_audio', input_audio: { data: mp3.toString('base64'), format: 'mp3' } } as any,
          {
            type: 'text',
            text: 'Classify the speaker in this audio. Respond ONLY with raw JSON: {"gender":"male|female","age":"child|teen|adult|senior","tone":"one or two words, e.g. calm, energetic, deep, warm"}',
          },
        ],
      }],
      max_tokens: 60,
      temperature: 0,
    }, { timeout: 30000 })
    const raw = res.choices[0]?.message?.content?.trim() || '{}'
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
    const p = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1))
    return { gender: p.gender || 'unknown', age: p.age || 'unknown', tone: p.tone || '' }
  } finally {
    await updateQueue('openai', -1)
  }
}

function scoreVoice(v: ElevenVoice, p: SpeakerProfile): number {
  let score = 0
  const g = (v.labels.gender || '').toLowerCase()
  if (p.gender !== 'unknown' && g) score += g === p.gender ? 5 : -5
  const age = (v.labels.age || '').toLowerCase()
  if (p.age !== 'unknown' && age) {
    const young = p.age === 'child' || p.age === 'teen'
    if (young && age.includes('young')) score += 2
    if (p.age === 'adult' && (age.includes('middle') || age.includes('adult'))) score += 2
    if (p.age === 'senior' && age.includes('old')) score += 2
  }
  const desc = `${v.labels.descriptive || ''} ${v.labels.use_case || ''}`.toLowerCase()
  if (p.tone && p.tone.split(/[,\s]+/).some(t => t && desc.includes(t.toLowerCase()))) score += 1
  return score
}

/** Профили говорящих + голоса. По умолчанию КЛОНИРУЕМ голос каждого говорящего
 *  (родной голос из ролика); при неудаче — подбираем похожий из библиотеки.
 *  clonedVoiceIds — клоны, которые вызывающий обязан удалить после дубляжа. */
export async function matchSpeakerVoices(
  videoUrl: string,
  samples: { speaker: string; startSec: number }[],
  voices: ElevenVoice[],
  doClone = true,
): Promise<{ profiles: Record<string, SpeakerProfile>; voiceMap: Record<string, string>; clonedVoiceIds: string[] }> {
  const profiles: Record<string, SpeakerProfile> = {}
  const voiceMap: Record<string, string> = {}
  const clonedVoiceIds: string[] = []

  const ffmpegPath = await getFfmpegPath()
  if (!ffmpegPath) return { profiles, voiceMap, clonedVoiceIds } // нет ffmpeg — пропускаем

  const tmp = os.tmpdir()
  const ts = Date.now()
  const vidPath = path.join(tmp, `spk_in_${ts}.mp4`)
  const cleanup: string[] = [vidPath]

  try {
    const res = await fetch(videoUrl)
    if (!res.ok) throw new Error(`fetch video ${res.status}`)
    await fs.writeFile(vidPath, Buffer.from(await res.arrayBuffer()))

    for (const s of samples) {
      try {
        // Для клона нужен более длинный сэмпл (до ~40с речи этого говорящего),
        // для классификации хватит начала. Берём один кусок с его первой реплики.
        const outPath = path.join(tmp, `spk_${ts}_${s.speaker}.mp3`)
        cleanup.push(outPath)
        await execFileAsync(ffmpegPath, [
          '-y', '-ss', String(Math.max(0, s.startSec)), '-t', doClone ? '40' : '4',
          '-i', vidPath, '-vn', '-acodec', 'libmp3lame', '-b:a', '128k', outPath,
        ], { timeout: 40000 })
        const mp3 = await fs.readFile(outPath)
        profiles[s.speaker] = await classifySnippet(mp3)

        if (doClone) {
          try {
            const vid = await cloneVoice(`dub_${s.speaker}_${ts}`, mp3)
            voiceMap[s.speaker] = vid
            clonedVoiceIds.push(vid)
          } catch (ce: any) {
            console.warn(`[speakerVoices] clone ${s.speaker} failed, will fall back:`, ce.message)
          }
        }
      } catch (e: any) {
        console.warn(`[speakerVoices] ${s.speaker} failed:`, e.message)
      }
    }

    // Тем, кого не удалось клонировать — подбираем похожий из библиотеки (без повторов)
    const used = new Set<string>(Object.values(voiceMap))
    for (const s of samples) {
      if (voiceMap[s.speaker]) continue
      const p = profiles[s.speaker]
      if (!p) continue
      const ranked = voices
        .filter(v => !used.has(v.voice_id))
        .map(v => ({ v, score: scoreVoice(v, p) }))
        .sort((a, b) => b.score - a.score)
      if (ranked[0]) {
        voiceMap[s.speaker] = ranked[0].v.voice_id
        used.add(ranked[0].v.voice_id)
      }
    }
  } catch (e: any) {
    console.warn('[speakerVoices] analysis failed:', e.message)
  } finally {
    for (const p of cleanup) fs.unlink(p).catch(() => {})
  }

  return { profiles, voiceMap, clonedVoiceIds }
}

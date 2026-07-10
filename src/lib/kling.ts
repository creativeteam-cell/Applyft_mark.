// Kling AI video generation API client
// Docs: https://kling.ai/document-api/api/get-started/authentication

const KLING_BASE_URL = 'https://api-singapore.klingai.com'

export type KlingModel = 'kling-v3' | 'kling-v2-6' | 'kling-v2-5-turbo' | 'kling-v2-master' | 'kling-v2-1-master' | 'kling-v1-6'
export type KlingMode = 'std' | 'pro' | '4k'
export type KlingDuration = '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15'
export type KlingAspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '3:2' | '2:3'
export type KlingTaskStatus = 'submitted' | 'processing' | 'succeed' | 'failed'

export interface KlingVideo {
  id: string
  url: string
  duration: string
}

export interface KlingTaskData {
  task_id: string
  task_status: KlingTaskStatus
  task_status_msg?: string
  task_result?: { videos: KlingVideo[] }
  final_unit_deduction?: string
  created_at: number
  updated_at: number
}

interface KlingResponse {
  code: number
  message: string
  request_id: string
  data: KlingTaskData
}

function headers() {
  const key = process.env.KLING_API_KEY
  if (!key) throw new Error('KLING_API_KEY not set')
  return {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

export async function createText2VideoTask(params: {
  prompt: string
  negative_prompt?: string
  model_name?: KlingModel
  mode?: KlingMode
  duration?: KlingDuration
  aspect_ratio?: KlingAspectRatio
  sound?: 'on' | 'off'
}): Promise<{ task_id: string }> {
  const res = await fetch(`${KLING_BASE_URL}/v1/videos/text2video`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model_name: params.model_name ?? 'kling-v3',
      prompt: params.prompt,
      negative_prompt: params.negative_prompt ?? '',
      mode: params.mode ?? 'std',
      duration: params.duration ?? '5',
      aspect_ratio: params.aspect_ratio ?? '16:9',
      sound: params.sound ?? 'off',
    }),
  })
  const data: KlingResponse = await res.json()
  if (data.code !== 0) throw new Error(`Kling error: ${data.message}`)
  return { task_id: data.data.task_id }
}

export async function createImage2VideoTask(params: {
  image: string          // base64 no prefix
  image_tail?: string    // optional last frame, base64 no prefix
  prompt?: string
  negative_prompt?: string
  model_name?: KlingModel
  mode?: KlingMode
  duration?: KlingDuration
  sound?: 'on' | 'off'
}): Promise<{ task_id: string }> {
  const body: any = {
    model_name: params.model_name ?? 'kling-v3',
    image: params.image,
    prompt: params.prompt ?? '',
    negative_prompt: params.negative_prompt ?? '',
    mode: params.mode ?? 'std',
    duration: params.duration ?? '5',
    sound: params.sound ?? 'off',
  }
  if (params.image_tail) body.image_tail = params.image_tail

  const res = await fetch(`${KLING_BASE_URL}/v1/videos/image2video`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  const data: KlingResponse = await res.json()
  if (data.code !== 0) throw new Error(`Kling error: ${data.message}`)
  return { task_id: data.data.task_id }
}

export async function getVideoTaskStatus(
  type: 'text2video' | 'image2video' | 'video-extend' | 'motion-control' | 'avatar',
  task_id: string
): Promise<KlingTaskData> {
  let endpoint: string
  if (type === 'video-extend') {
    endpoint = `${KLING_BASE_URL}/v1/videos/video-extend/${task_id}`
  } else if (type === 'motion-control') {
    endpoint = `${KLING_BASE_URL}/v1/videos/motion-control/${task_id}`
  } else if (type === 'avatar') {
    endpoint = `${KLING_BASE_URL}/v1/videos/avatar/image2video/${task_id}`
  } else {
    endpoint = `${KLING_BASE_URL}/v1/videos/${type}/${task_id}`
  }
  const res = await fetch(endpoint, { headers: headers() })
  const data: KlingResponse = await res.json()
  if (data.code !== 0) throw new Error(`Kling error ${data.code}: ${data.message}`)
  return data.data
}

export async function extendVideo(params: {
  video_id: string   // Kling video ID from task_result.videos[0].id
  prompt?: string
  negative_prompt?: string
  duration?: '4' | '5'
}): Promise<{ task_id: string }> {
  const res = await fetch(`${KLING_BASE_URL}/v1/videos/video-extend`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      video_id: params.video_id,
      prompt: params.prompt ?? '',
      negative_prompt: params.negative_prompt ?? '',
      duration: params.duration ?? '5',
    }),
  })
  const data: KlingResponse = await res.json()
  if (data.code !== 0) throw new Error(`Kling error: ${data.message}`)
  return { task_id: data.data.task_id }
}

// ── New model API functions ────────────────────────────────────────────────

export type KlingModelAll = KlingModel | 'kling-v3-turbo' | 'kling-v3-omni' | 'kling-video-o1'

// Internal model IDs → API URL slugs for the new-style endpoints
// (docs: POST /text-to-video/kling-3.0-turbo, POST /image-to-video/kling-3.0-turbo)
const NEW_API_MODEL_SLUGS: Record<string, string> = {
  'kling-v3-turbo': 'kling-3.0-turbo',
}

// Kling 3.0 Turbo — new-style endpoints.
// text-to-video: plain { prompt, settings }; image-to-video: { contents, settings }
export async function createTurboVideoTask(params: {
  model_name: string
  prompt?: string
  first_frame?: string    // base64 or URL
  duration?: number
  resolution?: '720p' | '1080p'
  aspect_ratio?: string   // text-to-video only; 16:9 | 9:16 | 1:1
}): Promise<{ task_id: string }> {
  const slug = NEW_API_MODEL_SLUGS[params.model_name] ?? params.model_name
  const settings: any = { resolution: params.resolution ?? '1080p', duration: params.duration ?? 5 }
  let res: Response

  if (params.first_frame) {
    const contents: any[] = []
    if (params.prompt) contents.push({ type: 'prompt', text: params.prompt })
    contents.push({ type: 'first_frame', url: params.first_frame.startsWith('http') ? params.first_frame : `data:image/jpeg;base64,${params.first_frame}` })
    res = await fetch(`${KLING_BASE_URL}/image-to-video/${slug}`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ contents, settings }),
    })
  } else {
    if (!params.prompt) throw new Error('Prompt or first_frame required')
    const allowedAR = new Set(['16:9', '9:16', '1:1'])
    settings.aspect_ratio = allowedAR.has(params.aspect_ratio ?? '') ? params.aspect_ratio : '16:9'
    res = await fetch(`${KLING_BASE_URL}/text-to-video/${slug}`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ prompt: params.prompt, settings }),
    })
  }

  const data = await res.json()
  if (data.code !== 0) throw new Error(`Kling error: ${data.message}`)
  return { task_id: data.data.id }
}

export async function getTurboTaskStatus(task_id: string): Promise<{ status: string; videoUrl?: string; videoId?: string }> {
  const res = await fetch(`${KLING_BASE_URL}/tasks?task_ids=${task_id}`, { headers: headers() })
  const data = await res.json()
  if (data.code !== 0) throw new Error(`Kling error: ${data.message}`)
  const task = data.data?.[0]
  if (!task) throw new Error('Task not found')
  const video = task.outputs?.find((o: any) => o.type === 'video')
  return { status: task.status, videoUrl: video?.url, videoId: video?.id }
}

export async function createMotionControlTask(params: {
  image_url: string       // base64 or URL
  video_url: string       // URL only
  prompt?: string
  model_name?: 'kling-v2-6' | 'kling-v3'
  character_orientation: 'image' | 'video'
  keep_original_sound?: 'yes' | 'no'
  mode?: 'std' | 'pro'
}): Promise<{ task_id: string }> {
  const res = await fetch(`${KLING_BASE_URL}/v1/videos/motion-control`, {
    method: 'POST', headers: headers(),
    body: JSON.stringify({
      model_name: params.model_name ?? 'kling-v2-6',
      image_url: params.image_url,
      video_url: params.video_url,
      prompt: params.prompt ?? '',
      character_orientation: params.character_orientation,
      keep_original_sound: params.keep_original_sound ?? 'no',
      mode: params.mode ?? 'std',
    }),
  })
  const data: KlingResponse = await res.json()
  if (data.code !== 0) throw new Error(`Kling error: ${data.message}`)
  return { task_id: data.data.task_id }
}

export async function createAvatarTask(params: {
  image: string           // base64 (no prefix)
  sound_file: string      // base64 (no prefix) or URL
  prompt?: string
  mode?: 'std' | 'pro'
}): Promise<{ task_id: string }> {
  const res = await fetch(`${KLING_BASE_URL}/v1/videos/avatar/image2video`, {
    method: 'POST', headers: headers(),
    body: JSON.stringify({
      image: params.image,
      sound_file: params.sound_file,
      prompt: params.prompt ?? '',
      mode: params.mode ?? 'std',
    }),
  })
  const data: KlingResponse = await res.json()
  if (data.code !== 0) throw new Error(`Kling error: ${data.message}`)
  return { task_id: data.data.task_id }
}

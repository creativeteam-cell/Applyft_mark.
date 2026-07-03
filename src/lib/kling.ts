// Kling AI video generation API client
// Docs: https://kling.ai/document-api/api/get-started/authentication

const KLING_BASE_URL = 'https://api-singapore.klingai.com'

export type KlingModel = 'kling-v3' | 'kling-v2-master' | 'kling-v2-5' | 'kling-v1-6'
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
  type: 'text2video' | 'image2video' | 'video-extend',
  task_id: string
): Promise<KlingTaskData> {
  const endpoint = type === 'video-extend'
    ? `${KLING_BASE_URL}/v1/videos/video-extend/${task_id}`
    : `${KLING_BASE_URL}/v1/videos/${type}/${task_id}`
  const res = await fetch(endpoint, { headers: headers() })
  const data: KlingResponse = await res.json()
  if (data.code !== 0) throw new Error(`Kling error: ${data.message}`)
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

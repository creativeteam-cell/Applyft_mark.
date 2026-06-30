// Kling AI video generation API client
// Docs: https://kling.ai/document-api/api/get-started/authentication

const KLING_BASE_URL = 'https://api-singapore.klingai.com'

export type KlingModel = 'kling-v3' | 'kling-v2-6' | 'kling-v2-1' | 'kling-v1-6'
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
  image: string // URL or raw base64 (no data: prefix)
  prompt?: string
  negative_prompt?: string
  model_name?: KlingModel
  mode?: KlingMode
  duration?: KlingDuration
  sound?: 'on' | 'off'
}): Promise<{ task_id: string }> {
  const res = await fetch(`${KLING_BASE_URL}/v1/videos/image2video`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model_name: params.model_name ?? 'kling-v3',
      image: params.image,
      prompt: params.prompt ?? '',
      negative_prompt: params.negative_prompt ?? '',
      mode: params.mode ?? 'std',
      duration: params.duration ?? '5',
      sound: params.sound ?? 'off',
    }),
  })
  const data: KlingResponse = await res.json()
  if (data.code !== 0) throw new Error(`Kling error: ${data.message}`)
  return { task_id: data.data.task_id }
}

export async function getVideoTaskStatus(
  type: 'text2video' | 'image2video',
  task_id: string
): Promise<KlingTaskData> {
  const res = await fetch(`${KLING_BASE_URL}/v1/videos/${type}/${task_id}`, {
    headers: headers(),
  })
  const data: KlingResponse = await res.json()
  if (data.code !== 0) throw new Error(`Kling error: ${data.message}`)
  return data.data
}

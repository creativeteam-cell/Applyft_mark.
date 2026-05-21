import fs from 'fs'
import path from 'path'

export interface App {
  code: string
  name: string
  description: string
  style: string
  colors: string
  restrictions: string
  active: boolean
  driveExists?: boolean
}

const DATA_PATH = path.join(process.cwd(), 'data', 'apps.json')

export function getApps(): App[] {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function saveApps(apps: App[]): void {
  fs.writeFileSync(DATA_PATH, JSON.stringify(apps, null, 2))
}

export function getActiveApps(): App[] {
  return getApps().filter(a => a.active)
}

export function getApp(code: string): App | undefined {
  return getApps().find(a => a.code === code)
}

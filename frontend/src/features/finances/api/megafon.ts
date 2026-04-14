import { getB24Token } from '../../../shared/bitrix24/bx24'

const BASE = import.meta.env.VITE_API_BASE ?? ''

export interface UploadResult {
  inserted: number
  period: number | null
  contractId: string | null
  totalRewardWithVat: number | null
  elapsed: number
  error?: string
}

export interface PeriodInfo {
  period: number
  count: number
  contracts: string | null
}

export interface MegafonReport {
  totals: { subscribers: number; activated: number; chargesMonth: number; rewardMonth: number }
  bySegment: Array<{ segment: string | null; subscribers: number; activated: number; chargesMonth: number; rewardMonth: number }>
  byAgent: Array<{ agent: string; subscribers: number; activated: number; chargesMonth: number; rewardMonth: number; rewardRates: string | null }>
  byPeriod: Array<{ period: number; subscribers: number; activated: number; chargesMonth: number; rewardMonth: number }>
}

export async function uploadMegafonFile(file: File): Promise<UploadResult> {
  const formData = new FormData()
  formData.append('file', file)

  const headers: Record<string, string> = {}
  const token = getB24Token()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}/api/megafon/upload`, {
    method: 'POST',
    headers,
    body: formData,
  })

  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json
}

export interface UploadedFile {
  id:         number
  filename:   string
  period:     number
  contractId: string | null
  rowCount:   number
  uploadedAt: string
}

export async function fetchMegafonUploads(): Promise<UploadedFile[]> {
  const headers: Record<string, string> = {}
  const token = getB24Token()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}/api/megafon/uploads`, { headers })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function deleteMegafonUpload(id: number): Promise<{ deleted: boolean }> {
  const headers: Record<string, string> = {}
  const token = getB24Token()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}/api/megafon/uploads/${id}`, { method: 'DELETE', headers })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function fetchMegafonPeriods(): Promise<PeriodInfo[]> {
  const headers: Record<string, string> = {}
  const token = getB24Token()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}/api/megafon/periods`, { headers })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function fetchMegafonReport(period?: number): Promise<MegafonReport> {
  const headers: Record<string, string> = {}
  const token = getB24Token()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const url = period ? `${BASE}/api/megafon/report?period=${period}` : `${BASE}/api/megafon/report`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

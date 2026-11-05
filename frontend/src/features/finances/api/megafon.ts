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

export interface DynamicsRow {
  period: number
  key: string
  chargesMonth: number
  rewardMonth: number
}

export interface ContractInfo {
  key: string
  label: string
}

export interface MegafonDynamics {
  rows: DynamicsRow[]
  contracts: ContractInfo[]
}

export async function fetchMegafonDynamics(): Promise<MegafonDynamics> {
  const headers: Record<string, string> = {}
  const token = getB24Token()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}/api/megafon/dynamics`, { headers })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export interface CohortCompany {
  key:            string
  name:           string | null
  inn:            string | null
  contractId:     string | null
  contractLabel:  string
  cohort:         number               // YYYYMM месяца подключения
  cohortApprox:   boolean              // true = по первому появлению (нет даты активации)
  totalReward:    number               // копейки, без НДС
  rewardByPeriod: Record<number, number> // период → копейки, без НДС
}

export interface MegafonCohorts {
  periods:   number[]                  // все периоды с данными, по возрастанию
  companies: CohortCompany[]
}

export async function fetchMegafonCohorts(): Promise<MegafonCohorts> {
  const headers: Record<string, string> = {}
  const token = getB24Token()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}/api/megafon/cohorts`, { headers })
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

// ===================== Вознаграждение сотрудникам (воронка «МегаФон Корп клиенты») =====================

export type AccrualStatus = 'ready' | 'accrued' | 'other' | 'early' | 'overdue' | 'no_inn' | 'not_found' | 'paid'

export interface AccrualRow {
  dealId:        number
  dealName:      string | null
  company:       string | null
  inn:           string | null
  innSource:     'field' | 'scan' | 'name' | null
  managerId:     number
  manager:       string
  connectedOn:      string | null   // дата регистрации в МегаФон (справочно)
  firstChargeMonth: number | null   // YYYYMM — первый месяц с начислениями
  fullMonth:     number | null
  charges:       number          // копейки, без НДС
  inReport:      boolean
  status:        AccrualStatus
  selectable:    boolean
  currentPeriod: number | null
  currentAmount: number | null
  paid:          boolean
}

export interface AccrualPreview {
  amoUrl:       string
  period:       number
  pipelineId:   number
  pipelineName: string
  reportLoaded: boolean
  rows:         AccrualRow[]
}

export interface PayoutRow {
  dealId:    number
  dealName:  string | null
  company:   string | null
  inn:       string | null
  managerId: number
  manager:   string
  period:    number
  amount:    number   // копейки
  paid:      boolean
}

export interface Payouts {
  amoUrl:  string
  periods: Array<{ period: number; hasUnpaid: boolean }>
  rows:    PayoutRow[]
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getB24Token()
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (init?.body) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? `HTTP ${res.status}`)
  return data as T
}

export const fetchAccrualPreview = (period: number, refresh = false) =>
  call<AccrualPreview>(`/api/megafon/rewards/preview?period=${period}${refresh ? '&refresh=1' : ''}`)

/** Прогрев серверного кэша сделок amoCRM — чтобы окно начисления открывалось сразу. */
export const warmRewards = () =>
  call<{ ok: boolean }>('/api/megafon/rewards/warm', { method: 'POST', body: '{}' }).catch(() => null)

export const accrueRewards = (period: number, dealIds: number[], ratePct: number) =>
  call<{ updated: number; total: number }>('/api/megafon/rewards/accrue', {
    method: 'POST', body: JSON.stringify({ period, dealIds, ratePct }),
  })

export const fetchPayouts = (period?: number) =>
  call<Payouts>(`/api/megafon/rewards/payouts${period ? `?period=${period}` : ''}`)

export const setRewardsPaid = (dealIds: number[], paid: boolean) =>
  call<{ updated: number }>('/api/megafon/rewards/paid', {
    method: 'POST', body: JSON.stringify({ dealIds, paid }),
  })

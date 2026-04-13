/**
 * API-клиент для финансовых отчётов.
 * Данные хранятся в PostgreSQL, синхронизируются через POST /api/payments/sync.
 */

import { http } from '../../../shared/api/http'

// ===================== ТИПЫ =====================

export interface CategoryMonthly {
  category: string
  months:   Record<number, number>
  total:    number
  isMegafon: boolean
}

export interface FinancesData {
  year:            number
  income:          CategoryMonthly[]
  expense:         CategoryMonthly[]
  incomeTotal:     Record<number, number>
  expenseTotal:    Record<number, number>
  incomeTotalYear:  number
  expenseTotalYear: number
}

interface BackendPayload {
  year:    number
  income:  CategoryMonthly[]
  expense: CategoryMonthly[]
}

// ===================== API =====================

/** Запускает синхронизацию платежей из B24 в базу. */
export function syncPayments(): Promise<{ upserted: number; skipped: number; elapsed: number }> {
  return http('/api/payments/sync', { method: 'POST' })
}

/** Загружает агрегированные данные за год из нашего бэкенда. */
export async function fetchFinancesData(year: number): Promise<FinancesData> {
  const data = await http<BackendPayload>(`/api/payments?year=${year}`)

  // Досчитываем итоги на клиенте
  const incomeTotal:  Record<number, number> = {}
  const expenseTotal: Record<number, number> = {}

  for (const r of data.income) {
    for (const [m, v] of Object.entries(r.months)) {
      incomeTotal[+m] = (incomeTotal[+m] ?? 0) + v
    }
  }
  for (const r of data.expense) {
    for (const [m, v] of Object.entries(r.months)) {
      expenseTotal[+m] = (expenseTotal[+m] ?? 0) + v
    }
  }

  return {
    year: data.year,
    income: data.income,
    expense: data.expense,
    incomeTotal,
    expenseTotal,
    incomeTotalYear:  data.income.reduce((s, r) => s + r.total, 0),
    expenseTotalYear: data.expense.reduce((s, r) => s + r.total, 0),
  }
}

/** Фильтрует FinancesData по направлению (МегаФон / CRM). */
export function filterFinancesData(
  data: FinancesData,
  predicate: (row: CategoryMonthly) => boolean,
): FinancesData {
  const income  = data.income.filter(predicate)
  const expense = data.expense.filter(predicate)

  const incomeTotal:  Record<number, number> = {}
  const expenseTotal: Record<number, number> = {}
  for (const r of income)  for (const [m, v] of Object.entries(r.months)) incomeTotal[+m]  = (incomeTotal[+m]  ?? 0) + v
  for (const r of expense) for (const [m, v] of Object.entries(r.months)) expenseTotal[+m] = (expenseTotal[+m] ?? 0) + v

  return {
    year: data.year,
    income,
    expense,
    incomeTotal,
    expenseTotal,
    incomeTotalYear:  income.reduce((s, r) => s + r.total, 0),
    expenseTotalYear: expense.reduce((s, r) => s + r.total, 0),
  }
}

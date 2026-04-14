import { useCallback, useEffect, useState } from 'react'
import {
  uploadMegafonFile,
  fetchMegafonPeriods,
  fetchMegafonReport,
  fetchMegafonUploads,
  deleteMegafonUpload,
  type PeriodInfo,
  type MegafonReport,
  type UploadResult,
  type UploadedFile,
} from './api/megafon'

const fmt = (kopecks: number) =>
  (kopecks / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })

const MONTH_NAMES = [
  '', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

function periodLabel(p: number) {
  const y = Math.floor(p / 100)
  const m = p % 100
  return `${MONTH_NAMES[m] ?? m} ${y}`
}

export function FinancesMegafonPage() {
  const [periods, setPeriods]       = useState<PeriodInfo[]>([])
  const [selectedPeriod, setSelected] = useState<number | undefined>()
  const [report, setReport]         = useState<MegafonReport | null>(null)
  const [uploads, setUploads]       = useState<UploadedFile[]>([])
  const [showUploads, setShowUploads] = useState(false)
  const [loading, setLoading]       = useState(true)
  const [uploading, setUploading]   = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [error, setError]           = useState<string | null>(null)

  const loadPeriods = useCallback(async () => {
    try {
      const [p, u] = await Promise.all([fetchMegafonPeriods(), fetchMegafonUploads()])
      setPeriods(p)
      setUploads(u)
      return p
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return []
    }
  }, [])

  const loadReport = useCallback(async (period?: number) => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetchMegafonReport(period)
      setReport(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPeriods().then(p => {
      const last = p.length > 0 ? p[p.length - 1].period : undefined
      setSelected(last)
      void loadReport(last)
    })
  }, [loadPeriods, loadReport])

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    setUploadResult(null)

    const results: UploadResult[] = []
    for (const file of Array.from(files)) {
      try {
        const r = await uploadMegafonFile(file)
        results.push(r)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setUploading(false)
        return
      }
    }

    setUploadResult(results[results.length - 1])
    setUploading(false)

    // Перезагрузить данные
    const p = await loadPeriods()
    const last = p.length > 0 ? p[p.length - 1].period : undefined
    setSelected(last)
    void loadReport(last)
  }

  function handlePeriodChange(period: number | undefined) {
    setSelected(period)
    void loadReport(period)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">Финансы · МегаФон</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Выбор периода */}
          {periods.length > 0 && (
            <select
              value={selectedPeriod ?? ''}
              onChange={e => handlePeriodChange(e.target.value ? Number(e.target.value) : undefined)}
              className="h-8 px-2 rounded-lg border border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="">Все периоды</option>
              {periods.map(p => (
                <option key={p.period} value={p.period}>
                  {periodLabel(p.period)} ({p.count} абон.)
                </option>
              ))}
            </select>
          )}

          {/* Список файлов */}
          <button
            onClick={() => setShowUploads(v => !v)}
            className="px-3 h-8 rounded-lg border border-zinc-200 bg-white text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:text-zinc-200 transition-colors flex items-center gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Файлы ({uploads.length})
          </button>

          {/* Кнопка загрузки */}
          <label className={`px-3 h-8 rounded-lg border text-sm flex items-center gap-1.5 cursor-pointer transition-colors ${
            uploading
              ? 'border-zinc-300 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500'
              : 'border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:text-zinc-200'
          }`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {uploading ? 'Загрузка…' : 'Загрузить xlsx'}
            <input
              type="file"
              accept=".xlsx,.xls"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={e => handleUpload(e.target.files)}
            />
          </label>
        </div>
      </div>

      {/* Результат загрузки */}
      {uploadResult && (
        <div className="mb-4 p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 text-sm">
          Загружено {uploadResult.inserted} строк за период {uploadResult.period ? periodLabel(uploadResult.period) : '—'} ({uploadResult.elapsed}мс)
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Список загруженных файлов */}
      {showUploads && (
        <div className="mb-4 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Загруженные файлы</span>
            <button onClick={() => setShowUploads(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-sm">&#x2715;</button>
          </div>
          {uploads.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">Нет загруженных файлов</div>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {uploads.map(u => (
                <li key={u.id} className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-zinc-900 dark:text-zinc-100 truncate">{u.filename}</div>
                    <div className="text-[11px] text-zinc-400 dark:text-zinc-500 flex items-center gap-2 mt-0.5">
                      <span>{periodLabel(u.period)}</span>
                      <span>{u.rowCount.toLocaleString('ru-RU')} строк</span>
                      <span>{new Date(u.uploadedAt).toLocaleDateString('ru-RU')}</span>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (!confirm(`Удалить файл «${u.filename}» и все его данные?`)) return
                      try {
                        await deleteMegafonUpload(u.id)
                        const p = await loadPeriods()
                        const last = p.length > 0 ? p[p.length - 1].period : undefined
                        setSelected(last)
                        void loadReport(last)
                      } catch (e) {
                        setError(e instanceof Error ? e.message : String(e))
                      }
                    }}
                    className="px-2 py-1 text-[11px] rounded-md border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/40 transition-colors shrink-0"
                  >
                    Удалить
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {[0, 1, 2].map(i => (
            <div key={i} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4 shadow-sm">
              <div className="h-3 w-16 bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse mb-2" />
              <div className="h-6 w-28 bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* Данные */}
      {!loading && report && (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4 shadow-sm">
              <div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mb-2">Абонентов</div>
              <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                {report.totals.subscribers.toLocaleString('ru-RU')}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4 shadow-sm">
              <div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mb-2">Подключено</div>
              <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                {report.totals.activated.toLocaleString('ru-RU')}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4 shadow-sm">
              <div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mb-2">Начисления</div>
              <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                {fmt(report.totals.chargesMonth)} <span className="text-sm font-normal opacity-60">&#8381;</span>
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4 shadow-sm">
              <div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mb-2">Вознаграждение</div>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {fmt(report.totals.rewardMonth)} <span className="text-sm font-normal opacity-60">&#8381;</span>
              </div>
            </div>
          </div>

          {/* По сегментам */}
          <ReportTable
            title="По сегментам"
            rows={report.bySegment.map(r => ({ label: r.segment ?? 'Не указан', subscribers: r.subscribers, activated: r.activated, chargesMonth: r.chargesMonth, rewardMonth: r.rewardMonth }))}
          />

          {/* По контрагентам */}
          <ReportTable
            title="По контрагентам"
            rows={report.byAgent.map(r => ({ label: r.agent, subscribers: r.subscribers, activated: r.activated, chargesMonth: r.chargesMonth, rewardMonth: r.rewardMonth, rewardRates: r.rewardRates }))}
            showRates
          />

          {/* По периодам (если выбрано "Все периоды") */}
          {!selectedPeriod && report.byPeriod.length > 1 && (
            <ReportTable
              title="По периодам"
              rows={report.byPeriod.map(r => ({ label: periodLabel(r.period), subscribers: r.subscribers, activated: r.activated, chargesMonth: r.chargesMonth, rewardMonth: r.rewardMonth }))}
            />
          )}

          {/* Пусто */}
          {report.totals.subscribers === 0 && (
            <div className="text-center py-16 text-sm text-zinc-500 dark:text-zinc-400">
              Нет данных. Загрузите xlsx-отчёт МегаФон.
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ===================== Таблица отчёта =====================

function ReportTable({ title, rows, showRates }: {
  title: string
  rows: Array<{ label: string; subscribers: number; activated: number; chargesMonth: number; rewardMonth: number; rewardRates?: string | null }>
  showRates?: boolean
}) {
  if (rows.length === 0) return null

  const totalSubs      = rows.reduce((s, r) => s + r.subscribers, 0)
  const totalActivated = rows.reduce((s, r) => s + r.activated, 0)
  const totalCharges   = rows.reduce((s, r) => s + r.chargesMonth, 0)
  const totalReward    = rows.reduce((s, r) => s + r.rewardMonth, 0)

  return (
    <div className="mb-6">
      <h2 className="text-base font-semibold mb-3">{title}</h2>
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="border-collapse w-full">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-zinc-50 dark:bg-zinc-900 border-b border-r border-zinc-200 dark:border-zinc-800 px-4 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 h-10">
                  Название
                </th>
                <th className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 h-10 w-28">
                  Абонентов
                </th>
                <th className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 h-10 w-28">
                  Подключено
                </th>
                <th className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 h-10 w-36">
                  Начисления
                </th>
                <th className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 h-10 w-36">
                  Вознаграждение
                </th>
                {showRates && (
                  <th className="border-b border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 h-10 w-24">
                    Ставка
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.label} className="border-b border-zinc-200 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 group">
                  <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/40 border-r border-zinc-200 dark:border-zinc-800 px-4 transition-colors">
                    <div className="h-[36px] flex items-center text-[13px] text-zinc-900 dark:text-zinc-100 truncate">
                      {r.label}
                    </div>
                  </td>
                  <td className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right">
                    <div className="h-[36px] flex items-center justify-end text-[12px] font-semibold text-zinc-700 dark:text-zinc-300">
                      {r.subscribers.toLocaleString('ru-RU')}
                    </div>
                  </td>
                  <td className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right">
                    <div className="h-[36px] flex items-center justify-end text-[12px] font-semibold text-blue-600 dark:text-blue-400">
                      {r.activated.toLocaleString('ru-RU')}
                    </div>
                  </td>
                  <td className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right">
                    <div className="h-[36px] flex items-center justify-end text-[12px] font-semibold text-zinc-700 dark:text-zinc-300">
                      {fmt(r.chargesMonth)}
                    </div>
                  </td>
                  <td className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right">
                    <div className="h-[36px] flex items-center justify-end text-[12px] font-semibold text-emerald-700 dark:text-emerald-300">
                      {fmt(r.rewardMonth)}
                    </div>
                  </td>
                  {showRates && (
                    <td className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right">
                      <div className="h-[36px] flex items-center justify-end text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                        {r.rewardRates ? `${r.rewardRates}%` : '—'}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {/* Итого */}
              <tr className="border-t-2 border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80">
                <td className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-900/80 border-r border-zinc-200 dark:border-zinc-800 px-4">
                  <div className="h-[36px] flex items-center text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">Итого</div>
                </td>
                <td className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right">
                  <div className="h-[36px] flex items-center justify-end text-[12px] font-bold text-zinc-900 dark:text-zinc-100">
                    {totalSubs.toLocaleString('ru-RU')}
                  </div>
                </td>
                <td className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right">
                  <div className="h-[36px] flex items-center justify-end text-[12px] font-bold text-blue-600 dark:text-blue-400">
                    {totalActivated.toLocaleString('ru-RU')}
                  </div>
                </td>
                <td className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right">
                  <div className="h-[36px] flex items-center justify-end text-[12px] font-bold text-zinc-900 dark:text-zinc-100">
                    {fmt(totalCharges)}
                  </div>
                </td>
                <td className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right">
                  <div className="h-[36px] flex items-center justify-end text-[12px] font-bold text-emerald-600 dark:text-emerald-400">
                    {fmt(totalReward)}
                  </div>
                </td>
                {showRates && (
                  <td className="border-l border-zinc-200 dark:border-zinc-800 px-4 text-right">
                    <div className="h-[36px]" />
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

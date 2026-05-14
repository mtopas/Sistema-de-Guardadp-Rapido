import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import { FINANZAS, fmtARS } from '../../data/finanzas'
import CardHeader from './CardHeader'

export default function IncomeExpenseCard() {
  const lang = useStore(s => s.lang)
  const { ingresosMes, gastosMes, tasaAhorro, mes } = FINANZAS
  const max = Math.max(ingresosMes, gastosMes)
  const ahorro = ingresosMes - gastosMes
  const C = 264 // 2π·42, matches r=42 below

  return (
    <div className="panel-strong p-5 col-span-2">
      <CardHeader
        title={`${mes} · ${t(lang, 'incomeLabel')} vs ${t(lang, 'expenseLabel')}`}
        subtitle={t(lang, 'monthlyFlow')}
        action={
          <>
            <button className="icon-btn-fin" aria-label="prev"><ChevronLeft size={13} /></button>
            <button className="icon-btn-fin" aria-label="next"><ChevronRight size={13} /></button>
          </>
        }
      />

      <div className="grid grid-cols-[1fr_auto] gap-6 items-center">
        <div className="flex flex-col gap-3">
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[12px] font-medium flex items-center gap-1.5" style={{ color: 'var(--income)' }}>
                <ArrowDown size={11} strokeWidth={2.5} /> {t(lang, 'incomeLabel')}
              </span>
              <span className="text-[14px] font-semibold tnum" style={{ color: 'var(--text)' }}>
                {fmtARS(ingresosMes)}
              </span>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--surface)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(ingresosMes / max) * 100}%`,
                  background: 'linear-gradient(90deg, var(--income), color-mix(in oklch, var(--income) 60%, white 30%))',
                }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[12px] font-medium flex items-center gap-1.5" style={{ color: 'var(--expense)' }}>
                <ArrowUp size={11} strokeWidth={2.5} /> {t(lang, 'expenseLabel')}
              </span>
              <span className="text-[14px] font-semibold tnum" style={{ color: 'var(--text)' }}>
                {fmtARS(gastosMes)}
              </span>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--surface)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(gastosMes / max) * 100}%`,
                  background: 'linear-gradient(90deg, var(--expense), color-mix(in oklch, var(--expense) 60%, white 30%))',
                }}
              />
            </div>
          </div>

          <div className="text-[11.5px]" style={{ color: 'var(--subtext)' }}>
            {t(lang, 'youSave')}{' '}
            <span className="font-semibold tnum" style={{ color: 'var(--text)' }}>
              {fmtARS(ahorro)}
            </span>{' '}
            — {t(lang, 'bestSixMonths')}
          </div>
        </div>

        <div className="grid place-items-center">
          <div className="relative w-[120px] h-[120px] grid place-items-center">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <defs>
                <linearGradient id="sav" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" />
                  <stop offset="100%" stopColor="var(--accent-light)" />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--surface)" strokeWidth="10" />
              <circle
                cx="50" cy="50" r="42" fill="none" stroke="url(#sav)" strokeWidth="10"
                strokeDasharray={`${(tasaAhorro / 100) * C} ${C}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-center">
                <div className="text-[24px] serif italic font-semibold tnum gradient-text leading-none">
                  {tasaAhorro}%
                </div>
                <div className="text-[10px] mt-1" style={{ color: 'var(--subtext)' }}>
                  {t(lang, 'saveRateLabel')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

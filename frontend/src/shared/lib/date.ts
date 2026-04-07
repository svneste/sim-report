export const MONTH_NAMES_NOM = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

export const DAY_NAMES_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

export function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate()
}

export function dayOfWeekMon0(year: number, month0: number, day: number): number {
  return (new Date(year, month0, day).getDay() + 6) % 7
}

export function dateKey(year: number, month1: number, day: number): string {
  return `${year}-${String(month1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

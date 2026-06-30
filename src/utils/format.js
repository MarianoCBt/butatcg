import { config } from '../config'

export function formatMoney(value) {
  const n = Number(value) || 0
  return new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

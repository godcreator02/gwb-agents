import { calcTotal } from './pricing.js'

export function invoiceLine(order) {
  return `${order.id}: ${calcTotal(order.items).toFixed(2)}`
}

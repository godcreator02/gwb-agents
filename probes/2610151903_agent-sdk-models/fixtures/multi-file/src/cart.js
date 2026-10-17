import { calcTotal } from './pricing.js'

export function cartSummary(cart) {
  const count = cart.items.reduce((n, item) => n + item.qty, 0)
  return { count, total: calcTotal(cart.items) }
}

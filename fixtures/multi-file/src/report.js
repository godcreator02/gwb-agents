import * as pricing from './pricing.js'

// 每个客户的订单总额，用 calcTotal 算，不含税
export function totalsByCustomer(orders) {
  const totals = {}
  for (const order of orders) {
    totals[order.customer] = (totals[order.customer] ?? 0) + pricing.calcTotal(order.items)
  }
  return totals
}

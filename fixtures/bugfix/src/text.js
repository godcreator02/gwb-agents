// 只保留小写字母和数字，其余连续字符合并成一个 -，首尾不留 -
export function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '-')
}

// 结果总长度不超过 maxLength，省略号 … 也算一个字符
export function truncate(text, maxLength) {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '…'
}

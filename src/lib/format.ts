/** 分 → 元（两位小数）。金额全链路都是整数分，只有展示时才转成元。 */
export function fenToYuan(fen: number): string {
  const negative = fen < 0
  const abs = Math.abs(fen)
  const text = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
  return negative ? `-${text}` : text
}

/**
 * 带 ¥ 前缀的金额。负号放在货币符号前（-¥6.00）：记账流水里的退款是负数，
 * "¥-6.00" 读起来容易看成笔误。
 */
export function money(fen: number): string {
  const text = `¥${fenToYuan(Math.abs(fen))}`
  return fen < 0 ? `-${text}` : text
}

/** 字节数转可读体积。 */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/** unix 秒 → 本地时间字符串。 */
export function dateTime(seconds: number): string {
  if (!seconds) return '—'
  const d = new Date(seconds * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`
}

export function dateOnly(seconds: number): string {
  if (!seconds) return '—'
  const d = new Date(seconds * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 剩余秒数 → 倒计时文案。 */
export function countdown(seconds: number): string {
  if (seconds <= 0) return '已超时'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m <= 0) return `${s} 秒`
  return `${m} 分 ${String(s).padStart(2, '0')} 秒`
}

/** 相对时间，用于"最近活跃"这类展示。 */
export function relativeTime(seconds: number): string {
  if (!seconds) return '—'
  const diff = Math.floor(Date.now() / 1000) - seconds
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`
  return dateOnly(seconds)
}

/** 纸张规格 → 展示文案。 */
export function paperLabel(size: string): string {
  switch (size) {
    case 'A4':
      return 'A4（210×297mm）'
    case 'A5':
      return 'A5（148×210mm）'
    case 'A3':
      return 'A3（297×420mm）'
    case 'Letter':
      return 'Letter（8.5×11in）'
    default:
      return size
  }
}

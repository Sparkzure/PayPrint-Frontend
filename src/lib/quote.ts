/**
 * 客户端计价预览。
 *
 * 注意：这里的数字只用于"下单前给用户看"，真正的金额由服务端算并在订单里固化。
 * 因此这一段必须与服务端 domain.Quote 保持同一口径，否则会出现
 * "界面显示 3 元、下单后变 3.5 元"这种最伤信任的体验。
 * 口径一旦调整，两边都要改（服务端有对应的单元测试兜底）。
 */

import type { PageRange, PrintParams, PrinterView } from './types'

export interface QuotePreview {
  /** 选中并生效的页数。 */
  pages: number
  /** 每份要打印的面数（拼版后）。 */
  sidesPerCopy: number
  /** 每份消耗的纸张数（仅展示用）。 */
  sheetsPerCopy: number
  copies: number
  unitFen: number
  totalFen: number
  ranges: PageRange[]
  /** 非空表示参数有问题，此时不应允许下单。 */
  error?: string
}

export function defaultPrintParams(): PrintParams {
  return {
    copies: 1,
    duplex: 'one_sided',
    color_mode: 'monochrome',
    paper_size: 'A4',
    page_range: '',
    n_up: 1,
    orientation: 'portrait',
    quality: 'normal',
    fit_to_page: true,
  }
}

/**
 * 解析页范围，语义与服务端 ParsePageRange 一致：
 *  - 空串表示全部页
 *  - 支持 "3" / "2-5" / "8-"
 *  - 合并去重后压缩成连续区间
 *  - 完全越界视为错误
 */
export function parsePageRange(spec: string, total: number): { ranges: PageRange[]; error?: string } {
  const trimmed = spec.trim()
  if (trimmed === '') {
    if (total <= 0) {
      return { ranges: [], error: '无法确定文件页数，请指定打印页范围' }
    }
    return { ranges: [{ from: 1, to: total }] }
  }

  const pages = new Set<number>()

  for (const rawPart of trimmed.split(',')) {
    const part = rawPart.trim()
    if (part === '') continue

    if (part.startsWith('-')) {
      return { ranges: [], error: `页范围格式不正确：${part}` }
    }

    if (!part.includes('-')) {
      const n = Number(part)
      if (!Number.isInteger(n) || n < 1) {
        return { ranges: [], error: `页范围格式不正确：${part}` }
      }
      if (total <= 0 || n <= total) pages.add(n)
      continue
    }

    const [fromText = '', toText = ''] = part.split('-', 2)
    let from = 1
    if (fromText.trim() !== '') {
      const n = Number(fromText.trim())
      if (!Number.isInteger(n) || n < 1) {
        return { ranges: [], error: `页范围格式不正确：${part}` }
      }
      from = n
    }

    let to: number
    if (toText.trim() !== '') {
      const n = Number(toText.trim())
      if (!Number.isInteger(n) || n < 1) {
        return { ranges: [], error: `页范围格式不正确：${part}` }
      }
      to = n
    } else if (total > 0) {
      to = total
    } else {
      return { ranges: [], error: '无法确定文件页数，请给出明确的页范围上界' }
    }

    if (total > 0 && to > total) to = total
    for (let p = from; p <= to; p += 1) pages.add(p)
  }

  if (pages.size === 0) {
    return { ranges: [], error: '页范围选择结果为空' }
  }

  const sorted = [...pages].sort((a, b) => a - b)
  const ranges: PageRange[] = []
  const first = sorted[0]
  if (first === undefined) return { ranges: [], error: '页范围选择结果为空' }

  let current: PageRange = { from: first, to: first }
  for (const page of sorted.slice(1)) {
    if (page === current.to + 1) {
      current.to = page
    } else {
      ranges.push(current)
      current = { from: page, to: page }
    }
  }
  ranges.push(current)

  return { ranges }
}

export function quotePreview(
  params: PrintParams,
  pageCount: number,
  printer:
    | Pick<
        PrinterView,
        | 'price_single_bw_fen'
        | 'price_single_color_fen'
        | 'price_duplex_bw_fen'
        | 'price_duplex_color_fen'
      >
    | undefined,
): QuotePreview {
  const empty: QuotePreview = {
    pages: 0,
    sidesPerCopy: 0,
    sheetsPerCopy: 0,
    copies: params.copies,
    unitFen: 0,
    totalFen: 0,
    ranges: [],
  }

  if (!printer) return { ...empty, error: '请先选择打印机' }
  if (pageCount <= 0) return { ...empty, error: '请先上传文件' }

  const parsed = parsePageRange(params.page_range, pageCount)
  if (parsed.error) return { ...empty, error: parsed.error }

  const pages = parsed.ranges.reduce((sum, r) => sum + (r.to - r.from + 1), 0)
  if (pages <= 0) return { ...empty, error: '页范围选择结果为空' }

  const nUp = params.n_up > 0 ? params.n_up : 1
  const sidesPerCopy = Math.max(1, Math.ceil(pages / nUp))
  const duplexed = params.duplex !== 'one_sided'
  const sheetsPerCopy = duplexed ? Math.ceil(sidesPerCopy / 2) : sidesPerCopy

  // 单价按「张」计，随规格（单双面 × 黑白彩色）取四档之一。
  const unitFen = duplexed
    ? params.color_mode === 'color'
      ? printer.price_duplex_color_fen
      : printer.price_duplex_bw_fen
    : params.color_mode === 'color'
      ? printer.price_single_color_fen
      : printer.price_single_bw_fen
  const copies = params.copies > 0 ? params.copies : 1

  // 与服务端 domain.Quote 同口径：金额 = 每张单价 × 每份张数 × 份数。
  return {
    pages,
    sidesPerCopy,
    sheetsPerCopy,
    copies,
    unitFen,
    totalFen: unitFen * sheetsPerCopy * copies,
    ranges: parsed.ranges,
  }
}

/** 渲染页范围，用于"已选 1-3, 7"这类说明。 */
export function formatRanges(ranges: PageRange[]): string {
  return ranges.map((r) => (r.from === r.to ? String(r.from) : `${r.from}-${r.to}`)).join(', ')
}

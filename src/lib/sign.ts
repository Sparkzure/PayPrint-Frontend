/**
 * 设备请求签名协议（纯函数，无任何依赖）。
 *
 * 单独抽出来的原因有两个：
 *  1. 这是前后端最容易对不齐的地方，独立成模块便于逐条比对；
 *  2. 它不依赖 DOM / IndexedDB，因此可以被 Node 脚本直接导入，
 *     用来对着真实服务端跑一遍联调自检（见 web/scripts/smoke.mjs）。
 *
 * 明文格式（7 行，\n 连接，最后一行不带换行），必须与服务端
 * internal/auth/signature.go 的 CanonicalString 完全一致：
 *
 *   payprint/v1
 *   <METHOD 大写>
 *   <路径，不含 query>
 *   <规范化 query>
 *   <unix 秒级时间戳>
 *   <nonce>
 *   <请求体 SHA-256 十六进制小写>
 */

export const SIGN_SCHEME = 'payprint/v1'

export function canonicalString(
  method: string,
  path: string,
  query: string,
  timestamp: number,
  nonce: string,
  bodyHashHex: string,
): string {
  return [
    SIGN_SCHEME,
    method.toUpperCase(),
    path,
    query,
    String(timestamp),
    nonce,
    bodyHashHex.toLowerCase(),
  ].join('\n')
}

/**
 * 按 Go url.QueryEscape 的规则转义。
 *
 * 不能用 encodeURIComponent：两者对 `!`、`'`、`(`、`)`、`*`、`~`
 * 的处理不同，会导致一端转义、另一端不转义，签名对不上。
 */
export function goQueryEscape(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let out = ''
  for (const b of bytes) {
    const isUnreserved =
      (b >= 0x41 && b <= 0x5a) || // A-Z
      (b >= 0x61 && b <= 0x7a) || // a-z
      (b >= 0x30 && b <= 0x39) || // 0-9
      b === 0x2d || // -
      b === 0x5f || // _
      b === 0x2e || // .
      b === 0x7e // ~
    if (isUnreserved) {
      out += String.fromCharCode(b)
    } else if (b === 0x20) {
      out += '+'
    } else {
      out += `%${b.toString(16).toUpperCase().padStart(2, '0')}`
    }
  }
  return out
}

/** 键升序、同键值升序的规范化 query。 */
export function canonicalQuery(pairs: Array<[string, string]>): string {
  const sorted = [...pairs].sort((a, b) => {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1
    if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1
    return 0
  })
  return sorted.map(([key, value]) => `${goQueryEscape(key)}=${goQueryEscape(value)}`).join('&')
}

/** 把 query 对象规范化成可直接拼进 URL 且与签名一致的形式。 */
export function buildQuery(query?: Record<string, string | number | boolean | undefined>): string {
  const pairs: Array<[string, string]> = Object.entries(query ?? {})
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => [key, String(value)] as [string, string])
  return canonicalQuery(pairs)
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data.slice())
  return toHex(new Uint8Array(digest))
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

export function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

/** 生成 24 字节随机 nonce（base64）。 */
export function newNonce(): string {
  const buf = new Uint8Array(24)
  crypto.getRandomValues(buf)
  return toBase64(buf)
}

/**
 * API 客户端。
 *
 * 两个关键点：
 *  1. 请求体必须先序列化成字节，再用同一份字节算摘要并签名，最后原样发出去。
 *     任何"签名用一份、发送用另一份"的写法都会导致偶发验签失败。
 *  2. query 必须按 Go 的 url.QueryEscape 规则转义并排序，否则服务端规范化出的
 *     明文与客户端签的明文不一致（Go 的转义集合与 encodeURIComponent 不同）。
 */

import { getDeviceIdentity } from './device'
import {
  buildQuery,
  canonicalString,
  newNonce,
  sha256Hex,
  toHex,
} from './sign'
import type {
  AuthResponse,
  DataResponse,
  DeviceView,
  LedgerResponse,
  ListResponse,
  MeResponse,
  MetaResponse,
  OrderView,
  PaymentResult,
  PrintFileView,
  PrinterView,
  PrintParams,
} from './types'

const TOKEN_STORAGE_KEY = 'payprint.token'
const APP_VERSION = '0.1.0'

/** ApiError 携带后端稳定的错误码，便于界面按码分支（例如引导人工解绑）。 */
export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }

  /** 是否为网络层失败（后端不可达），用于提示"检查服务是否启动"。 */
  get isNetworkError(): boolean {
    return this.status === 0
  }
}

// 令牌在内存里也留一份副本。隐私模式下 localStorage 可能写不进去，只靠它就会出现
// "登录成功"与"读到登录态"对不上：刚登录就被判定为未登录，登录页又把你弹回首页，
// 两边来回跳。下面那句"仅本次会话有效"就是靠这份内存副本落实的。
let memoryToken: string | null = null

/**
 * 是否为"登录态已失效"（需要重新登录）。
 *
 * 401 与 403 都算：设备被解绑、账号被停用返回的都是 403，对使用者来说
 * 与"登录过期"是同一件事，都得重新登录。两个守卫（用户端与管理面板）
 * 共用这一处判定，避免一边算失效、另一边不算。
 */
export function isAuthExpired(error: unknown): boolean {
  const status = (error as { status?: number } | undefined)?.status ?? 0
  return status === 401 || status === 403
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) ?? memoryToken
  } catch {
    return memoryToken
  }
}

export function setToken(token: string | null): void {
  memoryToken = token
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token)
    else localStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    /* 隐私模式下 localStorage 不可写：只留内存副本，本次会话内仍然可用 */
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  query?: Record<string, string | number | boolean | undefined>
  json?: unknown
  form?: FormData
  /** 默认携带 Bearer；设为 false 用于公开接口。 */
  auth?: boolean
  /**
   * 是否附加设备签名头。
   *
   * 只有注册与登录需要它：那两道门在生产"这台设备属于哪个账号"。其余接口
   * （下单、取消、确认打印、到账上报、上传……）的身份都是账号会话，设备不参与，
   * 因此不再签名（multipart 上传本来也无法签名）。
   */
  sign?: boolean
}

type Root<T> = DataResponse<T>

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'

  const query = buildQuery(options.query)
  const url = query ? `${path}?${query}` : path

  const headers = new Headers()
  let body: BodyInit | undefined
  let bodyBytes = new Uint8Array(0)

  if (options.form) {
    body = options.form
    // 不设置 Content-Type：必须让浏览器自己补 boundary。
  } else if (options.json !== undefined) {
    const text = JSON.stringify(options.json)
    // 与签名共用同一份字节。
    bodyBytes = new TextEncoder().encode(text)
    body = bodyBytes
    headers.set('Content-Type', 'application/json')
  }

  if (options.auth !== false) {
    const token = getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  if (options.sign) {
    await attachSignature(headers, method, path, query, bodyBytes)
  }

  let response: Response
  try {
    response = await fetch(url, { method, headers, body })
  } catch (error) {
    throw new ApiError(
      'network_error',
      `无法连接服务：${error instanceof Error ? error.message : String(error)}`,
      0,
    )
  }

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const errorBody = extractError(payload)
    throw new ApiError(
      errorBody.code,
      errorBody.message || `请求失败（HTTP ${response.status}）`,
      response.status,
    )
  }

  if (!payload || typeof payload !== 'object') {
    // 接口一律返回 JSON 对象；解析不出对象说明这个响应不是本 API 的。
    throw new ApiError('bad_response', '服务端返回了无法解析的内容', response.status)
  }
  return payload as T
}

async function attachSignature(
  headers: Headers,
  method: string,
  path: string,
  query: string,
  bodyBytes: Uint8Array,
): Promise<void> {
  const identity = await getDeviceIdentity()

  const timestamp = Math.floor(Date.now() / 1000)
  const nonce = newNonce()
  const bodyHash = await sha256Hex(bodyBytes)
  const canonical = canonicalString(method, path, query, timestamp, nonce, bodyHash)

  const signature = await identity.sign(new TextEncoder().encode(canonical))

  headers.set('X-Device-Fingerprint', identity.fingerprint)
  headers.set('X-Device-Timestamp', String(timestamp))
  headers.set('X-Device-Nonce', nonce)
  headers.set('X-Device-Signature', signature)
  headers.set('X-Device-Public-Key', identity.publicKey)
  // 头字段只能承载 latin-1，设备名可能是中文，必须先百分号编码。
  // 服务端在 decodeHeaderValue 里还原。
  headers.set('X-Device-Platform', encodeHeaderValue(platformLabel()))
  headers.set('X-Device-App-Version', APP_VERSION)
  headers.set('X-Device-Label', encodeHeaderValue(deviceLabel()))
}

function encodeHeaderValue(value: string): string {
  return encodeURIComponent(value)
}

function extractError(payload: unknown): { code: string; message: string } {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error?: unknown }).error
    if (error && typeof error === 'object') {
      const code = (error as { code?: unknown }).code
      const message = (error as { message?: unknown }).message
      return {
        code: typeof code === 'string' ? code : 'unknown_error',
        message: typeof message === 'string' ? message : '',
      }
    }
  }
  return { code: 'unknown_error', message: '' }
}

function platformLabel(): string {
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return 'web/android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'web/ios'
  return 'web/desktop'
}

function deviceLabel(): string {
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return '安卓浏览器'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS 浏览器'
  if (/Edg\//.test(ua)) return 'Edge 浏览器'
  if (/Chrome\//.test(ua)) return 'Chrome 浏览器'
  if (/Firefox\//.test(ua)) return 'Firefox 浏览器'
  if (/Safari\//.test(ua)) return 'Safari 浏览器'
  return '浏览器'
}

// ---------- 具体接口 ----------

export interface RegisterPayload {
  username: string
  password: string
}

export interface CreateOrderPayload {
  file_id: string
  printer_id: string
  title?: string
  params: PrintParams
}

/**
 * 取上传原件的二进制，用于**打印预览**。
 *
 * 与 request() 不同：这条接口返回文件流（不是 JSON 信封），而且必须带 Bearer 令牌，
 * 所以不能用 `<iframe src="/api/v1/files/...">` 直接引用，只能先 fetch 成 Blob，
 * 再由调用方转成 object URL 交给 iframe。
 */
export async function fetchFileContent(fileId: string): Promise<Blob> {
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(`/api/v1/files/${encodeURIComponent(fileId)}/content`, { headers })
  } catch (error) {
    throw new ApiError(
      'network_error',
      `无法连接服务：${error instanceof Error ? error.message : String(error)}`,
      0,
    )
  }

  if (!response.ok) {
    const text = await response.text()
    let payload: unknown = null
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = null
      }
    }
    const detail = extractError(payload)
    throw new ApiError(
      detail.code,
      detail.message || `预览加载失败（HTTP ${response.status}）`,
      response.status,
    )
  }
  return response.blob()
}

export const api = {
  meta: () => request<Root<MetaResponse>>('/api/v1/meta').then((r) => r.data),

  register: (payload: RegisterPayload) =>
    request<Root<AuthResponse>>('/api/v1/auth/register', {
      method: 'POST',
      json: payload,
      auth: false,
      sign: true,
    }).then((r) => r.data),

  login: (username: string, password: string) =>
    request<Root<AuthResponse>>('/api/v1/auth/login', {
      method: 'POST',
      json: { username, password },
      auth: false,
      sign: true,
    }).then((r) => r.data),

  // 登出是会话操作：身份就是那条会话，不需要设备签名。
  logout: () =>
    request<Root<{ ok: boolean }>>('/api/v1/auth/logout', {
      method: 'POST',
    }).then((r) => r.data),

  me: () => request<Root<MeResponse>>('/api/v1/me').then((r) => r.data),

  ledger: (limit = 50) =>
    request<Root<LedgerResponse>>('/api/v1/ledger', { query: { limit } }).then((r) => r.data),

  devices: () => request<ListResponse<DeviceView>>('/api/v1/devices').then((r) => r.data),

  // 用户自助解绑已移除：解绑只能由管理员在管理面板执行。

  printers: (withLive = false) =>
    request<ListResponse<PrinterView>>('/api/v1/printers', {
      query: { live: withLive ? 'true' : undefined },
    }).then((r) => r.data),

  files: (limit = 20) =>
    request<ListResponse<PrintFileView>>('/api/v1/files', { query: { limit } }).then((r) => r.data),

  uploadFile: (file: File, pageCountHint?: number) => {
    const form = new FormData()
    form.append('file', file, file.name)
    if (pageCountHint && pageCountHint > 0) form.append('page_count', String(pageCountHint))
    // 上传不签名：body 是可观的几十 MB，为了摘要把它整块读进内存不划算，
    // 该接口改为只依赖会话鉴权（文件本身也只对该账号可见）。
    return request<Root<PrintFileView>>('/api/v1/files', {
      method: 'POST',
      form,
      sign: false,
    }).then((r) => r.data)
  },

  // 下单：身份是账号会话，订单挂在账号上（哪台设备下的单只进审计快照）。
  createOrder: (payload: CreateOrderPayload) =>
    request<Root<OrderView>>('/api/v1/orders', {
      method: 'POST',
      json: payload,
    }).then((r) => r.data),

  orders: (limit = 20, offset = 0) =>
    request<ListResponse<OrderView>>('/api/v1/orders', { query: { limit, offset } }),

  order: (orderId: string) =>
    request<Root<OrderView>>(`/api/v1/orders/${encodeURIComponent(orderId)}`).then((r) => r.data),

  cancelOrder: (orderId: string) =>
    request<Root<{ ok: boolean }>>(`/api/v1/orders/${encodeURIComponent(orderId)}/cancel`, {
      method: 'POST',
    }).then((r) => r.data),

  /**
   * 确认打印：唯一能让打印机出纸的用户动作。
   *
   * 服务端会再校验一遍归属（按账号）、订单状态、确认时限、打印机可用性与支付核验，
   * 所以这里不需要（也不能）由前端做任何额外判断。同一账号换一台设备也能确认。
   */
  releaseOrder: (orderId: string) =>
    request<Root<OrderView>>(`/api/v1/orders/${encodeURIComponent(orderId)}/print`, {
      method: 'POST',
    }).then((r) => r.data),

  /**
   * 上报支付。
   *
   * 浏览器无法监听微信收款通知，正式链路里这个接口由现场的"收款设备"调用
   * （它只报金额与时间，由服务端按打印机 + 金额 + 时间匹配订单）。
   * 保留它是为了在浏览器里也能跑通"下单 → 支付 → 打印"以便联调与验收。
   *
   * 身份是账号会话：到账挂在账号上，服务端按 order.user_id 判归属。
   * body 里的 timestamp/nonce 只用于留痕与幂等。
   */
  reportPayment: (payload: {
    eventId: string
    orderNo: string
    amountFen: number
    channel?: string
    outTradeNo?: string
  }) =>
    request<Root<PaymentResult>>('/api/v1/payment/report', {
      method: 'POST',
      query: { source: 'wechat_android' },
      json: {
        event_id: payload.eventId,
        channel: payload.channel ?? 'wechat',
        order_no: payload.orderNo,
        out_trade_no: payload.outTradeNo ?? payload.eventId,
        amount_fen: payload.amountFen,
        paid_at: Math.floor(Date.now() / 1000),
        timestamp: Math.floor(Date.now() / 1000),
        nonce: payload.eventId,
      },
    }).then((r) => r.data),
}

/** 生成一个客户端事件 ID（幂等键）。 */
export function newEventId(): string {
  const buf = new Uint8Array(12)
  crypto.getRandomValues(buf)
  return `web-${Date.now().toString(36)}-${toHex(buf)}`
}

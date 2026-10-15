/**
 * 管理面板的 API 客户端。
 *
 * 与 `lib/api.ts` 的关键区别：**不带设备签名，也不带任何设备信息**。
 * 管理员登录不受设备限制，身份就是一含 Bearer 令牌，把设备密钥那套机制拖进来，
 * 只会制造"换台电脑就进不去"。
 *
 * 令牌单独存一个键：同一个人可能既在用户端登录、又在面板里登录，两边互不干扰
 * （后端也会把管理员账号挡在消费端之外，见 requireConsumer）。
 */

import { ApiError } from './api'
import type {
  AdminLoginResponse,
  AdminMeResponse,
  AdminStatsResponse,
  CollectorView,
  DataResponse,
  DeletePrinterResult,
  DeviceView,
  IssuedCollectorView,
  ListResponse,
  OnlineWindow,
  OrderAuditView,
  OrderView,
  PrinterLiveView,
  PrinterView,
  SettingView,
  UserView,
} from './types'

/** 待应用的还原备份信息。 */
export interface StagedRestoreInfo {
  staged: boolean
  migration_version?: number
  created_at?: number
  files?: number
  hint?: string
}

const ADMIN_TOKEN_KEY = 'payprint.admin.token'

// 内存副本的理由与用户端一致：隐私模式下 localStorage 可能写不进去，只靠它会让
// "登录成功"与"读到登录态"对不上，登录页与面板互相弹来弹去。
let memoryToken: string | null = null

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY) ?? memoryToken
  } catch {
    return memoryToken
  }
}

export function setAdminToken(token: string | null): void {
  memoryToken = token
  try {
    if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token)
    else localStorage.removeItem(ADMIN_TOKEN_KEY)
  } catch {
    /* 隐私模式下 localStorage 不可写：只留内存副本，本次会话内仍可用 */
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  query?: Record<string, string | number | boolean | undefined>
  json?: unknown
}

/**
 * 发一次管理请求。
 *
 * query 用 URLSearchParams 拼即可：管理接口**不签名**，所以不需要像用户端那样
 * 按 Go 的转义规则逐字节对齐规范化明文。
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined) continue
    params.set(key, String(value))
  }
  const query = params.toString()
  const url = query ? `${path}?${query}` : path

  const headers = new Headers()
  let body: BodyInit | undefined
  if (options.json !== undefined) {
    body = JSON.stringify(options.json)
    headers.set('Content-Type', 'application/json')
  }
  const token = getAdminToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

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
    const detail = extractError(payload)
    throw new ApiError(
      detail.code,
      detail.message || `请求失败（HTTP ${response.status}）`,
      response.status,
    )
  }
  if (!payload || typeof payload !== 'object') {
    throw new ApiError('bad_response', '服务端返回了无法解析的内容', response.status)
  }
  return payload as T
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

// ---------- 文件类的两个操作：导出下载与还原上传 ----------

/**
 * 下载一个"文件流"接口的响应（备份 zip、审计日志 CSV 都走它）。
 *
 * 必须用 fetch 而不是 `<a href>`：管理接口要带 Bearer 令牌，浏览器原生的
 * 下载链接带不上。响应体直接转成 blob 触发"另存为"。
 */
async function downloadFile(path: string, fallbackName: string): Promise<string> {
  const headers = new Headers()
  const token = getAdminToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(path, { headers })
  if (!response.ok) {
    const text = await response.text()
    let payload: unknown = null
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
    const detail = extractError(payload)
    throw new ApiError(detail.code, detail.message || `导出失败（HTTP ${response.status}）`, response.status)
  }

  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const match = /filename="([^"]+)"/.exec(disposition)
  const filename = match?.[1] ?? fallbackName

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // 给浏览器一点时间真正开始下载，再回收这块内存。
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return filename
}

/** 下载整站备份（zip）。 */
export function downloadBackup(): Promise<string> {
  return downloadFile('/api/v1/admin/backup', 'payprint-backup.zip')
}

/**
 * 导出**全部**审计日志（CSV）。
 *
 * 由服务端生成并分页流式写出（见 handleAdminExportAudits），前端只管存下来。
 */
export function downloadAuditCSV(): Promise<string> {
  return downloadFile('/api/v1/admin/audits/export', 'order-audits.csv')
}

/**
 * 上传备份以进行还原。
 *
 * 上传成功只代表**校验通过并已暂存**，换装发生在服务重启之后；
 * 返回值里的 hint 就是给操作者看的说明。
 */
export async function restoreBackup(file: File): Promise<StagedRestoreInfo & { hint?: string }> {
  const form = new FormData()
  form.append('file', file)

  const headers = new Headers()
  const token = getAdminToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch('/api/v1/admin/restore', { method: 'POST', headers, body: form })
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
    const detail = extractError(payload)
    throw new ApiError(detail.code, detail.message || `还原失败（HTTP ${response.status}）`, response.status)
  }
  const data = (payload as { data?: StagedRestoreInfo & { hint?: string } })?.data
  if (!data) throw new ApiError('bad_response', '服务端返回了无法解析的内容', response.status)
  return data
}

export const adminApi = {
  login: (username: string, password: string) =>
    request<DataResponse<AdminLoginResponse>>('/api/v1/admin/login', {
      method: 'POST',
      json: { username, password },
    }).then((r) => r.data),

  logout: () =>
    request<DataResponse<{ ok: boolean }>>('/api/v1/admin/logout', {
      method: 'POST',
    }).then((r) => r.data),

  me: () => request<DataResponse<AdminMeResponse>>('/api/v1/admin/me').then((r) => r.data),

  stats: () => request<DataResponse<AdminStatsResponse>>('/api/v1/admin/stats').then((r) => r.data),

  orders: (limit = 50) =>
    request<ListResponse<OrderView>>('/api/v1/admin/orders', { query: { limit } }),

  refund: (orderID: string, reason: string) =>
    request<DataResponse<{ ok: boolean }>>(
      `/api/v1/admin/orders/${encodeURIComponent(orderID)}/refund`,
      { method: 'POST', json: { reason } },
    ).then((r) => r.data),

  retry: (orderID: string) =>
    request<DataResponse<{ ok: boolean }>>(
      `/api/v1/admin/orders/${encodeURIComponent(orderID)}/retry`,
      { method: 'POST' },
    ).then((r) => r.data),

  // 审计日志（订单日志）：只读预览。全部记录的导出走 downloadAuditCSV()。
  audits: (limit = 100, offset = 0) =>
    request<ListResponse<OrderAuditView>>('/api/v1/admin/audits', {
      query: { limit, offset },
    }),

  devices: (limit = 100) =>
    request<ListResponse<DeviceView>>('/api/v1/admin/devices', { query: { limit } }),

  releaseDevice: (deviceID: string, reason: string) =>
    request<DataResponse<{ ok: boolean }>>(
      `/api/v1/admin/devices/${encodeURIComponent(deviceID)}/release`,
      { method: 'POST', json: { reason } },
    ).then((r) => r.data),

  blockDevice: (deviceID: string, reason: string) =>
    request<DataResponse<{ ok: boolean }>>(
      `/api/v1/admin/devices/${encodeURIComponent(deviceID)}/block`,
      { method: 'POST', json: { reason } },
    ).then((r) => r.data),

  restoreDevice: (deviceID: string, reason: string) =>
    request<DataResponse<{ ok: boolean }>>(
      `/api/v1/admin/devices/${encodeURIComponent(deviceID)}/restore`,
      { method: 'POST', json: { reason } },
    ).then((r) => r.data),

  users: (limit = 200) =>
    request<ListResponse<UserView>>('/api/v1/admin/users', { query: { limit } }),

  createUser: (payload: {
    username: string
    password: string
    role?: string
  }) =>
    request<DataResponse<UserView>>('/api/v1/admin/users', {
      method: 'POST',
      json: payload,
    }).then((r) => r.data),

  printers: () => request<ListResponse<PrinterView>>('/api/v1/admin/printers'),

  createPrinter: (payload: {
    code: string
    name: string
    cups_uri: string
    location?: string
    status?: string
    price_single_bw_fen?: number
    price_single_color_fen?: number
    price_duplex_bw_fen?: number
    price_duplex_color_fen?: number
    supports_color?: boolean
    supports_duplex?: boolean
    paper_sizes?: string[]
    max_copies?: number
    /** 每周在线时段；空数组 = 全天在线（覆盖更新，清空也会写回 []）。 */
    online_windows?: OnlineWindow[]
  }) =>
    request<DataResponse<PrinterView>>('/api/v1/admin/printers', {
      method: 'POST',
      json: payload,
    }).then((r) => r.data),

  setPrinterStatus: (printerID: string, status: string) =>
    request<DataResponse<{ ok: boolean }>>(
      `/api/v1/admin/printers/${encodeURIComponent(printerID)}/status`,
      { method: 'POST', json: { status } },
    ).then((r) => r.data),

  /**
   * 级联硬删除一个打印机。
   *
   * **破坏性**：该打印机下的订单、任务、记账、到账事件、核验与收款凭据会被一并删除。
   * 面板上要求输入打印机编码二次确认，避免误删。
   */
  deletePrinter: (printerID: string, reason: string) =>
    request<DataResponse<DeletePrinterResult>>(
      `/api/v1/admin/printers/${encodeURIComponent(printerID)}`,
      { method: 'DELETE', json: { reason } },
    ).then((r) => r.data),

  collectors: (limit = 100) =>
    request<ListResponse<CollectorView>>('/api/v1/admin/collectors', { query: { limit } }),

  /** 签发收款凭据。响应里的 token 是明文令牌唯一一次出现的地方。 */
  issueCollector: (printerCode: string, label: string) =>
    request<DataResponse<IssuedCollectorView>>('/api/v1/admin/collectors', {
      method: 'POST',
      json: { printer_code: printerCode, label },
    }).then((r) => r.data),

  /** 打印机连通性探测。可以测一个还没保存的地址：改完先验，再决定要不要保存。 */
  probePrinter: (payload: { cups_uri?: string; printer_id?: string }) =>
    request<DataResponse<PrinterLiveView>>('/api/v1/admin/printers/probe', {
      method: 'POST',
      json: payload,
    }).then((r) => r.data),

  settings: () =>
    request<DataResponse<SettingView[]>>('/api/v1/admin/settings').then((r) => r.data),

  updateSettings: (set: Record<string, string>, reset: string[]) =>
    request<DataResponse<SettingView[]>>('/api/v1/admin/settings', {
      method: 'PUT',
      json: { set, reset },
    }).then((r) => r.data),

  banUser: (userID: string, reason: string) =>
    request<DataResponse<{ ok: boolean }>>(
      `/api/v1/admin/users/${encodeURIComponent(userID)}/ban`,
      { method: 'POST', json: { reason } },
    ).then((r) => r.data),

  unbanUser: (userID: string, reason: string) =>
    request<DataResponse<{ ok: boolean }>>(
      `/api/v1/admin/users/${encodeURIComponent(userID)}/unban`,
      { method: 'POST', json: { reason } },
    ).then((r) => r.data),

  /** 打开 / 关闭某个账号的免费打印（理由必填，会落在账号行上并记入进程日志）。 */
  setUserFreePrint: (userID: string, enabled: boolean, reason: string) =>
    request<DataResponse<UserView>>(
      `/api/v1/admin/users/${encodeURIComponent(userID)}/free-print`,
      { method: 'POST', json: { enabled, reason } },
    ).then((r) => r.data),

  stagedRestore: () =>
    request<DataResponse<StagedRestoreInfo>>('/api/v1/admin/restore/pending').then((r) => r.data),

  cancelRestore: () =>
    request<DataResponse<{ ok: boolean }>>('/api/v1/admin/restore/cancel', {
      method: 'POST',
    }).then((r) => r.data),

  revokeCollector: (collectorID: string, reason: string) =>
    request<DataResponse<{ ok: boolean }>>(
      `/api/v1/admin/collectors/${encodeURIComponent(collectorID)}`,
      { method: 'DELETE', json: { reason } },
    ).then((r) => r.data),

  /** 彻底删除一份收款设备凭据（硬删除）。与吊销分开。 */
  purgeCollector: (collectorID: string, reason: string) =>
    request<DataResponse<{ ok: boolean }>>(
      `/api/v1/admin/collectors/${encodeURIComponent(collectorID)}/purge`,
      { method: 'DELETE', json: { reason } },
    ).then((r) => r.data),
}

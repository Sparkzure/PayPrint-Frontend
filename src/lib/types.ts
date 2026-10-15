// 与后端 service 层的视图结构一一对应。
// 后端改动时这里要同步，类型不一致会在编译期暴露出来。

export type Tone = 'neutral' | 'primary' | 'success' | 'danger' | 'warning'

export interface UserView {
  id: string
  username: string
  role: string
  status: string
  status_text: string
  tone: Tone
  total_spent_fen: number
  created_at: number
  /** true 表示该账号的下单免支付，直接进入"待确认打印"。 */
  free_print: boolean
  /** 封禁信息只在账号被封禁时出现，账号列表直接展示"为什么"。 */
  ban_reason?: string
  banned_at?: number
  banned_by?: string
}

export interface DeviceView {
  id: string
  label: string
  platform: string
  app_version: string
  status: string
  status_text: string
  tone: Tone
  bound_at: number
  last_seen_at: number
  created_at: number
  current: boolean
  /** 设备归属的账号，只在管理面板的列表里填充。 */
  user_id?: string
  username?: string
}

export interface PrinterLiveView {
  reachable: boolean
  state: string
  state_reasons: string[] | null
  state_message: string
  accepting_jobs: boolean
  make_and_model: string
  error?: string
}

/** 打印机的一个每周在线时段。days 用 ISO 工作日编号（周一 = 1 ... 周日 = 7）。 */
export interface OnlineWindow {
  days: number[]
  /** HH:MM */
  start: string
  /** HH:MM；早于 start 表示跨过午夜 */
  end: string
}

export interface PrinterView {
  id: string
  code: string
  name: string
  location: string
  status: string
  status_text: string
  tone: Tone
  /** 单价按「张」计，四档规格各一价（单位：分）。 */
  price_single_bw_fen: number
  price_single_color_fen: number
  price_duplex_bw_fen: number
  price_duplex_color_fen: number
  price_single_bw_text: string
  price_single_color_text: string
  price_duplex_bw_text: string
  price_duplex_color_text: string
  supports_color: boolean
  supports_duplex: boolean
  paper_sizes: string[] | null
  max_copies: number
  /** 每周在线时段；空数组 = 全天在线。 */
  online_windows: OnlineWindow[] | null
  /** 时段文案，例如「周一至周五 08:00-22:00」或「全天在线」。 */
  online_windows_text: string
  /** 此刻是否落在线时段内。false 表示不能下单、不能确认打印。 */
  within_schedule: boolean
  live?: PrinterLiveView
  /** 打印机自己的 CUPS 地址。只有管理接口会返回它（消费端刻意不回显）。 */
  cups_uri?: string
}

export interface PrintFileView {
  id: string
  name: string
  content_type: string
  size_bytes: number
  page_count: number
  created_at: number
}

export type DuplexMode = 'one_sided' | 'long_edge' | 'short_edge'
export type ColorMode = 'monochrome' | 'color'
export type PaperSize = 'A4' | 'A5' | 'A3' | 'Letter'
export type Orientation = 'portrait' | 'landscape'
export type PrintQuality = 'draft' | 'normal' | 'high'

export interface PrintParams {
  copies: number
  duplex: DuplexMode
  color_mode: ColorMode
  paper_size: PaperSize
  page_range: string
  n_up: number
  orientation: Orientation
  quality: PrintQuality
  fit_to_page: boolean
}

export interface PageRange {
  from: number
  to: number
}

export interface CostBreakdown {
  unit_price_fen: number
  sides_per_copy: number
  sheets_per_copy: number
  copies: number
  pages_total: number
  total_fen: number
  currency: string
  color_mode: ColorMode
  n_up: number
  duplex: DuplexMode
  page_ranges: PageRange[]
  explanation: string
}

export interface OrderView {
  id: string
  order_no: string
  status: string
  status_text: string
  tone: Tone
  amount_fen: number
  amount_text: string
  currency: string
  title: string
  is_free: boolean

  printer_id: string
  printer_code: string
  printer_name: string
  printer_location: string

  /** 订单归属的账号，只在管理面板的列表里填充。 */
  user_id?: string
  username?: string

  file_id: string
  file_name: string
  file_page_count: number

  params?: PrintParams
  cost?: CostBreakdown

  job_status: string
  job_status_text: string
  job_tone: Tone
  job_state: string
  cups_job_id: number
  job_attempts: number
  job_error: string

  created_at: number
  updated_at: number
  expires_at: number
  paid_at: number
  completed_at: number
  close_reason: string

  // 三个动作由服务端判定，前端不自行推导状态机。
  // 互斥：待支付 → can_pay/can_cancel；待确认打印 → can_release。
  can_pay: boolean
  can_cancel: boolean
  can_release: boolean
  /** 倒计时：待支付 = 支付剩余；待确认打印 = 确认打印剩余。0 表示当前状态没有倒计时。 */
  remaining_seconds: number
  /** 仅在"确认打印"的响应里为 true。 */
  just_released?: boolean
}

export interface LedgerView {
  id: string
  order_id: string
  entry_type: string
  type_text: string
  tone: Tone
  amount_fen: number
  amount_text: string
  total_spent_fen: number
  channel: string
  memo: string
  created_at: number
}

export interface LedgerResponse {
  total_spent_fen: number
  entries: LedgerView[]
}

export interface AuthResponse {
  token: string
  expires_at: number
  user: UserView
  /**
   * 只在 bootstrap 注册出管理员时整体缺席：管理员不占设备（见后端
   * `AuthService.Register`），那条会话本来也没有 device_id。
   */
  device?: DeviceView
}

export interface MeResponse {
  user: UserView
  device: DeviceView
  total_spent_fen: number
  payment: {
    report_path: string
    report_source: string
    channels: string[]
  }
}

export interface ParamOption {
  value: string
  label: string
}

export interface StatusOption {
  value: string
  label: string
  tone: Tone
}

export interface MetaResponse {
  app: string
  registration_open: boolean
  /**
   * 打印放行策略。
   *
   * auto_release_on_payment = false（默认）时，收到支付消息后订单停在
   * "待确认打印"，必须由用户手动确认才出纸。
   */
  auto_release_on_payment: boolean
  /** true 表示确认打印前会先做一次官方支付核验（用户会多等一会儿）。 */
  require_payment_verification: boolean
  /** "待确认打印"的存活时间（秒）。0 表示不回收。 */
  release_ttl_seconds: number
  supported_paper_sizes: string[]
  supported_n_up: number[]
  supported_duplex: ParamOption[]
  supported_color_modes: ParamOption[]
  supported_orientations: ParamOption[]
  supported_qualities: ParamOption[]
  supported_channels: string[]
  payment_report_sources: string[]
  order_ttl_seconds: number
  signature_skew_seconds: number
  signing_scheme: string
  upload_max_bytes: number
  order_statuses: StatusOption[]
  max_copies: number
}

export interface PaymentResult {
  accepted: boolean
  duplicate: boolean
  order_id?: string
  order_no: string
  order_status: string
  status_text: string
  reason?: string
  /** 打印任务是否已入队。默认部署下为 false，出纸要等用户确认。 */
  job_queued: boolean
  /** 是否应当引导用户去点"确认打印"。 */
  can_release: boolean
  verify_pending: boolean
}

export interface ListResponse<T> {
  data: T[]
  total: number
  limit: number
  offset: number
}

export interface DataResponse<T> {
  data: T
}

// ---------- 管理面板 ----------

export interface CollectorView {
  id: string
  printer_id: string
  printer_code: string
  printer_name: string
  label: string
  created_at: number
  last_used_at: number
  revoked: boolean
  revoked_at?: number
  revoke_reason?: string
  status_text: string
  tone: Tone
}

/** 只在"签发收款凭据"的响应里出现：明文令牌只此一次。 */
export interface IssuedCollectorView extends CollectorView {
  token: string
}

export interface AdminLoginResponse {
  token: string
  expires_at: number
  admin: UserView
}

export interface AdminMeResponse {
  /** 靠运维令牌进来的：有权限，但没有对应的账号身份。 */
  via_token: boolean
  admin?: UserView
}

export interface AdminStatsResponse {
  print_jobs_by_status: Record<string, number>
  users: { total: number; admin: number; user: number }
  // 以下为**当前生效**的运行参数（可能已被面板覆盖，不再等于 .env 里的值）。
  auto_release_on_payment: boolean
  require_payment_verification: boolean
  release_ttl_seconds: number
  open_registration: boolean
  order_ttl_seconds: number
  payment_sources: string[]
  wechat_query_enabled: boolean
  // 只读项：这些仍只能通过环境变量改，列出来是为了排障时一眼看全。
  log_level: string
  worker_enabled: boolean
  signature_skew_seconds: number
  nonce_ttl_seconds: number
  max_upload_bytes: number
  session_ttl_seconds: number
  default_printer_uri_seed: string
}

/** 级联删除一个打印机后，各类关联数据实际被清掉的行数。 */
export interface DeletePrinterResult {
  code: string
  name: string
  deleted_orders: number
  deleted_print_jobs: number
  deleted_ledger_entries: number
  deleted_payment_events: number
  deleted_order_verifications: number
  deleted_collector_credentials: number
}

/** 一项可在管理面板修改的运行时配置。 */
export interface SettingView {
  key: string
  label: string
  help: string
  group: string
  kind: 'bool' | 'duration' | 'int'
  /** 当前生效值，字符串形式（"true" / "30m" / "5"），可直接绑到输入框。 */
  value: string
  /** 内置默认值（出厂值）。面板改过则显示覆盖值。 */
  default: string
  /** true 表示这一项被管理面板覆盖过。 */
  overridden: boolean
  min?: number
  max?: number
}

/**
 * 一条到账事件。order_id 为空表示它没能归属到任何订单，需人工核销。
 *
 * 归属记的是**账号**（到账与订单一样挂在账号上，不是设备）；
 * 没能归属的到账无从知道是谁的，user_id / username 为空。
 */
export interface PaymentEventView {
  id: string
  event_id: string
  source: string
  channel: string
  order_id?: string
  order_no: string
  user_id?: string
  username?: string
  out_trade_no: string
  amount_fen: number
  amount_text: string
  status: string
  status_text: string
  tone: Tone
  reason: string
  reported_at: number
  created_at: number
}

/**
 * 一条订单审计记录（审计日志）。
 *
 * 全部字段都是**下单那一刻的快照**：设备被解绑或删除、打印机被级联删除、
 * 账号改名，都不会改动已经写下的记录。
 */
export interface OrderAuditView {
  id: string
  order_id: string
  order_no: string
  user_id: string
  username: string
  /** 设备名称与指纹是快照，不受设备当前状态影响。 */
  device_label: string
  device_fingerprint: string
  amount_fen: number
  amount_text: string
  file_name: string
  color_mode: string
  color_text: string
  duplex: string
  duplex_text: string
  copies: number
  total_pages: number
  created_at: number
}

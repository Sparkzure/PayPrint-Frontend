/**
 * 端到端联调自检。
 *
 * 用 Node 的 WebCrypto 生成与浏览器完全相同的设备密钥，并导入 src/lib/sign.ts
 * 里的签名协议，对着一个真实运行的服务端把主链路跑一遍：
 *
 *   注册 → 上传 PDF → 下单 → 上报支付 → 确认打印 → 打印完成
 *   外加收款设备链路：建运营账号 → 登记收款设备 → 只报金额的到账匹配 → 权限隔离
 *
 * 它存在的意义：签名方案（规范化明文、query 转义、body 摘要）是前后端最容易
 * 对不齐的地方，而 TypeScript 编译和 Go 单元测试都发现不了这种"两侧各自正确、
 * 合起来不对"的问题。这个脚本是唯一能真正验证跨语言一致性的手段。
 *
 * 用法：
 *   npm run smoke                      # 默认打 http://127.0.0.1:8080
 *   SMOKE_BASE=http://host:8080 npm run smoke
 */

import {
  buildQuery,
  canonicalString,
  newNonce,
  sha256Hex,
  toBase64,
} from '../src/lib/sign.ts'
import { startFakeIpp } from './fake-ipp.mjs'

const BASE = process.env.SMOKE_BASE ?? 'http://127.0.0.1:8080'
const APP_VERSION = '0.1.0'
const ADMIN_TOKEN = process.env.SMOKE_ADMIN_TOKEN ?? 'smoke-admin-token'
const FAKE_IPP_PORT = Number(process.env.SMOKE_IPP_PORT ?? 8631)

// 单面黑白单价固定成 100 分/张，价格断言用这个常量算，避免两处数字各写一遍。
// 单价按"张"计（单面黑白 / 单面彩色 / 双面黑白 / 双面彩色四档，见 domain.Quote）。
const UNIT_PRICE_FEN = 100

// 故意用中文：验证"头字段百分号编码 → 服务端解码"这条链路真的通。
const DEVICE_LABEL = '冒烟测试设备'

// 3 页的最小 PDF：服务端会用 /Type /Page 的出现次数识别页数。
const SAMPLE_PDF = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R >>
endobj
4 0 obj
<< /Type /Page /Parent 2 0 R >>
endobj
5 0 obj
<< /Type /Page /Parent 2 0 R >>
endobj
trailer
<< /Root 1 0 R >>
%%EOF
`

let passed = 0
let failed = 0

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1
    console.log(`  ok   ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

function section(title) {
  console.log(`\n${title}`)
}

async function createDeviceIdentity(fingerprint) {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey))
  return {
    fingerprint,
    publicKey: toBase64(spki),
    async sign(data) {
      const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        pair.privateKey,
        data.slice(),
      )
      return toBase64(new Uint8Array(signature))
    },
  }
}

/** 一次带签名（可选带会话）的请求。 */
async function call(path, { method = 'GET', query, json, form, token, identity, headers: extra } = {}) {
  const queryString = buildQuery(query)
  const url = `${BASE}${path}${queryString ? `?${queryString}` : ''}`

  const headers = new Headers()
  for (const [key, value] of Object.entries(extra ?? {})) headers.set(key, value)
  let body
  let bodyBytes = new Uint8Array(0)

  if (form) {
    body = form
  } else if (json !== undefined) {
    const text = JSON.stringify(json)
    bodyBytes = new TextEncoder().encode(text)
    body = bodyBytes
    headers.set('Content-Type', 'application/json')
  }

  if (token) headers.set('Authorization', `Bearer ${token}`)

  if (identity) {
    const timestamp = Math.floor(Date.now() / 1000)
    const nonce = newNonce()
    const bodyHash = await sha256Hex(bodyBytes)
    const canonical = canonicalString(method, path, queryString, timestamp, nonce, bodyHash)
    const signature = await identity.sign(new TextEncoder().encode(canonical))

    headers.set('X-Device-Fingerprint', identity.fingerprint)
    headers.set('X-Device-Timestamp', String(timestamp))
    headers.set('X-Device-Nonce', nonce)
    headers.set('X-Device-Signature', signature)
    headers.set('X-Device-Public-Key', identity.publicKey)
    // 头字段只能是 latin-1 字节，中文必须百分号编码（与 api.ts 保持一致）。
    headers.set('X-Device-Platform', encodeURIComponent('node/smoke'))
    headers.set('X-Device-App-Version', APP_VERSION)
    headers.set('X-Device-Label', encodeURIComponent(DEVICE_LABEL))
  }

  const response = await fetch(url, { method, headers, body })
  const text = await response.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  return { status: response.status, ok: response.ok, payload, text }
}

function dataOf(payload) {
  return payload?.data ?? null
}

/** 假 IPP 打印机，在第 4 节被登记成服务端的打印机。 */
let fakePrinter = null

async function main() {
  console.log(`冒烟测试目标：${BASE}`)

  // 先把假打印机起起来：第 4 节会把它登记进服务端，之后的 Print-Job 与
  // job-state 回查都打在它上面。
  fakePrinter = await startFakeIpp({ port: FAKE_IPP_PORT })
  console.log(`假 IPP 打印机已启动：${fakePrinter.uri}`)

  section('0. 服务存活')
  const health = await call('/healthz')
  check('GET /healthz 返回 200', health.status === 200, `status=${health.status}`)
  check('数据库状态为 ok', health.payload?.data?.database === 'ok', health.text.slice(0, 120))
  if (health.status !== 200) {
    console.log('\n服务不可用，后续检查跳过。')
    return
  }

  const meta = await call('/api/v1/meta')
  check('GET /api/v1/meta 返回 200', meta.status === 200)
  check('meta 声明了签名方案', dataOf(meta.payload)?.signing_scheme === 'payprint/v1')

  // 前端由同一个 Go 进程提供：确认 SPA 回退真的生效，
  // 否则用户刷新 /orders 这类深层链接会拿到 404。
  // smoke.sh / smoke.ps1 用 --no-web 构建（CI 冒烟不取前端产物），
  // 此时断言反过来：非 API 路径回 404，且说明里写明缺前端产物。
  if (process.env.SMOKE_NO_WEB) {
    const spa = await fetch(`${BASE}/orders`)
    const body = await spa.text()
    check('GET /orders 在无前端产物的二进制上回 404', spa.status === 404 && body.includes('没有前端产物'))
  } else {
    const spa = await fetch(`${BASE}/orders`)
    const spaHtml = await spa.text()
    check('GET /orders 回退到 index.html', spa.status === 200 && spaHtml.includes('id="root"'))
  }
  check('未知 API 路径仍是 404', (await fetch(`${BASE}/api/v1/nope`)).status === 404)

  section('1. 注册（设备签名 + TOFU 公钥固定 + 首个账号 bootstrap 为管理员）')
  const suffix = Math.random().toString(36).slice(2, 8)
  const username = `smoke_${suffix}`
  const password = 'smoke-password-123'

  // 空库后的第一个注册账号自动成为管理员（README 承诺的引导路径）。
  const rootIdentity = await createDeviceIdentity(`smoke-root-${suffix}`)
  const adminRegister = await call('/api/v1/auth/register', {
    method: 'POST',
    json: { username: `${username}_root`, password, display_name: '冒烟管理员' },
    identity: rootIdentity,
  })
  check('注册成功（201）', adminRegister.status === 201, `${adminRegister.status} ${adminRegister.text.slice(0, 160)}`)
  check(
    '首个注册账号自动成为管理员（bootstrap）',
    dataOf(adminRegister.payload)?.user?.role === 'admin',
    String(dataOf(adminRegister.payload)?.user?.role),
  )

  // 管理员不占设备：注册响应里没有 device，而且同一个指纹还能继续注册成员账号。
  // 迁移 00011 之前这里是 device_already_used，运维拿自己那台机器 bootstrap，
  // 那台机器就再也用不了消费端了。
  check(
    '管理员注册响应里没有 device 字段',
    dataOf(adminRegister.payload)?.device === undefined,
    JSON.stringify(dataOf(adminRegister.payload)?.device ?? null),
  )
  const memberOnBootstrapDevice = await call('/api/v1/auth/register', {
    method: 'POST',
    json: { username: `${username}_onroot`, password, display_name: '同机成员' },
    identity: rootIdentity,
  })
  check(
    '管理员不占用设备：同一台设备仍可注册成员账号（201）',
    memberOnBootstrapDevice.status === 201,
    `${memberOnBootstrapDevice.status} ${memberOnBootstrapDevice.text.slice(0, 160)}`,
  )

  // 管理员不能消费（admin_cannot_consume），主流程改用普通用户。
  const identity = await createDeviceIdentity(`smoke-${suffix}`)
  const register = await call('/api/v1/auth/register', {
    method: 'POST',
    json: { username, password, display_name: '冒烟测试账号' },
    identity,
  })
  check('普通用户注册成功（201）', register.status === 201, `${register.status} ${register.text.slice(0, 160)}`)
  check(
    '后续注册仍是普通用户',
    dataOf(register.payload)?.user?.role === 'user',
    String(dataOf(register.payload)?.user?.role),
  )
  const token = dataOf(register.payload)?.token
  check('返回会话令牌', typeof token === 'string' && token.length > 0)

  // 再一个账号：后面用它验证"越权放行别人的订单"必须被拦住。
  const otherIdentity = await createDeviceIdentity(`smoke-other-${suffix}`)
  const otherRegister = await call('/api/v1/auth/register', {
    method: 'POST',
    json: { username: `${username}_2`, password, display_name: '冒烟测试账号二' },
    identity: otherIdentity,
  })
  check('第三个账号注册成功（201）', otherRegister.status === 201, otherRegister.text.slice(0, 160))
  const otherToken = dataOf(otherRegister.payload)?.token

  section('2. 会话与设备校验')
  const me = await call('/api/v1/me', { token })
  check('GET /api/v1/me 返回 200', me.status === 200, `${me.status} ${me.text.slice(0, 160)}`)
  check('账号名回显正确', dataOf(me.payload)?.user?.username === username)
  check(
    '设备已绑定到该账号',
    dataOf(me.payload)?.device?.status === 'active',
    JSON.stringify(dataOf(me.payload)?.device ?? {}),
  )
  check(
    '中文设备名经百分号编码后正确还原',
    dataOf(me.payload)?.device?.label === DEVICE_LABEL,
    `label=${dataOf(me.payload)?.device?.label}`,
  )

  // 无令牌应当被拒。
  const noAuth = await call('/api/v1/me')
  check('无令牌访问 /me 返回 401', noAuth.status === 401, `status=${noAuth.status}`)

  // 同一指纹换一把密钥应当被判定为伪造。
  const imposter = await createDeviceIdentity(`smoke-${suffix}`)
  const forged = await call('/api/v1/auth/login', {
    method: 'POST',
    json: { username, password },
    identity: imposter,
  })
  check(
    '换密钥冒充同一设备被拒（device_key_mismatch）',
    forged.status === 403 && forged.payload?.error?.code === 'device_key_mismatch',
    `${forged.status} ${forged.text.slice(0, 160)}`,
  )

  // 错误口令。
  const wrongPassword = await call('/api/v1/auth/login', {
    method: 'POST',
    json: { username, password: 'not-the-password' },
    identity,
  })
  check(
    '错误口令返回 invalid_credentials',
    wrongPassword.status === 401 &&
      wrongPassword.payload?.error?.code === 'invalid_credentials',
    `${wrongPassword.status} ${wrongPassword.text.slice(0, 160)}`,
  )

  section('3. 上传 PDF')
  const form = new FormData()
  form.append('file', new Blob([SAMPLE_PDF], { type: 'application/pdf' }), 'smoke.pdf')
  const upload = await call('/api/v1/files', { method: 'POST', form, token })
  check('上传成功（201）', upload.status === 201, `${upload.status} ${upload.text.slice(0, 160)}`)
  const file = dataOf(upload.payload)
  check('识别出 3 页', file?.page_count === 3, `page_count=${file?.page_count}`)
  const fileId = file?.id
  check('返回文件 ID', typeof fileId === 'string')

  section('4. 打印机与下单')
  // 把默认打印机指向本地的假 IPP 打印机：这样后面的 Print-Job / 状态回查
  // 都能真正走一遍 IPP，而不是停在"打印机不可达"。
  const upsertPrinter = await call('/api/v1/admin/printers', {
    method: 'POST',
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
    json: {
      code: 'P01',
      name: '冒烟测试机',
      cups_uri: fakePrinter.uri,
      location: '冒烟测试',
      status: 'online',
      price_single_bw_fen: UNIT_PRICE_FEN,
      price_single_color_fen: 300,
      price_duplex_bw_fen: 200,
      price_duplex_color_fen: 600,
      supports_color: true,
      supports_duplex: true,
      paper_sizes: ['A4'],
      max_copies: 99,
    },
  })
  check(
    '运维接口可登记打印机（也验证了 X-Admin-Token）',
    upsertPrinter.status === 200,
    `${upsertPrinter.status} ${upsertPrinter.text.slice(0, 200)}`,
  )

  const printers = await call('/api/v1/printers', { token, query: { live: 'true' } })
  check('GET /printers 返回 200', printers.status === 200, printers.text.slice(0, 160))
  const printer = printers.payload?.data?.find((item) => item.code === 'P01')
  check('能找到刚登记的打印机', !!printer, JSON.stringify(printers.payload?.data ?? []))
  if (!printer) return
  // 放行前会探测打印机可用性，这里先确认探测结果是"在线可接单"。
  check('实时探测显示打印机可用', printer.live?.reachable === true && printer.live?.accepting_jobs === true,
    JSON.stringify(printer.live ?? {}))

  // 下单：3 页 × 2 份 × 单面黑白单价（3 页单面 = 3 张/份）
  const params = {
    copies: 2,
    duplex: 'one_sided',
    color_mode: 'monochrome',
    paper_size: 'A4',
    page_range: '',
    n_up: 1,
    orientation: 'portrait',
    quality: 'normal',
    fit_to_page: true,
  }
  const createOrder = await call('/api/v1/orders', {
    method: 'POST',
    json: { file_id: fileId, printer_id: printer.id, title: '冒烟测试', params },
    token,
    identity,
  })
  check('下单成功（201）', createOrder.status === 201, `${createOrder.status} ${createOrder.text.slice(0, 200)}`)
  const order = dataOf(createOrder.payload)
  const expected = UNIT_PRICE_FEN * 3 * 2
  check(
    `服务端计价 = ${expected} 分（${UNIT_PRICE_FEN} × 3 张 × 2 份）`,
    order?.amount_fen === expected,
    `amount_fen=${order?.amount_fen}`,
  )
  check('订单状态为待支付', order?.status === 'awaiting_payment', order?.status)

  if (!order) return

  section('5. 支付上报校验链')
  const baseReport = {
    channel: 'wechat',
    order_no: order.order_no,
    out_trade_no: `smoke-${suffix}`,
  }

  const wrongAmount = await call('/api/v1/payment/report', {
    method: 'POST',
    query: { source: 'wechat_android' },
    json: { event_id: `evt-wrong-${suffix}`, ...baseReport, amount_fen: order.amount_fen - 1 },
    token,
    identity,
  })
  check(
    '金额不符被拒（amount_mismatch）',
    wrongAmount.status === 409 && wrongAmount.payload?.error?.code === 'amount_mismatch',
    `${wrongAmount.status} ${wrongAmount.text.slice(0, 200)}`,
  )

  const eventId = `evt-ok-${suffix}`
  const accepted = await call('/api/v1/payment/report', {
    method: 'POST',
    query: { source: 'wechat_android' },
    json: { event_id: eventId, ...baseReport, amount_fen: order.amount_fen },
    token,
    identity,
  })
  check('金额相符被接受（200）', accepted.status === 200, `${accepted.status} ${accepted.text.slice(0, 200)}`)
  check('首次上报未被标记为重复', dataOf(accepted.payload)?.accepted === true && dataOf(accepted.payload)?.duplicate === false)

  const duplicate = await call('/api/v1/payment/report', {
    method: 'POST',
    query: { source: 'wechat_android' },
    json: { event_id: eventId, ...baseReport, amount_fen: order.amount_fen },
    token,
    identity,
  })
  check(
    '同一 event_id 重复上报按幂等处理',
    duplicate.status === 200 && dataOf(duplicate.payload)?.duplicate === true,
    `${duplicate.status} ${duplicate.text.slice(0, 200)}`,
  )

  section('6. 支付确认后不得自动出纸')
  const detail = await call(`/api/v1/orders/${order.id}`, { token })
  check('订单详情可读', detail.status === 200, detail.text.slice(0, 160))
  const detailData = dataOf(detail.payload)
  check(
    '订单进入待确认打印',
    detailData?.status === 'awaiting_release',
    `status=${detailData?.status}`,
  )
  check('提示可以确认打印', detailData?.can_release === true)
  // 最关键的一条：收到支付消息后，打印任务必须不存在。
  check(
    '未确认前没有任何打印任务',
    !detailData?.job_status,
    `job_status=${JSON.stringify(detailData?.job_status)}`,
  )
  check('订单已固化计价快照', detailData?.cost?.total_fen === expected)
  check(
    '免费/付费都带确认时限倒计时',
    typeof detailData?.remaining_seconds === 'number',
    `remaining=${detailData?.remaining_seconds}`,
  )

  section('7. 确认打印（唯一出纸入口）')
  // 未确认就尝试用别的账号放行：必须被归属校验拦下。
  // 归属校验内嵌在查询里，因此越权与"订单不存在"返回同一个错误码。
  const foreignRelease = await call(`/api/v1/orders/${order.id}/print`, {
    method: 'POST',
    token: otherToken,
    identity: otherIdentity,
  })
  check(
    '其他账号无法放行该订单（404）',
    foreignRelease.status === 404 &&
      foreignRelease.payload?.error?.code === 'order_not_found',
    `${foreignRelease.status} ${foreignRelease.text.slice(0, 160)}`,
  )

  const released = await call(`/api/v1/orders/${order.id}/print`, {
    method: 'POST',
    token,
    identity,
  })
  check('确认打印成功（200）', released.status === 200, `${released.status} ${released.text.slice(0, 200)}`)
  const releasedData = dataOf(released.payload)
  // 确认之后订单立刻进入 queued；worker 可能在几百毫秒内就把它推到 printing，
  // 所以这里接受"已经往前走"的那几种状态，而不是死抠 queued。
  check(
    '确认后离开待确认状态',
    ['queued', 'printing', 'completed'].includes(releasedData?.status),
    `status=${releasedData?.status}`,
  )
  check('确认后生成打印任务', !!releasedData?.job_status, `job_status=${releasedData?.job_status}`)
  check('响应标记 just_released', releasedData?.just_released === true)

  // 双击 / 重放：幂等。这里断言的核心是"不会出现第二个任务"，
  // 而任务数量最终由假打印机收到的 Print-Job 次数来验证（见第 8 节）。
  const releasedAgain = await call(`/api/v1/orders/${order.id}/print`, {
    method: 'POST',
    token,
    identity,
  })
  check('重复确认按幂等处理（200）', releasedAgain.status === 200, `${releasedAgain.status}`)
  check(
    '重复确认不会退回待确认',
    ['queued', 'printing', 'completed'].includes(dataOf(releasedAgain.payload)?.status),
    `status=${dataOf(releasedAgain.payload)?.status}`,
  )

  section('8. 打印链路（真实走一遍 IPP）')
  // 等待 worker 把任务投递给假打印机，并回查到 completed。
  let finalOrder = null
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    const res = await call(`/api/v1/orders/${order.id}`, { token })
    const current = dataOf(res.payload)
    if (current?.status === 'completed') {
      finalOrder = current
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }

  check('订单最终变为已完成', finalOrder?.status === 'completed', `status=${finalOrder?.status}`)
  check(
    '作业状态来自 CUPS 回查',
    finalOrder?.job_status === 'completed',
    `job_status=${finalOrder?.job_status}`,
  )
  check(
    '打印任务有 CUPS 作业号',
    typeof finalOrder?.cups_job_id === 'number' && finalOrder.cups_job_id > 0,
    `cups_job_id=${finalOrder?.cups_job_id}`,
  )
  check('订单记录了完成时间', (finalOrder?.completed_at ?? 0) > 0)
  check(
    '假打印机只收到一次 Print-Job（幂等有效）',
    fakePrinter.submittedJobIds().length === 1,
    `submitted=${JSON.stringify(fakePrinter.submittedJobIds())}`,
  )

  section('9. 记账')
  const ledger = await call('/api/v1/ledger', { token })
  const spent = dataOf(ledger.payload)?.total_spent_fen
  check('累计支出等于订单金额', spent === expected, `total_spent_fen=${spent}`)
  check(
    '只有一条支付流水（重复上报未重复记账）',
    dataOf(ledger.payload)?.entries?.length === 1,
    `entries=${dataOf(ledger.payload)?.entries?.length}`,
  )

  section('10. 越权校验')
  const foreignOrder = await call(`/api/v1/orders/${order.id}`, { token: otherToken })
  check(
    '其他账号读不到该订单（404）',
    foreignOrder.status === 404,
    `${foreignOrder.status} ${foreignOrder.text.slice(0, 160)}`,
  )

  // 用户端没有自助解绑入口（只有管理员那条 POST /admin/devices/{id}/release）。
  // 这条断言守的是"解绑能力不会悄悄回到消费端"，设备信任根一旦能被用户自己摘掉，
  // "一台设备终身只绑一个账号"的前提就没了。
  const releaseOther = await call(`/api/v1/devices/${dataOf(register.payload)?.device?.id}/release`, {
    method: 'POST',
    token: otherToken,
    identity: otherIdentity,
  })
  check(
    '消费端没有自助解绑入口（404）',
    releaseOther.status === 404,
    `${releaseOther.status} ${releaseOther.text.slice(0, 160)}`,
  )

  section('11. 管理与收款：两条互不相干的身份线')

  // 管理员是账号（管理面板，不受设备限制），收款是API 凭据（不接入用户体系）。
  // 这正好是本次改造的核心，两条线都必须有端到端断言。

  // ---- 11a 管理员：能管一切，但不能打印 ----
  const adminUsername = `ops_${suffix}`
  const createAdmin = await call('/api/v1/admin/users', {
    method: 'POST',
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
    json: { username: adminUsername, password, display_name: '值班管理员', role: 'admin' },
  })
  check(
    '运维令牌可创建管理员账号（201）',
    createAdmin.status === 201,
    `${createAdmin.status} ${createAdmin.text.slice(0, 200)}`,
  )
  check(
    '返回角色为 admin',
    dataOf(createAdmin.payload)?.role === 'admin',
    String(dataOf(createAdmin.payload)?.role),
  )
  const adminUserId = dataOf(createAdmin.payload)?.id

  // 关键：这次登录不带任何设备签名头。
  const adminLogin = await call('/api/v1/admin/login', {
    method: 'POST',
    json: { username: adminUsername, password },
  })
  check(
    '管理员登录不需要设备签名（200）',
    adminLogin.status === 200,
    `${adminLogin.status} ${adminLogin.text.slice(0, 200)}`,
  )
  const adminToken = dataOf(adminLogin.payload)?.token
  const adminDevice = dataOf(adminLogin.payload)?.device
  check(
    '管理员登录不绑定任何设备',
    adminDevice === undefined,
    JSON.stringify(adminDevice ?? {}),
  )

  const adminStats = await call('/api/v1/admin/stats', { token: adminToken })
  check(
    '管理员会话可访问管理接口（200）',
    adminStats.status === 200,
    `${adminStats.status} ${adminStats.text.slice(0, 200)}`,
  )
  check(
    '总览带上账号数量',
    typeof dataOf(adminStats.payload)?.users?.total === 'number',
    JSON.stringify(dataOf(adminStats.payload)?.users ?? {}),
  )

  // 管理员不能打印：消费端整组对它关闭。这里故意不带设备签名，
  // 因为拦下它的是"管理员账号"这个身份，而不是设备校验。
  const adminOrder = await call('/api/v1/orders', {
    method: 'POST',
    json: { file_id: fileId, printer_id: printer.id, title: '管理员下单', params },
    token: adminToken,
  })
  check(
    '管理员不能下单（403 admin_cannot_consume）',
    adminOrder.status === 403 && adminOrder.payload?.error?.code === 'admin_cannot_consume',
    `${adminOrder.status} ${adminOrder.text.slice(0, 200)}`,
  )

  const adminMe = await call('/api/v1/me', { token: adminToken })
  check(
    '管理员也不能读消费端身份（403）',
    adminMe.status === 403 && adminMe.payload?.error?.code === 'admin_cannot_consume',
    `${adminMe.status} ${adminMe.text.slice(0, 160)}`,
  )

  // 管理员走用户端登录入口：口令正确才提示"请从管理面板登录"，
  // 因此这个错误码不会泄露"某个用户名是不是管理员"。
  const adminConsIdentity = await createDeviceIdentity(`smoke-admin-${suffix}`)
  const adminViaConsumer = await call('/api/v1/auth/login', {
    method: 'POST',
    json: { username: adminUsername, password },
    identity: adminConsIdentity,
  })
  check(
    '管理员不能从用户端登录（403 admin_use_console）',
    adminViaConsumer.status === 403 && adminViaConsumer.payload?.error?.code === 'admin_use_console',
    `${adminViaConsumer.status} ${adminViaConsumer.text.slice(0, 200)}`,
  )

  const adminWrongPassword = await call('/api/v1/admin/login', {
    method: 'POST',
    json: { username: adminUsername, password: `${password}-wrong` },
  })
  check(
    '管理入口口令错误与用户名不存在返回同一错误（不泄露账号是否存在）',
    adminWrongPassword.status === 401 &&
      adminWrongPassword.payload?.error?.code === 'invalid_credentials',
    `${adminWrongPassword.status} ${adminWrongPassword.text.slice(0, 200)}`,
  )

  // ---- 11b 收款凭据：不接入用户体系 ----
  const issueCollector = await call('/api/v1/admin/collectors', {
    method: 'POST',
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
    json: { printer_code: 'P01', label: '冒烟收款机' },
  })
  check(
    '运维令牌可签发收款凭据（201）',
    issueCollector.status === 201,
    `${issueCollector.status} ${issueCollector.text.slice(0, 200)}`,
  )
  const collectorToken = dataOf(issueCollector.payload)?.token
  const collectorID = dataOf(issueCollector.payload)?.id
  check(
    '签发响应带明文令牌（只此一次）',
    typeof collectorToken === 'string' && collectorToken.length >= 20,
    String(collectorToken).slice(0, 12),
  )
  check(
    '凭据绑定签发时的站点',
    dataOf(issueCollector.payload)?.printer_code === 'P01' &&
      dataOf(issueCollector.payload)?.revoked === false,
    JSON.stringify(dataOf(issueCollector.payload) ?? {}).slice(0, 200),
  )

  const badSite = await call('/api/v1/admin/collectors', {
    method: 'POST',
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
    json: { printer_code: 'NO_SUCH_SITE' },
  })
  check(
    '签发到不存在的站点被拒（404）',
    badSite.status === 404,
    `${badSite.status} ${badSite.text.slice(0, 160)}`,
  )

  const badCredential = await call('/api/v1/collector/payment/report', {
    method: 'POST',
    headers: { 'X-Collector-Token': 'not-a-real-token' },
    json: { event_id: `evt-bad-${suffix}`, amount_fen: 100 },
  })
  check(
    '凭据无效时拒绝上报（401）',
    badCredential.status === 401 &&
      badCredential.payload?.error?.code === 'collector_credential_invalid',
    `${badCredential.status} ${badCredential.text.slice(0, 200)}`,
  )

  // 没有凭据、也没有订单号的设备上报：拒绝。否则任何一台设备都能声称"有人付了 X 元"。
  const noCredential = await call('/api/v1/payment/report', {
    method: 'POST',
    query: { source: 'wechat_android' },
    json: { event_id: `evt-nocred-${suffix}`, channel: 'wechat', amount_fen: 100 },
    token,
    identity,
  })
  check(
    '消费设备只报金额被拒（403 report_needs_order_no）',
    noCredential.status === 403 &&
      noCredential.payload?.error?.code === 'report_needs_order_no',
    `${noCredential.status} ${noCredential.text.slice(0, 200)}`,
  )

  // 第二笔订单：金额与第一笔不同，避免歧义，用来验证"只报金额"的匹配。
  const matchedParams = { ...params, copies: 1 }
  const createMatched = await call('/api/v1/orders', {
    method: 'POST',
    json: { file_id: fileId, printer_id: printer.id, title: '收款匹配', params: matchedParams },
    token,
    identity,
  })
  const matchedOrder = dataOf(createMatched.payload)
  const matchedAmount = UNIT_PRICE_FEN * 3
  check(
    `第二笔订单创建成功（${matchedAmount} 分）`,
    createMatched.status === 201 && matchedOrder?.amount_fen === matchedAmount,
    `${createMatched.status} ${JSON.stringify(matchedOrder ?? {}).slice(0, 160)}`,
  )

  const matched = await call('/api/v1/collector/payment/report', {
    method: 'POST',
    headers: { 'X-Collector-Token': collectorToken },
    json: { event_id: `evt-match-${suffix}`, channel: 'wechat', amount_fen: matchedAmount },
  })
  check(
    '只报金额（不带订单号）也能匹配到订单（200）',
    matched.status === 200,
    `${matched.status} ${matched.text.slice(0, 200)}`,
  )
  check(
    '服务端回填了匹配到的订单号',
    dataOf(matched.payload)?.order_no === matchedOrder?.order_no,
    `order_no=${dataOf(matched.payload)?.order_no} 期望=${matchedOrder?.order_no}`,
  )
  check(
    '匹配到的订单进入待确认打印',
    dataOf(matched.payload)?.order_status === 'awaiting_release',
    String(dataOf(matched.payload)?.order_status),
  )

  // 监听器重启后换了 event_id 重读通知再报一次：必须幂等，不能变成第二份。
  const replay = await call('/api/v1/collector/payment/report', {
    method: 'POST',
    headers: { 'X-Collector-Token': collectorToken },
    json: { event_id: `evt-match-again-${suffix}`, channel: 'wechat', amount_fen: matchedAmount },
  })
  check(
    '换 event_id 的重复到账按幂等处理',
    replay.status === 200 && dataOf(replay.payload)?.duplicate === true,
    `${replay.status} ${replay.text.slice(0, 200)}`,
  )

  // 同站点同金额并存时不许猜：判错意味着 A 付的钱印了 B 的文件。
  const createAmbiguous = await call('/api/v1/orders', {
    method: 'POST',
    json: { file_id: fileId, printer_id: printer.id, title: '同金额', params: matchedParams },
    token,
    identity,
  })
  check(
    '再建一笔同金额订单（构造歧义）',
    createAmbiguous.status === 201 &&
      dataOf(createAmbiguous.payload)?.amount_fen === matchedAmount,
    `${createAmbiguous.status}`,
  )
  const ambiguous = await call('/api/v1/collector/payment/report', {
    method: 'POST',
    headers: { 'X-Collector-Token': collectorToken },
    json: { event_id: `evt-amb-${suffix}`, channel: 'wechat', amount_fen: matchedAmount },
  })
  check(
    '同金额候选不止一笔时拒绝放行（payment_ambiguous）',
    ambiguous.status === 409 && ambiguous.payload?.error?.code === 'payment_ambiguous',
    `${ambiguous.status} ${ambiguous.text.slice(0, 200)}`,
  )

  const unmatched = await call('/api/v1/collector/payment/report', {
    method: 'POST',
    headers: { 'X-Collector-Token': collectorToken },
    json: { event_id: `evt-nomatch-${suffix}`, channel: 'wechat', amount_fen: 999999 },
  })
  check(
    '金额对不上任何订单时留痕并拒绝（payment_unmatched）',
    unmatched.status === 409 && unmatched.payload?.error?.code === 'payment_unmatched',
    `${unmatched.status} ${unmatched.text.slice(0, 200)}`,
  )

  // 吊销必须立刻生效：凭据泄露时的处置就靠它。
  const revokeCollector = await call(`/api/v1/admin/collectors/${collectorID}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
    json: { reason: '冒烟测试吊销' },
  })
  check(
    '吊销收款凭据（200）',
    revokeCollector.status === 200,
    `${revokeCollector.status} ${revokeCollector.text.slice(0, 160)}`,
  )

  const afterRevoke = await call('/api/v1/collector/payment/report', {
    method: 'POST',
    headers: { 'X-Collector-Token': collectorToken },
    json: { event_id: `evt-revoked-${suffix}`, amount_fen: matchedAmount },
  })
  check(
    '吊销后立刻失效（401）',
    afterRevoke.status === 401 && afterRevoke.payload?.error?.code === 'collector_credential_invalid',
    `${afterRevoke.status} ${afterRevoke.text.slice(0, 200)}`,
  )

  const collectorsList = await call('/api/v1/admin/collectors', {
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
  })
  const revokedRow = (dataOf(collectorsList.payload) ?? []).find((row) => row.id === collectorID)
  check(
    '凭据列表不带明文令牌，且吊销状态可查',
    collectorsList.status === 200 &&
      !!revokedRow &&
      revokedRow.revoked === true &&
      revokedRow.token === undefined,
    JSON.stringify(revokedRow ?? {}).slice(0, 200),
  )

  // 到账事件的来源应当记为 collector_api：事后能分清这条到账是谁报的。
  const collectorEvents = await call('/api/v1/admin/payment-events', {
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
    query: { limit: 50 },
  })
  const eventFromCredential = (dataOf(collectorEvents.payload) ?? []).find(
    (event) => event.event_id === `evt-match-${suffix}`,
  )
  check(
    '收款凭据上报的来源记为 collector_api',
    eventFromCredential?.source === 'collector_api',
    String(eventFromCredential?.source),
  )
  check(
    '该事件带上了回填的订单号',
    eventFromCredential?.order_no === matchedOrder?.order_no,
    `${eventFromCredential?.order_no} 期望 ${matchedOrder?.order_no}`,
  )

  section('12. 收尾路径（退款 / 重推 / 到账待办）')

  // 在途或已完成的任务不允许"重推"：那会把同一份文件再投一次，直接多出一份纸。
  const retryFinished = await call(`/api/v1/admin/orders/${order.id}/retry`, {
    method: 'POST',
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
  })
  check(
    '已完成的打印任务拒绝重推（409）',
    retryFinished.status === 409,
    `${retryFinished.status} ${retryFinished.text.slice(0, 160)}`,
  )

  // 退款一张已完成的订单：钱要退，但打印任务的状态不能被改写，
  // 谎称"已取消"只会让排障的人以为纸没出来。
  const refund = await call(`/api/v1/admin/orders/${order.id}/refund`, {
    method: 'POST',
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
    json: { reason: '冒烟测试退款' },
  })
  check('退款成功（200）', refund.status === 200, `${refund.status} ${refund.text.slice(0, 160)}`)

  const refunded = await call(`/api/v1/orders/${order.id}`, { token })
  check(
    '订单状态变为已退款',
    dataOf(refunded.payload)?.status === 'refunded',
    String(dataOf(refunded.payload)?.status),
  )
  check(
    '已投出的打印任务状态不被改写',
    dataOf(refunded.payload)?.job_status === 'completed',
    `job_status=${dataOf(refunded.payload)?.job_status}`,
  )

  // "钱可能收了但没出纸"的事件必须有地方看见：
  // 它们没有对应订单，不在任何订单/记账/设备列表里。
  const unresolved = await call('/api/v1/admin/payment-events', {
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
    query: { status: 'unresolved' },
  })
  check(
    '运维可查询待人工处理的到账事件（200）',
    unresolved.status === 200,
    `${unresolved.status} ${unresolved.text.slice(0, 160)}`,
  )
  const orphanEvent = (unresolved.payload?.data ?? []).find(
    (item) => item.amount_fen === 999999,
  )
  check('未匹配到订单的到账出现在待办列表里', !!orphanEvent, JSON.stringify(unresolved.payload?.data ?? []).slice(0, 240))
  check('该事件不带订单号（因为没有订单）', orphanEvent?.order_id === undefined || orphanEvent?.order_id === '')

  const badStatus = await call('/api/v1/admin/payment-events', {
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
    query: { status: 'nope' },
  })
  check(
    '非法 status 被拒（400）',
    badStatus.status === 400,
    `${badStatus.status} ${badStatus.text.slice(0, 160)}`,
  )

  section('13. 运行参数与站点连通性（改完即生效）')

  // 站点连通性：地址写错要能当场看出来，而不是等用户走到最后一步才报错。
  const probeDead = await call('/api/v1/admin/printers/probe', {
    method: 'POST',
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
    json: { cups_uri: 'ipp://127.0.0.1:9/ipp/print' },
  })
  check(
    '探测一个打不通的地址：请求成功但报不可达（不是 5xx）',
    probeDead.status === 200 && dataOf(probeDead.payload)?.reachable === false,
    `${probeDead.status} ${probeDead.text.slice(0, 200)}`,
  )
  check(
    '不可达时带回原因，供运维判断是地址错还是网关没起',
    typeof dataOf(probeDead.payload)?.error === 'string' &&
      dataOf(probeDead.payload).error.length > 0,
    String(dataOf(probeDead.payload)?.error),
  )

  const probeBadURI = await call('/api/v1/admin/printers/probe', {
    method: 'POST',
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
    json: { cups_uri: 'http://127.0.0.1:631/printers/hp' },
  })
  check(
    '非 ipp:// 开头的地址被拒（400）',
    probeBadURI.status === 400,
    `${probeBadURI.status} ${probeBadURI.text.slice(0, 160)}`,
  )

  const probeLive = await call('/api/v1/admin/printers/probe', {
    method: 'POST',
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
    json: { printer_id: printer.id },
  })
  check(
    '探测已登记的站点：走真实 IPP 且可达',
    probeLive.status === 200 && dataOf(probeLive.payload)?.reachable === true,
    `${probeLive.status} ${probeLive.text.slice(0, 200)}`,
  )

  // 站点地址只在管理侧回显：消费端拿到内网地址没有意义。
  const adminPrinters = await call('/api/v1/admin/printers', {
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
  })
  const adminPrinterRow = (dataOf(adminPrinters.payload) ?? []).find((row) => row.id === printer.id)
  check(
    '管理列表回显站点地址（面板要能看见并修改它）',
    typeof adminPrinterRow?.cups_uri === 'string' && adminPrinterRow.cups_uri.startsWith('ipp://'),
    String(adminPrinterRow?.cups_uri),
  )

  const consumerPrinters = await call('/api/v1/printers', { token })
  const consumerPrinterRow = (dataOf(consumerPrinters.payload) ?? []).find(
    (row) => row.id === printer.id,
  )
  check(
    '消费端列表不回显站点地址',
    consumerPrinterRow !== undefined && consumerPrinterRow.cups_uri === undefined,
    String(consumerPrinterRow?.cups_uri),
  )

  // 运行参数：改完立刻生效（不需要重启，也不需要重建容器）。
  const settingsList = await call('/api/v1/admin/settings', {
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
  })
  check(
    '能读到运行参数列表，并标出每一项是否被覆盖',
    settingsList.status === 200 &&
      (dataOf(settingsList.payload) ?? []).some(
        (item) => item.key === 'open_registration' && item.overridden === false,
      ),
    `${settingsList.status} ${settingsList.text.slice(0, 200)}`,
  )
  check(
    '每项都带默认值与说明（面板据此显示"跟随环境变量"）',
    (dataOf(settingsList.payload) ?? []).every(
      (item) => typeof item.default === 'string' && typeof item.help === 'string',
    ),
  )

  check(
    '待支付个数上限与时长都是运行配置项',
    ['max_pending_orders_per_user', 'order_ttl'].every((key) =>
      (dataOf(settingsList.payload) ?? []).some((item) => item.key === key),
    ),
  )

  const closeRegistration = await call('/api/v1/admin/settings', {
    method: 'PUT',
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
    json: { set: { open_registration: 'false' } },
  })
  check(
    '关闭自助注册（200）',
    closeRegistration.status === 200 &&
      (dataOf(closeRegistration.payload) ?? []).some(
        (item) => item.key === 'open_registration' && item.overridden === true,
      ),
    `${closeRegistration.status} ${closeRegistration.text.slice(0, 200)}`,
  )

  const metaAfterClose = await call('/api/v1/meta')
  check(
    '/meta 立刻反映新值（无需重启）',
    dataOf(metaAfterClose.payload)?.registration_open === false,
    String(dataOf(metaAfterClose.payload)?.registration_open),
  )

  const blockedRegister = await call('/api/v1/auth/register', {
    method: 'POST',
    json: { username: `blocked_${suffix}`, password },
    identity: await createDeviceIdentity(`smoke-blocked-${suffix}`),
  })
  check(
    '关闭后注册被拒（403 registration_closed）',
    blockedRegister.status === 403 &&
      blockedRegister.payload?.error?.code === 'registration_closed',
    `${blockedRegister.status} ${blockedRegister.text.slice(0, 160)}`,
  )

  const badSetting = await call('/api/v1/admin/settings', {
    method: 'PUT',
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
    json: { set: { order_ttl: '五分钟' } },
  })
  check(
    '非法配置值被拒（400），且不做部分写入',
    badSetting.status === 400,
    `${badSetting.status} ${badSetting.text.slice(0, 160)}`,
  )

  const stillClosed = await call('/api/v1/meta')
  check(
    '被拒的那次修改没有留下半套配置',
    dataOf(stillClosed.payload)?.registration_open === false,
    String(dataOf(stillClosed.payload)?.registration_open),
  )

  const resetSetting = await call('/api/v1/admin/settings', {
    method: 'PUT',
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
    json: { reset: ['open_registration'] },
  })
  check(
    '还原默认后回到环境变量里的值',
    resetSetting.status === 200 &&
      (dataOf(resetSetting.payload) ?? []).some(
        (item) =>
          item.key === 'open_registration' && item.overridden === false && item.value === 'true',
      ),
    `${resetSetting.status} ${resetSetting.text.slice(0, 200)}`,
  )

  // 账号封禁：理由必填，且直接落在账号上（列表要能回答"为什么"）。
  const banWithoutReason = await call(`/api/v1/admin/users/${adminUserId}/ban`, {
    method: 'POST',
    token: adminToken,
    json: { reason: '' },
  })
  check(
    '封禁必须填写理由（400）',
    banWithoutReason.status === 400,
    `${banWithoutReason.status} ${banWithoutReason.text.slice(0, 160)}`,
  )

  const banSelf = await call(`/api/v1/admin/users/${adminUserId}/ban`, {
    method: 'POST',
    token: adminToken,
    json: { reason: '冒烟测试：不应成功' },
  })
  check(
    '不能封禁自己 / 最后一个管理员（409）',
    banSelf.status === 409,
    `${banSelf.status} ${banSelf.text.slice(0, 200)}`,
  )

  const targetUserId = dataOf(register.payload)?.user?.id
  const banUser = await call(`/api/v1/admin/users/${targetUserId}/ban`, {
    method: 'POST',
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
    json: { reason: '冒烟测试封禁' },
  })
  check(
    '封禁普通账号（200）',
    banUser.status === 200,
    `${banUser.status} ${banUser.text.slice(0, 160)}`,
  )

  const usersAfterBan = await call('/api/v1/admin/users', {
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
  })
  const bannedRow = (dataOf(usersAfterBan.payload) ?? []).find((row) => row.id === targetUserId)
  check(
    '封禁理由落在账号上（列表直接回答"为什么"）',
    bannedRow?.status === 'banned' &&
      bannedRow?.ban_reason === '冒烟测试封禁' &&
      bannedRow?.banned_by === 'admin-token' &&
      bannedRow?.banned_at > 0,
    JSON.stringify(bannedRow ?? {}).slice(0, 600),
  )

  const loginAfterBan = await call('/api/v1/auth/login', {
    method: 'POST',
    json: { username, password },
    identity: await createDeviceIdentity(`smoke-banned-${suffix}`),
  })
  check(
    '封禁后登录被拒（403 account_banned）',
    loginAfterBan.status === 403 && loginAfterBan.payload?.error?.code === 'account_banned',
    `${loginAfterBan.status} ${loginAfterBan.text.slice(0, 160)}`,
  )

  const unbanWithoutReason = await call(`/api/v1/admin/users/${targetUserId}/unban`, {
    method: 'POST',
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
    json: { reason: '  ' },
  })
  check(
    '解封同样必须填写理由（400）',
    unbanWithoutReason.status === 400,
    `${unbanWithoutReason.status} ${unbanWithoutReason.text.slice(0, 160)}`,
  )

  const unbanUser = await call(`/api/v1/admin/users/${targetUserId}/unban`, {
    method: 'POST',
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
    json: { reason: '冒烟测试解封' },
  })
  check(
    '解封（200）',
    unbanUser.status === 200,
    `${unbanUser.status} ${unbanUser.text.slice(0, 160)}`,
  )

  section('14. 备份导出与还原（zip 下载 + 暂存还原）')

  const backupResponse = await fetch(`${BASE}/api/v1/admin/backup`, {
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
  })
  const backupBytes = new Uint8Array(await backupResponse.arrayBuffer())
  check(
    '导出备份是 zip 附件',
    backupResponse.status === 200 &&
      backupBytes[0] === 0x50 &&
      backupBytes[1] === 0x4b &&
      /attachment/.test(backupResponse.headers.get('content-disposition') ?? ''),
    `${backupResponse.status} ${backupResponse.headers.get('content-type')}`,
  )
  check(
    '备份内容非空（空库也不止几 KB）',
    backupBytes.length > 2048,
    String(backupBytes.length),
  )

  const restoreNotZip = await fetch(`${BASE}/api/v1/admin/restore`, {
    method: 'POST',
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
    body: (() => {
      const form = new FormData()
      form.append('file', new Blob([new Uint8Array([1, 2, 3])]), 'not-a-backup.zip')
      return form
    })(),
  })
  check(
    '还原接口拒收不是备份的文件（400）',
    restoreNotZip.status === 400,
    `${restoreNotZip.status}`,
  )

  const pendingBefore = await call('/api/v1/admin/restore/pending', {
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
  })
  check(
    '被拒的还原没有留下任何待应用状态',
    pendingBefore.status === 200 && dataOf(pendingBefore.payload)?.staged === false,
    `${pendingBefore.status} ${pendingBefore.text.slice(0, 160)}`,
  )

  const cancelRestore = await call('/api/v1/admin/restore/cancel', {
    method: 'POST',
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
  })
  check(
    '取消还原是安全的空操作（200）',
    cancelRestore.status === 200,
    `${cancelRestore.status}`,
  )

  section('15. 设备停用与恢复（停用是可逆的）')

  // 停用保留归属与公钥固定，所以误停用能原样恢复；这两条断言合起来守的就是
  // "停用不会把设备变成永久砖头"，早期版本停用会顺手清空归属与公钥，救不回来。
  const userDeviceId = dataOf(register.payload)?.device?.id
  const blockRes = await call(`/api/v1/admin/devices/${userDeviceId}/block`, {
    method: 'POST',
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
    json: { reason: '冒烟：疑似冒用' },
  })
  check('停用设备（200）', blockRes.status === 200, `${blockRes.status} ${blockRes.text.slice(0, 160)}`)

  const blockedList = await call('/api/v1/admin/devices?limit=100', {
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
  })
  const blockedRow = (dataOf(blockedList.payload) ?? []).find((row) => row.id === userDeviceId)
  check('停用后状态为已停用', blockedRow?.status === 'revoked', String(blockedRow?.status))
  check(
    '停用保留归属（恢复要靠它）',
    typeof blockedRow?.user_id === 'string' && blockedRow.user_id.length > 0,
    String(blockedRow?.user_id),
  )

  const blockedMe = await call('/api/v1/me', { token })
  check('停用会立刻吊销该设备的会话（401）', blockedMe.status === 401, `${blockedMe.status}`)

  const restoreRes = await call(`/api/v1/admin/devices/${userDeviceId}/restore`, {
    method: 'POST',
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
    json: { reason: '冒烟：误停用' },
  })
  check('恢复设备（200）', restoreRes.status === 200, `${restoreRes.status} ${restoreRes.text.slice(0, 160)}`)

  const restoredList = await call('/api/v1/admin/devices?limit=100', {
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
  })
  const restoredRow = (dataOf(restoredList.payload) ?? []).find((row) => row.id === userDeviceId)
  check(
    '有归属的设备恢复后回到已绑定',
    restoredRow?.status === 'active' && restoredRow?.user_id === blockedRow?.user_id,
    `${restoredRow?.status} / ${restoredRow?.user_id}`,
  )

  // 未停用的设备不能"恢复"：状态守卫必须挡住，否则审计里会出现一次没发生过的动作。
  const restoreAgain = await call(`/api/v1/admin/devices/${userDeviceId}/restore`, {
    method: 'POST',
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
    json: { reason: '冒烟：重复恢复' },
  })
  check(
    '未停用的设备拒绝恢复（409）',
    restoreAgain.status === 409,
    `${restoreAgain.status} ${restoreAgain.text.slice(0, 160)}`,
  )

  // 审计日志 = 订单日志：一条订单一条快照（账号 + 设备 + 打印内容），可导出全部 CSV。
  section('16. 审计日志（订单日志）')
  const auditList = await call('/api/v1/admin/audits?limit=50', {
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
  })
  const auditRows = dataOf(auditList.payload)
  check(
    '审计日志可读（200 + 数组）',
    auditList.status === 200 && Array.isArray(auditRows),
    `${auditList.status} ${auditList.text.slice(0, 160)}`,
  )

  const auditRow = (auditRows ?? []).find((row) => row.order_no === order?.order_no)
  check('审计里有前面下的那一单', Boolean(auditRow), `order_no=${order?.order_no}`)
  check(
    '审计记的是账号 + 设备快照',
    auditRow?.username === username && auditRow?.device_fingerprint === `smoke-${suffix}`,
    JSON.stringify(auditRow ?? {}),
  )
  check(
    '审计带打印类型（色彩 / 单双面 / 份数 / 总页数）',
    auditRow?.color_text === '黑白' &&
      auditRow?.duplex_text === '单面' &&
      auditRow?.copies === 2 &&
      auditRow?.total_pages === 6,
    JSON.stringify(auditRow ?? {}),
  )
  check(
    '审计带金额与打印文件名',
    auditRow?.amount_fen === expected && auditRow?.file_name === 'smoke.pdf',
    JSON.stringify({ amount: auditRow?.amount_fen, file: auditRow?.file_name }),
  )

  const auditCsv = await call('/api/v1/admin/audits/export', {
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
  })
  check(
    '导出全部审计日志（200 + CSV 表头）',
    auditCsv.status === 200 &&
      auditCsv.text.includes('订单编号') &&
      auditCsv.text.includes('打印总页数'),
    `${auditCsv.status} ${auditCsv.text.slice(0, 120)}`,
  )
  check(
    '导出的 CSV 含这一单',
    auditCsv.text.includes(order?.order_no ?? '\u0000'),
    `order_no=${order?.order_no}`,
  )

  console.log(`\n结果：${passed} 项通过，${failed} 项失败`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((error) => {
    console.error('\n冒烟测试异常终止：', error)
    process.exitCode = 1
  })
  .finally(async () => {
    if (fakePrinter) await fakePrinter.close()
  })

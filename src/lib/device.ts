/**
 * 浏览器侧的设备身份。
 *
 * 与 Android 端一一对应：Android 用不可导出的 Keystore 密钥，浏览器就用
 * WebCrypto 的 ECDSA-P256 密钥，并把私钥以 `extractable: false` 的形态
 * 存进 IndexedDB。
 *
 * 为什么不是"直接生成不可导出的密钥"：
 * generateKey 的 extractable 参数同时作用于公钥与私钥，设成 false 之后
 * 连公钥都导不出来（无法得到 SPKI 拿去登记）。所以这里先生成可导出的密钥对，
 * 导出公钥后立刻把私钥重新导入为不可导出形态，只持久化这个句柄。
 * 代价是 pkcs8 明文在本次调用栈里短暂存在（无法在 JS 里可靠地清零），
 * 收益是"留在磁盘上的密钥材料不可导出"，后续即使发生 XSS，
 * 攻击者也只能在页面里签名，而无法把长期凭证整块偷走。
 *
 * 注意：设备指纹本身不可信，它只是一个索引；服务端的信任根是这里固定下来的公钥。
 */

import { toBase64, toHex } from './sign'

const DB_NAME = 'payprint'
const DB_VERSION = 1
const STORE_NAME = 'identity'
const RECORD_ID = 'device-identity'

/** DeviceIdentity 是签名所需的最小接口。 */
export interface DeviceIdentity {
  /** 设备指纹。不可信，仅用于让服务端定位到哪一条设备记录。 */
  fingerprint: string
  /** 公钥的 base64(SPKI DER)。 */
  publicKey: string
  /** 对规范化明文签名，返回 base64 的 r||s（64 字节）。 */
  sign: (data: Uint8Array) => Promise<string>
}

interface StoredRecord {
  id: string
  fingerprint: string
  publicKey: string
  privateKey: CryptoKey
  createdAt: number
}

let cached: DeviceIdentity | null = null
let inFlight: Promise<DeviceIdentity> | null = null

/**
 * 判断当前环境是否支持设备身份（需要安全上下文 + IndexedDB）。
 *
 * 这里刻意**不做探测性打开**：`indexedDB.open()` 在受限上下文（禁用打印机数据的
 * 浏览器、隐私窗口、沙箱 iframe）会抛 SecurityError（Firefox 的原文是
 * "Access to storage is not allowed from this context"），探测本身就会制造一次
 * 无意义的异常；而"对象在不在"又说明不了"能不能用"。真正的判定交给第一次
 * 实际使用（`openDatabase` 会把同步异常转成可读原因）。
 */
export function isDeviceIdentitySupported(): boolean {
  return deviceIdentityUnsupportedReason() === null
}

/** 返回不支持设备身份的原因（可展示给用户）；null 表示"看起来可用"。 */
export function deviceIdentityUnsupportedReason(): string | null {
  if (typeof crypto === 'undefined' || typeof crypto.subtle === 'undefined') {
    return '当前浏览器不支持 WebCrypto：设备密钥需要 HTTPS 或 localhost 等安全上下文。'
  }
  if (typeof crypto.subtle.generateKey !== 'function') {
    return '当前浏览器不支持生成设备密钥（WebCrypto 能力不完整），请换用现代浏览器。'
  }
  try {
    // 访问 window.indexedDB 这个 getter 本身在个别受限上下文里也会抛。
    if (typeof indexedDB === 'undefined') {
      return '当前浏览器不提供本地存储（IndexedDB），无法保存设备密钥。'
    }
  } catch (error) {
    return storageHint(error)
  }
  return null
}

function storageHint(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error)
  return (
    '当前页面上下文不允许访问本地存储（IndexedDB）：' +
    detail +
    '。请用普通浏览器窗口直接打开本站（不要在内置预览的沙箱里），或改用 https / localhost 访问。'
  )
}

/**
 * 获取（首次调用时创建）设备身份。
 *
 * 并发调用会共享同一个 Promise，避免同时生成两把密钥导致指纹与公钥不匹配。
 */
export function getDeviceIdentity(): Promise<DeviceIdentity> {
  if (cached) return Promise.resolve(cached)
  if (inFlight) return inFlight

  inFlight = loadOrCreate()
    .then((identity) => {
      cached = identity
      return identity
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

async function loadOrCreate(): Promise<DeviceIdentity> {
  const unsupported = deviceIdentityUnsupportedReason()
  if (unsupported) {
    throw new Error(unsupported)
  }

  const db = await openDatabase()
  try {
    const existing = await readRecord(db)
    if (existing) return wrap(existing)

    const created = await createKeys()
    const record: StoredRecord = {
      id: RECORD_ID,
      fingerprint: newFingerprint(),
      publicKey: created.publicKeyB64,
      privateKey: created.privateKey,
      createdAt: Math.floor(Date.now() / 1000),
    }
    await putRecord(db, record)
    return wrap(record)
  } finally {
    db.close()
  }
}

async function createKeys(): Promise<{ privateKey: CryptoKey; publicKeyB64: string }> {
  // 先生成可导出的密钥对，只为拿到 SPKI / PKCS8 字节。
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair

  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey))
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))

  // 立刻换成不可导出的私钥句柄；落库的是这个句柄，不是 pkcs8 字节。
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )

  return { privateKey, publicKeyB64: toBase64(spki) }
}

function wrap(record: StoredRecord): DeviceIdentity {
  return {
    fingerprint: record.fingerprint,
    publicKey: record.publicKey,
    async sign(data: Uint8Array): Promise<string> {
      const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        record.privateKey,
        // TS 的 BufferSource 类型在部分版本上不接受 Uint8Array<ArrayBufferLike>，
        // 这里显式切片成独立缓冲区，既满足类型也避免共享视图问题。
        data.slice(),
      )
      // WebCrypto 的 ECDSA 输出是紧凑的 r||s（P-256 为 64 字节），
      // 服务端对 64 字节签名按 r||s 解析。
      return toBase64(new Uint8Array(signature))
    },
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (error) {
      // 受限上下文在这里同步抛（Firefox: "Access to storage is not allowed
      // from this context"）；转成可读提示而不是把原始异常抛给界面。
      reject(new Error(storageHint(error)))
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('无法打开本地数据库'))
    request.onblocked = () => reject(new Error('本地数据库被其他标签页占用，请关闭后重试'))
  })
}

function readRecord(db: IDBDatabase): Promise<StoredRecord | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(RECORD_ID)
    request.onsuccess = () => resolve((request.result as StoredRecord | undefined) ?? null)
    request.onerror = () => reject(request.error ?? new Error('读取设备身份失败'))
  })
}

function putRecord(db: IDBDatabase, record: StoredRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('保存设备身份失败'))
    tx.onabort = () => reject(tx.error ?? new Error('保存设备身份失败'))
  })
}

function newFingerprint(): string {
  const buf = new Uint8Array(16)
  crypto.getRandomValues(buf)
  return `web-${toHex(buf)}`
}

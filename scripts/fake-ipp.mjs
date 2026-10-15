/**
 * 极简的假 IPP 打印机，仅供端到端冒烟测试使用。
 *
 * 为什么需要它：真实链路里"确认打印之后"还有一大段要走：IPP 编码、Print-Job 提交、
 * job-state 回查、订单收敛到已完成。没有 CUPS 就完全测不到这一段。
 * 这个假实现只回答三个操作（Get-Printer-Attributes / Print-Job /
 * Get-Job-Attributes），但足以让服务端的整条打印链路跑通。
 *
 * 它同时也是一份"服务端发出去的请求能被独立解析"的证明：
 * 假实现自己解析 IPP 头（版本、操作码、request-id），
 * 如果服务端的编码有问题，这里的解析就会崩。
 */

import http from 'node:http'

// IPP 标签（RFC 8010 6.1 / RFC 8011 5.3）。
const TAG = {
  operationGroup: 0x01,
  jobGroup: 0x02,
  printerGroup: 0x04,
  end: 0x03,
  integer: 0x21,
  boolean: 0x22,
  enum: 0x23,
  text: 0x41,
  keyword: 0x44,
  uri: 0x45,
  charset: 0x47,
  language: 0x48,
}

// 操作码（RFC 8011 4.4.1）。
const OP_PRINT_JOB = 0x0002
const OP_GET_JOB_ATTRIBUTES = 0x0009
const OP_GET_PRINTER_ATTRIBUTES = 0x000b

const STATUS_OK = 0x0000
const STATUS_OPERATION_NOT_SUPPORTED = 0x0501

const u16 = (n) => {
  const b = Buffer.alloc(2)
  b.writeUInt16BE(n & 0xffff)
  return b
}
const u32 = (n) => {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n >>> 0)
  return b
}
const str = (s) => Buffer.from(s, 'utf8')

function encodeAttr(name, tag, value) {
  const nameBuf = Buffer.from(name, 'ascii')
  return Buffer.concat([Buffer.from([tag]), u16(nameBuf.length), nameBuf, u16(value.length), value])
}

function buildResponse(requestId, statusCode, groups) {
  const parts = [u16(0x0200), u16(statusCode), u32(requestId)]
  for (const [groupTag, attrs] of groups) {
    parts.push(Buffer.from([groupTag]))
    for (const attr of attrs) parts.push(encodeAttr(attr.name, attr.tag, attr.value))
  }
  parts.push(Buffer.from([TAG.end]))
  return Buffer.concat(parts)
}

const operationAttrs = () => [
  { name: 'attributes-charset', tag: TAG.charset, value: str('utf-8') },
  { name: 'attributes-natural-language', tag: TAG.language, value: str('en-us') },
]

/**
 * 启动假打印机。
 *
 * @param {{port?: number, state?: string, accepting?: boolean}} options
 *   state: 'idle' | 'processing' | 'stopped'；accepting: 是否接受新任务。
 *   两者都用来验证服务端"放行前必须探测打印机可用"这条规则。
 */
export async function startFakeIpp(options = {}) {
  const port = options.port ?? 8631
  const printerState = options.state ?? 'idle'
  const accepting = options.accepting ?? true

  // 作业一律直接"完成"，让回查循环尽快收敛，测试不必等真实打印时间。
  const jobs = new Map()
  let nextJobId = 1
  const submitted = []

  const stateCode = { idle: 3, processing: 4, stopped: 5 }[printerState] ?? 3

  const server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      if (body.length < 8) {
        res.writeHead(400).end()
        return
      }

      // 只解析头部，够用了：真正的属性内容不是这个假实现关心的。
      const version = body.readUInt16BE(0)
      const op = body.readUInt16BE(2)
      const requestId = body.readUInt32BE(4)

      if (version !== 0x0200) {
        res.writeHead(400).end()
        return
      }

      let response
      if (op === OP_PRINT_JOB) {
        const jobId = nextJobId
        nextJobId += 1
        jobs.set(jobId, 'completed')
        submitted.push(jobId)
        response = buildResponse(requestId, STATUS_OK, [
          [TAG.operationGroup, operationAttrs()],
          [
            TAG.jobGroup,
            [
              { name: 'job-id', tag: TAG.integer, value: u32(jobId) },
              {
                name: 'job-uri',
                tag: TAG.uri,
                value: str(`ipp://127.0.0.1:${port}/ipp/print/jobs/${jobId}`),
              },
              // 3 = pending：Print-Job 成功只代表入队，服务端必须靠回查才知道结果。
              { name: 'job-state', tag: TAG.enum, value: u32(3) },
            ],
          ],
        ])
      } else if (op === OP_GET_JOB_ATTRIBUTES) {
        const jobId = jobs.keys().next().value ?? 1
        response = buildResponse(requestId, STATUS_OK, [
          [TAG.operationGroup, operationAttrs()],
          [
            TAG.jobGroup,
            [
              { name: 'job-id', tag: TAG.integer, value: u32(jobId) },
              { name: 'job-state', tag: TAG.enum, value: u32(9) }, // 9 = completed
              {
                name: 'job-state-reasons',
                tag: TAG.keyword,
                value: str('job-completed-successfully'),
              },
            ],
          ],
        ])
      } else if (op === OP_GET_PRINTER_ATTRIBUTES) {
        response = buildResponse(requestId, STATUS_OK, [
          [TAG.operationGroup, operationAttrs()],
          [
            TAG.printerGroup,
            [
              { name: 'printer-state', tag: TAG.enum, value: u32(stateCode) },
              { name: 'printer-state-reasons', tag: TAG.keyword, value: str('none') },
              { name: 'printer-is-accepting-jobs', tag: TAG.boolean, value: Buffer.from([accepting ? 1 : 0]) },
              { name: 'printer-make-and-model', tag: TAG.text, value: str('Fake IPP Printer') },
            ],
          ],
        ])
      } else {
        response = buildResponse(requestId, STATUS_OPERATION_NOT_SUPPORTED, [])
      }

      res.writeHead(200, { 'Content-Type': 'application/ipp' })
      res.end(response)
    })
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })

  return {
    /** CUPS 队列地址，直接写进 printers.cups_uri。 */
    uri: `ipp://127.0.0.1:${port}/ipp/print`,
    /** 收到过的作业号，用来断言"一个订单只投递一次"。 */
    submittedJobIds: () => [...submitted],
    async close() {
      await new Promise((resolve) => server.close(resolve))
    },
  }
}

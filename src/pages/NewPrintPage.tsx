/**
 * 新建打印：选打印机 → 拖拽上传 → 选参数（实时计价预览）→ 下单 → 待支付。
 *
 * 可读性设计：
 *  - 三步各一张卡片，标题带序号 + 一句说明（这一步要干什么、有什么限制）；
 *  - 打印机卡片只留**决策需要的信息**：名称、营业状态、位置、是否在营业时段；
 *    单价明细不铺在这里（用户选机器时不需要比价，放多了反而看不清名称）；
 *  - 文件与打印机列表逐项入场（OpenList 的列表项动效），选中态一眼可见。
 *
 * 金额永远由服务端算；这里只用 quote.ts 做同口径预览。
 */

import { For, Show, createMemo, createSignal } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { Box, Button, HStack, Input, Spinner, Text, VStack } from '@hope-ui/solid'
import { FiCheckCircle, FiClock, FiFileText, FiImage, FiMapPin, FiUploadCloud } from 'solid-icons/fi'

import { useMeta, usePrinters, useRecentFiles, useUploadFile, useCreateOrder, useReportPayment } from '../hooks/queries'
import { SectionCard, StatusBadge, EmptyText, ErrorText, PageTitle, Hint } from '../components/ui'
import { PrintParamsForm } from '../components/PrintParamsForm'
import { FilePreview } from '../components/FilePreview'
import { MotionItem } from '../components/motion'
import { quotePreview, defaultPrintParams } from '../lib/quote'
import { fileSize, money, dateTime } from '../lib/format'
import type { PrintFileView, PrintParams } from '../lib/types'
import { t } from '../app/i18n'

export default function NewPrintPage() {
  const navigate = useNavigate()
  const meta = useMeta()
  const printers = usePrinters(false)
  const files = useRecentFiles()
  const upload = useUploadFile()
  const createOrder = useCreateOrder()
  const reportPayment = useReportPayment()

  const [printerId, setPrinterId] = createSignal('')
  const [fileId, setFileId] = createSignal('')
  const [title, setTitle] = createSignal('')
  const [params, setParams] = createSignal<PrintParams>(defaultPrintParams())
  const [error, setError] = createSignal('')
  const [payHint, setPayHint] = createSignal('')
  const [dragging, setDragging] = createSignal(false)
  let inputRef: HTMLInputElement | undefined

  const printer = createMemo(() => printers.data?.find((p: { id: string }) => p.id === printerId()))
  const uploaded = createMemo(() => files.data?.find((f: PrintFileView) => f.id === fileId()))
  const pagesTotal = createMemo(() => uploaded()?.page_count ?? 0)

  const cost = createMemo(() => {
    if (!printer() || pagesTotal() <= 0) return null
    try {
      return quotePreview(params(), pagesTotal(), printer())
    } catch {
      return null
    }
  })

  const pickFile = (f: PrintFileView) => {
    setFileId(f.id)
    if (!title()) setTitle(f.name.replace(/\.[^.]+$/, ''))
  }

  const doUpload = async (file: File | undefined) => {
    if (!file) return
    setError('')
    try {
      const view = await upload.mutateAsync({ file })
      pickFile(view)
    } catch {
      setError(t('print.upload_failed'))
    }
  }

  const submit = async (e: Event) => {
    e.preventDefault()
    setError('')
    setPayHint('')
    if (!printer()) return setError(t('print.choose_printer_first'))
    if (!uploaded()) return setError(t('print.choose_file_first'))
    try {
      const order = await createOrder.mutateAsync({
        fileId: uploaded()!.id,
        printerId: printer()!.id,
        title: title().trim() || undefined,
        params: params(),
      })
      if (order.is_free || order.amount_fen === 0) {
        navigate(`/orders/${order.id}`)
        return
      }
      setPayHint(t('print.order_created_pay', { amount: money(order.amount_fen) }))
      // 联调链路：浏览器里模拟一次"收款设备上报"（正式链路该接口由现场凭据调用）。
      try {
        const result = await reportPayment.mutateAsync({ orderNo: order.order_no, amountFen: order.amount_fen })
        if (result.accepted) setPayHint(t('print.paid_confirm_hint'))
        else setPayHint(t('print.pay_report_rejected', { reason: result.reason ?? result.status_text }))
      } catch {
        /* 上报失败不影响订单：现场扫码付款后由收款设备上报 */
      }
      navigate(`/orders/${order.id}`)
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'amount_duplicate') setError(t('print.amount_duplicate'))
      else if (code === 'printer_closed') setError(t('print.printer_closed'))
      else if (code === 'param_unsupported') setError(t('print.param_unsupported'))
      else if (code === 'payment_unmatched' || code === 'payment_ambiguous') setError(t('print.pay_report_rejected_generic'))
      else setError(t('print.create_failed'))
    }
  }

  const isImage = (f: PrintFileView) => /image\//.test(f.content_type)

  return (
    <VStack spacing="$5" alignItems="stretch">
      <PageTitle description={t('print.subtitle')}>{t('print.title')}</PageTitle>
      <ErrorText>{error()}</ErrorText>
      <Show when={payHint()}>
        <Text color="$primary" fontSize="$sm">
          {payHint()}
        </Text>
      </Show>

      {/* 1. 选打印机 */}
      <SectionCard
        step={1}
        title={t('print.step_printer')}
        description={t('print.step_printer_desc')}
        extra={
          <Show when={printer()}>
            <HStack spacing="4px" alignItems="center">
              <FiCheckCircle size={14} color="var(--hope-colors-primary)" />
              <Text fontSize="$xs" color="$primary" fontWeight="semibold">
                {printer()!.name}
              </Text>
            </HStack>
          </Show>
        }
      >
        <Show when={printers.isLoading}>
          <Spinner />
        </Show>
        <Show when={!printers.isLoading && (printers.data?.length ?? 0) === 0}>
          <EmptyText>{t('print.no_printers')}</EmptyText>
        </Show>
        <Box class="pp-grid pp-grid-2" mt="$3">
          <For each={printers.data ?? []}>
            {(p, i) => {
              const selected = () => printerId() === p.id
              return (
                <MotionItem index={i()}>
                  <Box
                    class="pp-card"
                    classList={{ selected: selected() }}
                    as="button"
                    type="button"
                    w="100%"
                    h="100%"
                    onClick={() => setPrinterId(p.id)}
                    px="$4"
                    py="$3"
                    rounded="$lg"
                    borderWidth="1px"
                    borderColor={selected() ? '$primary' : '$border'}
                    bg={selected() ? '$primarySoft' : '$surface1'}
                    textAlign="left"
                    cursor="pointer"
                  >
                    <HStack spacing="$2" justifyContent="space-between" alignItems="flex-start">
                      <Text fontWeight="semibold" fontSize="$sm">
                        {p.name}
                      </Text>
                      <StatusBadge tone={p.tone} text={p.status_text} />
                    </HStack>
                    <HStack spacing="$3" flexWrap="wrap" mt="$2">
                      <Show when={p.location}>
                        <HStack spacing="4px" alignItems="center">
                          <FiMapPin size={13} color="var(--hope-colors-subtleText)" />
                          <Text fontSize="$xs" color="$subtleText">
                            {p.location}
                          </Text>
                        </HStack>
                      </Show>
                      <HStack spacing="4px" alignItems="center">
                        <FiClock size={13} color="var(--hope-colors-subtleText)" />
                        <Text fontSize="$xs" color="$subtleText">
                          {p.within_schedule ? t('print.within_schedule') : t('print.out_of_schedule')}
                        </Text>
                      </HStack>
                    </HStack>
                    <Show when={selected()}>
                      <HStack spacing="4px" alignItems="center" mt="$2">
                        <FiCheckCircle size={14} color="var(--hope-colors-primary)" />
                        <Text fontSize="$xs" color="$primary" fontWeight="semibold">
                          {t('print.selected')}
                        </Text>
                      </HStack>
                    </Show>
                  </Box>
                </MotionItem>
              )
            }}
          </For>
        </Box>
      </SectionCard>

      {/* 2. 文件：拖拽区 + 最近文件卡片 */}
      <SectionCard delay={0.05} step={2} title={t('print.step_file')} description={t('print.step_file_desc')}>
        <VStack alignItems="stretch" spacing="$4">
          <Box
            class="pp-drop"
            borderWidth="2px"
            borderStyle="dashed"
            borderColor={dragging() ? '$primary' : '$border'}
            bg={dragging() ? '$primarySoft' : '$surface3'}
            rounded="$lg"
            px="$5"
            py="$6"
            textAlign="center"
            cursor="pointer"
            onClick={() => inputRef?.click()}
            onDragOver={(e: DragEvent) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e: DragEvent) => {
              e.preventDefault()
              setDragging(false)
              void doUpload(e.dataTransfer?.files?.[0])
            }}
          >
            <VStack spacing="$2" alignItems="center">
              <Show when={upload.isPending} fallback={<FiUploadCloud size={34} />}>
                <Spinner size="lg" />
              </Show>
              <Text fontWeight="semibold">{upload.isPending ? t('print.uploading') : t('print.drop_here')}</Text>
              <Text fontSize="$xs" color="$subtleText" class="pp-help">
                {t('print.upload_hint', { max: fileSize(meta.data?.upload_max_bytes ?? 20 * 1024 * 1024) })}
              </Text>
            </VStack>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              style={{ display: 'none' }}
              onChange={(e) => void doUpload(e.currentTarget.files?.[0] ?? undefined)}
            />
          </Box>

          <Show when={files.data && files.data.length > 0}>
            <VStack alignItems="stretch" spacing="$2">
              <Text fontSize="$sm" fontWeight="semibold">
                {t('print.recent_files')}
              </Text>
              <Box class="pp-grid pp-grid-2">
                <For each={files.data ?? []}>
                  {(f: PrintFileView, i) => {
                    const selected = () => fileId() === f.id
                    return (
                      <MotionItem index={i()}>
                        <Box
                          class="pp-card"
                          classList={{ selected: selected() }}
                          as="button"
                          type="button"
                          w="100%"
                          h="100%"
                          onClick={() => pickFile(f)}
                          px="$3"
                          py="$2"
                          rounded="$md"
                          borderWidth="1px"
                          borderColor={selected() ? '$primary' : '$border'}
                          bg={selected() ? '$primarySoft' : '$surface1'}
                          textAlign="left"
                          cursor="pointer"
                        >
                          <HStack spacing="$2" alignItems="center">
                            <Show when={isImage(f)} fallback={<FiFileText size={18} />}>
                              <FiImage size={18} />
                            </Show>
                            <Box minW="0" flex="1">
                              <Text
                                fontSize="$sm"
                                fontWeight={selected() ? 'semibold' : 'normal'}
                                css={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
                              >
                                {f.name}
                              </Text>
                              <Text fontSize="$xs" color="$subtleText">
                                {f.page_count} {t('print.pages')} · {fileSize(f.size_bytes)} · {dateTime(f.created_at)}
                              </Text>
                            </Box>
                          </HStack>
                        </Box>
                      </MotionItem>
                    )
                  }}
                </For>
              </Box>
            </VStack>
          </Show>

          <Show when={uploaded()}>
            <VStack alignItems="stretch" spacing="$2">
              <Text fontSize="$sm" fontWeight="semibold">
                {t('print.preview')}
              </Text>
              <FilePreview fileId={uploaded()!.id} />
            </VStack>
          </Show>
        </VStack>
      </SectionCard>

      {/* 3. 参数与下单 */}
      <SectionCard delay={0.1} step={3} title={t('print.step_params')} description={t('print.step_params_desc')}>
        <VStack as="form" onSubmit={submit} alignItems="stretch" spacing="$5">
          <VStack alignItems="stretch" spacing="6px">
            <Text fontSize="$sm" fontWeight="semibold">
              {t('print.order_title')}
            </Text>
            <Input
              maxW="420px"
              value={title()}
              onInput={(e) => setTitle(e.currentTarget.value)}
              placeholder={t('print.order_title_hint')}
            />
          </VStack>

          <Show when={printer()} fallback={<EmptyText>{t('print.choose_printer_first')}</EmptyText>}>
            <PrintParamsForm
              params={params()}
              onChange={setParams}
              printer={printer()!}
              meta={meta.data}
              pageTotal={pagesTotal()}
            />
          </Show>

          {/* 计价条：金额最醒目，口径说明紧随其下 */}
          <Box borderWidth="1px" borderColor="$border" bg="$surface3" rounded="$lg" px="$4" py="$3">
            <HStack justifyContent="space-between" flexWrap="wrap" alignItems="flex-end" gap="$2">
              <VStack alignItems="stretch" spacing="2px">
                <Text fontSize="$sm" color="$subtleText">
                  {t('print.cost_label')}
                </Text>
                <Hint>
                  {cost()?.error ?? `${pagesTotal() || 0} ${t('print.pages')} · ${t('print.cost_server_side')}`}
                </Hint>
              </VStack>
              <Text fontSize="$3xl" fontWeight="bold" color="$primary" class="pp-num" lineHeight="1.1">
                {cost() ? money(cost()!.totalFen) : '—'}
              </Text>
            </HStack>
          </Box>

          <ErrorText>{createOrder.isError ? t('print.create_failed') : ''}</ErrorText>
          <Button type="submit" loading={createOrder.isPending} disabled={!printer() || !uploaded()}>
            {t('print.submit')}
          </Button>
        </VStack>
      </SectionCard>
    </VStack>
  )
}

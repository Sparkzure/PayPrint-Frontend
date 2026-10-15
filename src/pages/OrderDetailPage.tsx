/**
 * 订单详情：状态、倒计时、取消（待支付）、确认打印（唯一出纸入口）、任务进度。
 * 动作可用性全部以服务端的 can_pay / can_cancel / can_release 为准。
 *
 * 可读性：键值信息统一走 InfoGrid + InfoRow（标签小灰字在上、值在下，长订单号/位置不会挤成一团），
 * 数字/编号用等宽数字对齐。原来的本地 InfoRow 靠 `/no$/i` 猜"这一行是不是编号"来改字重，
 * 换了语言就失效，已经删掉。
 */

import { Show, createSignal } from 'solid-js'
import { useParams } from '@solidjs/router'
import { Box, Button, HStack, Spinner, Text, VStack, Alert, AlertIcon } from '@hope-ui/solid'

import { useOrder, useCancelOrder, useReleaseOrder } from '../hooks/queries'
import { SectionCard, StatusBadge, EmptyText, ErrorText, InfoGrid, InfoRow } from '../components/ui'
import { FilePreview } from '../components/FilePreview'
import { FadeIn } from '../components/motion'
import { money, countdown, dateTime } from '../lib/format'
import { t } from '../app/i18n'

export default function OrderDetailPage() {
  const params = useParams()
  const query = useOrder(params.orderId)
  const cancelOrder = useCancelOrder()
  const releaseOrder = useReleaseOrder()
  const [actionError, setActionError] = createSignal('')

  const order = () => query.data

  const onCancel = async () => {
    setActionError('')
    try {
      await cancelOrder.mutateAsync(order()!.id)
    } catch {
      setActionError(t('order.cancel_failed'))
    }
  }

  const onRelease = async () => {
    setActionError('')
    try {
      await releaseOrder.mutateAsync(order()!.id)
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'printer_offline') setActionError(t('order.printer_offline'))
      else if (code === 'release_window_closed') setActionError(t('order.window_closed'))
      else if (code === 'payment_verification_failed' || code === 'disputed')
        setActionError(t('order.verify_failed'))
      else setActionError(t('order.release_failed'))
    }
  }

  return (
    <Show
      when={order()}
      fallback={
        <Box display="flex" justifyContent="center" p="$8">
          <Spinner />
        </Box>
      }
    >
      <VStack spacing="$5" alignItems="stretch">
        <FadeIn>
          <HStack justifyContent="space-between" flexWrap="wrap" gap="$3" alignItems="center">
            <HStack spacing="$2" alignItems="center" flexWrap="wrap" minW="0">
              <Text fontSize="$2xl" fontWeight="bold">
                {order()!.title || order()!.file_name}
              </Text>
              <StatusBadge tone={order()!.tone} text={order()!.status_text} />
            </HStack>
            <Text fontSize="$2xl" fontWeight="bold" class="pp-num" color="$primary">
              {money(order()!.amount_fen)}
            </Text>
          </HStack>
        </FadeIn>

        <Show when={order()!.remaining_seconds > 0}>
          <Alert status={order()!.can_pay ? 'warning' : 'info'}>
            <AlertIcon />
            <Text fontSize="$sm">
              {order()!.can_pay ? t('order.pay_left') : t('order.confirm_left')}
              {countdown(order()!.remaining_seconds)}
              <Show when={order()!.can_pay}>
                {' · '}
                {t('order.pay_notice')}
              </Show>
            </Text>
          </Alert>
        </Show>

        <ErrorText>{actionError()}</ErrorText>

        {/* 动作区（移动端同样紧跟状态展示：先能做什么，再看细节） */}
        <HStack gap="$3" flexWrap="wrap">
          <Show when={order()!.can_release}>
            <Button colorScheme="info" onClick={onRelease} loading={releaseOrder.isPending}>
              {t('order.release')}
            </Button>
          </Show>
          <Show when={order()!.can_cancel}>
            <Button variant="outline" colorScheme="neutral" onClick={onCancel} loading={cancelOrder.isPending}>
              {t('order.cancel')}
            </Button>
          </Show>
        </HStack>

        <SectionCard delay={0.05} title={t('order.section_info')}>
          <InfoGrid>
            <InfoRow label={t('order.order_no')} value={order()!.order_no} mono />
            <InfoRow label={t('order.printer')} value={`${order()!.printer_name}（${order()!.printer_code}）`} />
            <Show when={order()!.printer_location}>
              <InfoRow label={t('order.printer_location')} value={order()!.printer_location!} />
            </Show>
            <InfoRow
              label={t('order.file')}
              value={`${order()!.file_name} · ${order()!.file_page_count} ${t('print.pages')}`}
            />
            <InfoRow label={t('order.amount')} value={money(order()!.amount_fen)} mono />
            <Show when={order()!.is_free}>
              <InfoRow label={t('order.free')} value={t('account.free_print_on')} />
            </Show>
            <InfoRow label={t('order.created_at')} value={dateTime(order()!.created_at)} mono />
            <Show when={order()!.completed_at}>
              <InfoRow label={t('order.completed_at')} value={dateTime(order()!.completed_at!)} mono />
            </Show>
            <Show when={order()!.close_reason}>
              <InfoRow label={t('order.close_reason')} value={order()!.close_reason!} />
            </Show>
          </InfoGrid>
        </SectionCard>

        <Show when={order()!.params}>
          <SectionCard delay={0.1} title={t('order.section_params')}>
            <VStack alignItems="stretch" spacing="$4">
              <InfoGrid>
                <InfoRow label={t('params.copies')} value={String(order()!.params!.copies)} mono />
                <InfoRow label={t('params.duplex')} value={duplexText(order()!.params!.duplex)} />
                <InfoRow label={t('params.color_mode')} value={colorText(order()!.params!.color_mode)} />
                <InfoRow label={t('params.paper_size')} value={order()!.params!.paper_size} />
                <Show when={order()!.params!.page_range}>
                  <InfoRow label={t('params.page_range')} value={order()!.params!.page_range} />
                </Show>
                <Show when={order()!.params!.n_up > 1}>
                  <InfoRow
                    label={t('params.n_up')}
                    value={t('params.n_up_multi', { n: order()!.params!.n_up })}
                  />
                </Show>
              </InfoGrid>
              <Show when={order()!.cost}>
                <Text fontSize="$sm" color="$subtleText" class="pp-help">
                  {order()!.cost!.explanation}
                </Text>
              </Show>
            </VStack>
          </SectionCard>
        </Show>

        <SectionCard delay={0.15} title={t('order.section_job')}>
          <Show
            when={order()!.job_status && order()!.job_status !== 'none'}
            fallback={<EmptyText>{t('order.job_none')}</EmptyText>}
          >
            <VStack alignItems="stretch" spacing="$3">
              <StatusBadge tone={order()!.job_tone} text={order()!.job_status_text} />
              <InfoGrid>
                <Show when={order()!.cups_job_id > 0}>
                  <InfoRow label={t('order.cups_job_id')} value={String(order()!.cups_job_id)} mono />
                </Show>
                <Show when={order()!.job_attempts > 0}>
                  <InfoRow label={t('order.job_attempts')} value={String(order()!.job_attempts)} mono />
                </Show>
              </InfoGrid>
              <Show when={order()!.job_error}>
                <Text fontSize="$sm" color="$danger" class="pp-help">
                  {order()!.job_error}
                </Text>
              </Show>
            </VStack>
          </Show>
        </SectionCard>

        <SectionCard delay={0.2} title={t('order.section_preview')}>
          <FilePreview fileId={order()!.file_id} />
        </SectionCard>

        <Box />
      </VStack>
    </Show>
  )
}

function duplexText(v: string): string {
  if (v === 'long_edge') return t('params.duplex_long_edge')
  if (v === 'short_edge') return t('params.duplex_short_edge')
  return t('params.duplex_one_sided')
}

function colorText(v: string): string {
  return v === 'color' ? t('params.color_color') : t('params.color_mono')
}

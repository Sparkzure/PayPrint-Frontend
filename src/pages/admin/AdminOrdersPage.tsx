/* 管理订单：退款（理由必填）与人工重推（守卫在服务端）。 */

import { For, Show, createSignal } from 'solid-js'
import { Box, Button, HStack, Table, Tbody, Td, Th, Thead, Tr, Text, VStack } from '@hope-ui/solid'

import { useAdminOrders, useRefundOrder, useRetryOrder } from '../../hooks/adminQueries'
import { PageTitle, ReasonModal, SectionCard, StatusBadge, EmptyText, ErrorText } from '../../components/ui'
import { rowEnter } from '../../components/motion'
import { money, dateTime } from '../../lib/format'
import { t } from '../../app/i18n'

export default function AdminOrdersPage() {
  const query = useAdminOrders(50)
  const refund = useRefundOrder()
  const retry = useRetryOrder()
  const [refundTarget, setRefundTarget] = createSignal<string | null>(null)
  const [actionError, setActionError] = createSignal('')

  const doRefund = async (input: { orderId: string; reason: string }) => {
    setActionError('')
    try {
      await refund.mutateAsync({ orderId: input.orderId, reason: input.reason || t('admin.refund_default_reason') })
    } catch {
      setActionError(t('admin.refund_failed'))
    }
  }

  const doRetry = async (orderId: string) => {
    setActionError('')
    try {
      await retry.mutateAsync(orderId)
    } catch (err) {
      const code = (err as { code?: string }).code
      setActionError(code === 'job_not_retryable' ? t('admin.retry_not_allowed') : t('admin.retry_failed'))
    }
  }

  return (
    <VStack spacing="$4" alignItems="stretch">
      <PageTitle description={t('admin.orders.subtitle')}>{t('admin.orders.title')}</PageTitle>
      <ErrorText>{actionError()}</ErrorText>
      <ErrorText>{query.isError ? t('global.load_failed') : ''}</ErrorText>

      <Show when={query.data && query.data.data.length === 0}>
        <EmptyText>{t('admin.orders.empty')}</EmptyText>
      </Show>

      <Show when={query.data && query.data.data.length > 0}>
        <SectionCard delay={0.05}>
          <Box overflowX="auto">
            <Table dense highlightOnHover class="pp-table">
              <Thead>
                <Tr>
                  <Th>{t('order.order_no')}</Th>
                  <Th>{t('admin.orders.user')}</Th>
                  <Th>{t('admin.orders.status')}</Th>
                  <Th css={{ textAlign: 'right' }}>{t('order.amount')}</Th>
                  <Th>{t('order.created_at')}</Th>
                  <Th>{t('admin.actions')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                <For each={query.data!.data}>
                  {(order, i) => (
                    <Tr {...rowEnter(i())}>
                      <Td>
                        <Text fontSize="$sm" fontWeight="medium">
                          {order.order_no}
                        </Text>
                        <Text fontSize="$xs" color="$subtleText">
                          {order.title || order.file_name}
                        </Text>
                      </Td>
                      <Td fontSize="$sm">{order.username ?? '—'}</Td>
                      <Td>
                        <HStack spacing="$1">
                          <StatusBadge tone={order.tone} text={order.status_text} />
                          <Show when={order.job_status && order.job_status !== 'none'}>
                            <StatusBadge tone={order.job_tone} text={order.job_status_text} />
                          </Show>
                        </HStack>
                      </Td>
                      <Td css={{ textAlign: 'right' }} fontSize="$sm">
                        {money(order.amount_fen)}
                      </Td>
                      <Td fontSize="$xs" color="$subtleText">
                        {dateTime(order.created_at)}
                      </Td>
                      <Td>
                        <HStack spacing="$1">
                          <Show when={order.status === 'awaiting_payment' || order.status === 'awaiting_release'}>
                            <Button size="xs" variant="outline" colorScheme="warning" onClick={() => setRefundTarget(order.id)}>
                              {t('admin.refund')}
                            </Button>
                          </Show>
                          <Show
                            when={
                              order.job_status === 'pending' ||
                              order.job_status === 'failed' ||
                              order.job_status === 'needs_review'
                            }
                          >
                            <Button size="xs" variant="outline" onClick={() => doRetry(order.id)}>
                              {t('admin.retry')}
                            </Button>
                          </Show>
                        </HStack>
                      </Td>
                    </Tr>
                  )}
                </For>
              </Tbody>
            </Table>
          </Box>
        </SectionCard>
      </Show>

      <ReasonModal
        open={refundTarget() !== null}
        title={t('admin.refund_reason_title')}
        danger
        onConfirm={(reason) => refundTarget() && doRefund({ orderId: refundTarget()!, reason })}
        onClose={() => setRefundTarget(null)}
      />
    </VStack>
  )
}


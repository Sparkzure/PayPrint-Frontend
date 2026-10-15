/* 订单列表：纵向卡片（不做横向滚动），点进详情。逐项入场，金额等宽对齐。 */

import { For, Show } from 'solid-js'
import { A } from '@solidjs/router'
import { Button, HStack, Text, VStack } from '@hope-ui/solid'

import { useOrders } from '../hooks/queries'
import { SectionCard, StatusBadge, EmptyText, ErrorText, PageTitle, Hint } from '../components/ui'
import { MotionItem } from '../components/motion'
import { money, countdown, dateTime } from '../lib/format'
import { t } from '../app/i18n'

export default function OrdersPage() {
  const query = useOrders(20)

  return (
    <VStack spacing="$5" alignItems="stretch">
      <PageTitle description={t('orders.subtitle')}>{t('orders.title')}</PageTitle>
      <Show when={query.isError}>
        <ErrorText>{t('global.load_failed')}</ErrorText>
      </Show>
      <Show when={query.data && query.data.data.length === 0}>
        <EmptyText>{t('orders.empty')}</EmptyText>
      </Show>
      <VStack alignItems="stretch" spacing="$3">
        <For each={query.data?.data ?? []}>
          {(order, i) => (
            <MotionItem index={i()}>
              <A href={`/orders/${order.id}`} class="order-card-link">
                <SectionCard delay={false}>
                  <VStack alignItems="stretch" spacing="$2">
                    <HStack justifyContent="space-between" flexWrap="wrap" gap="$2" alignItems="center">
                      <HStack spacing="$2" alignItems="center" minW="0">
                        <StatusBadge tone={order.tone} text={order.status_text} />
                        <Text fontWeight="semibold">{order.title || order.file_name}</Text>
                      </HStack>
                      <Text fontWeight="bold" class="pp-num">
                        {money(order.amount_fen)}
                      </Text>
                    </HStack>
                    <HStack spacing="$2" flexWrap="wrap">
                      <Text fontSize="$sm" color="$subtleText">
                        {order.printer_name}
                      </Text>
                      <Text fontSize="$sm" color="$subtleText">
                        ·
                      </Text>
                      <Text fontSize="$sm" color="$subtleText" class="pp-num">
                        {dateTime(order.created_at)}
                      </Text>
                    </HStack>
                    <Show when={order.remaining_seconds > 0}>
                      <Text fontSize="$sm" fontWeight="medium" color={order.can_pay ? '$warning' : '$primary'}>
                        {order.can_pay ? t('orders.pay_left') : t('orders.confirm_left')}
                        <Text as="span" class="pp-num">
                          {countdown(order.remaining_seconds)}
                        </Text>
                      </Text>
                    </Show>
                  </VStack>
                </SectionCard>
              </A>
            </MotionItem>
          )}
        </For>
      </VStack>
      <Show when={query.data && query.data.data.length > 0}>
        <Hint>{t('orders.showing', { count: query.data?.data.length ?? 0 })}</Hint>
      </Show>
      <Button variant="ghost" size="sm" onClick={() => query.refetch()} alignSelf="center">
        {t('global.refresh')}
      </Button>
    </VStack>
  )
}

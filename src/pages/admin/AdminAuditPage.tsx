/* 审计日志：订单日志只读预览（100 条）+ 全量 CSV 导出。快照表，不可修改。 */

import { For, Show } from 'solid-js'
import { Button, HStack, Table, Tbody, Td, Th, Thead, Tr, Text, VStack, Box } from '@hope-ui/solid'

import { useAudits, useDownloadAuditCSV } from '../../hooks/adminQueries'
import { PageTitle, SectionCard, EmptyText, ErrorText } from '../../components/ui'
import { rowEnter } from '../../components/motion'
import { money, dateTime } from '../../lib/format'
import { t } from '../../app/i18n'

export default function AdminAuditPage() {
  const query = useAudits(100, 0)
  const download = useDownloadAuditCSV()

  return (
    <VStack spacing="$4" alignItems="stretch">
      <HStack justifyContent="space-between" flexWrap="wrap">
        <PageTitle description={t('admin.audits.subtitle')}>{t('admin.audits.title')}</PageTitle>
        <Button size="sm" variant="outline" loading={download.isPending} onClick={() => download.mutateAsync()}>
          {t('admin.audits.export_csv')}
        </Button>
      </HStack>
      <Text fontSize="$sm" color="$subtleText">
        {t('admin.audits.note')}
      </Text>
      <ErrorText>{query.isError ? t('global.load_failed') : ''}</ErrorText>

      <Show when={query.data && query.data.data.length === 0}>
        <EmptyText>{t('admin.audits.empty')}</EmptyText>
      </Show>

      <Show when={query.data && query.data.data.length > 0}>
        <SectionCard delay={0.05}>
          <Box overflowX="auto">
            <Table dense highlightOnHover class="pp-table">
              <Thead>
                <Tr>
                  <Th>{t('order.order_no')}</Th>
                  <Th>{t('admin.audits.user')}</Th>
                  <Th>{t('admin.audits.device')}</Th>
                  <Th>{t('admin.audits.print_type')}</Th>
                  <Th css={{ textAlign: 'right' }}>{t('order.amount')}</Th>
                  <Th>{t('order.created_at')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                <For each={query.data!.data}>
                  {(audit, i) => (
                    <Tr {...rowEnter(i())}>
                      <Td fontSize="$sm">{audit.order_no}</Td>
                      <Td fontSize="$sm">{audit.username}</Td>
                      <Td fontSize="$xs" color="$subtleText">
                        {audit.device_label}
                      </Td>
                      <Td fontSize="$xs">
                        {audit.color_text} · {audit.duplex_text} × {audit.copies} · {audit.total_pages} {t('print.pages')}
                      </Td>
                      <Td css={{ textAlign: 'right' }} fontSize="$sm">
                        {money(audit.amount_fen)}
                      </Td>
                      <Td fontSize="$xs" color="$subtleText">
                        {dateTime(audit.created_at)}
                      </Td>
                    </Tr>
                  )}
                </For>
              </Tbody>
            </Table>
          </Box>
        </SectionCard>
      </Show>
    </VStack>
  )
}

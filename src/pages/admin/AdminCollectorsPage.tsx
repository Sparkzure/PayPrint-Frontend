/* 收款设备：签发（明文令牌只回一次）/ 列表 / 吊销（软删）/ 彻底删除（硬删）。 */

import { For, Show, createSignal } from 'solid-js'
import { Alert, AlertIcon, Button, FormControl, FormLabel, HStack, Input, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Table, Tbody, Td, Text, Th, Thead, Tr, VStack, Box } from '@hope-ui/solid'

import { useAdminCollectors, useAdminPrinters, useIssueCollector, useRevokeCollector, usePurgeCollector } from '../../hooks/adminQueries'
import { PageTitle, ReasonModal, SectionCard, StatusBadge, EmptyText, ErrorText } from '../../components/ui'
import { rowEnter } from '../../components/motion'
import { dateTime } from '../../lib/format'
import type { CollectorView } from '../../lib/types'
import { t } from '../../app/i18n'

export default function AdminCollectorsPage() {
  const query = useAdminCollectors()
  const printers = useAdminPrinters()
  const issue = useIssueCollector()
  const revoke = useRevokeCollector()
  const purge = usePurgeCollector()

  const [issueOpen, setIssueOpen] = createSignal(false)
  const [printerCode, setPrinterCode] = createSignal('')
  const [label, setLabel] = createSignal('')
  const [issueError, setIssueError] = createSignal('')
  const [issued, setIssued] = createSignal<string | null>(null)
  const [revokeTarget, setRevokeTarget] = createSignal<CollectorView | null>(null)
  const [purgeTarget, setPurgeTarget] = createSignal<CollectorView | null>(null)
  const [error, setError] = createSignal('')

  const doIssue = async (e: Event) => {
    e.preventDefault()
    setIssueError('')
    try {
      const result = await issue.mutateAsync({ printerCode: printerCode().trim(), label: label().trim() })
      setIssued(result.token)
      setIssueOpen(false)
      setPrinterCode('')
      setLabel('')
    } catch (err) {
      const code = (err as { code?: string }).code
      setIssueError(code === 'printer_not_found' ? t('admin.collectors.printer_not_found') : t('admin.collectors.issue_failed'))
    }
  }

  const doRevoke = async (reason: string) => {
    const target = revokeTarget()
    if (!target) return
    setError('')
    try {
      await revoke.mutateAsync({ collectorId: target.id, reason: reason || t('admin.collectors.default_revoke_reason') })
    } catch {
      setError(t('admin.collectors.revoke_failed'))
    }
  }

  const doPurge = async (reason: string) => {
    const target = purgeTarget()
    if (!target) return
    setError('')
    try {
      await purge.mutateAsync({ collectorId: target.id, reason: reason || t('admin.collectors.default_purge_reason') })
    } catch {
      setError(t('admin.collectors.purge_failed'))
    }
  }

  return (
    <VStack spacing="$4" alignItems="stretch">
      <HStack justifyContent="space-between" flexWrap="wrap">
        <PageTitle description={t('admin.collectors.subtitle')}>{t('admin.collectors.title')}</PageTitle>
        <Button size="sm" onClick={() => setIssueOpen(true)}>
          {t('admin.collectors.issue')}
        </Button>
      </HStack>
      <Text fontSize="$sm" color="$subtleText">
        {t('admin.collectors.note')}
      </Text>
      <ErrorText>{error()}</ErrorText>

      <Show when={issued()}>
        <Alert status="success">
          <AlertIcon />
          <VStack alignItems="start" spacing="$1">
            <Text fontSize="$sm" fontWeight="semibold">
              {t('admin.collectors.issued_once')}
            </Text>
            <code class="token-box">{issued()}</code>
            <Button size="xs" variant="ghost" onClick={() => setIssued(null)}>
              {t('admin.collectors.issued_ack')}
            </Button>
          </VStack>
        </Alert>
      </Show>

      <ErrorText>{query.isError ? t('global.load_failed') : ''}</ErrorText>
      <Show when={query.data && query.data.data.length === 0}>
        <EmptyText>{t('admin.collectors.empty')}</EmptyText>
      </Show>

      <Show when={query.data && query.data.data.length > 0}>
        <SectionCard delay={0.05}>
          <Box overflowX="auto">
            <Table dense highlightOnHover class="pp-table">
              <Thead>
                <Tr>
                  <Th>{t('admin.collectors.label')}</Th>
                  <Th>{t('admin.collectors.printer')}</Th>
                  <Th>{t('admin.collectors.status')}</Th>
                  <Th>{t('admin.collectors.last_used')}</Th>
                  <Th>{t('admin.actions')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                <For each={query.data!.data}>
                  {(collector, i) => (
                    <Tr {...rowEnter(i())}>
                      <Td fontSize="$sm">{collector.label}</Td>
                      <Td fontSize="$sm">
                        {collector.printer_name}（{collector.printer_code}）
                      </Td>
                      <Td>
                        <VStack alignItems="start" spacing="$0">
                          <StatusBadge tone={collector.tone} text={collector.status_text} />
                          <Show when={collector.revoke_reason}>
                            <Text fontSize="$xs" color="$subtleText">
                              {collector.revoke_reason}
                            </Text>
                          </Show>
                        </VStack>
                      </Td>
                      <Td fontSize="$xs" color="$subtleText">
                        {collector.last_used_at ? dateTime(collector.last_used_at) : '—'}
                      </Td>
                      <Td>
                        <HStack spacing="$1">
                          <Show when={!collector.revoked}>
                            <Button size="xs" variant="outline" colorScheme="warning" onClick={() => setRevokeTarget(collector)}>
                              {t('admin.collectors.revoke')}
                            </Button>
                          </Show>
                          <Button size="xs" variant="outline" colorScheme="danger" onClick={() => setPurgeTarget(collector)}>
                            {t('admin.collectors.purge')}
                          </Button>
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

      {/* 签发弹窗 */}
      <Modal opened={issueOpen()} onClose={() => setIssueOpen(false)}>
        <ModalOverlay />
        <ModalContent as="form" onSubmit={doIssue}>
          <ModalHeader>{t('admin.collectors.issue_title')}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing="$3" alignItems="stretch">
              <FormControl>
                <FormLabel for="collector-printer">{t('admin.collectors.printer')}</FormLabel>
                <Input
                  id="collector-printer"
                  value={printerCode()}
                  onInput={(e) => setPrinterCode(e.currentTarget.value)}
                  placeholder={t('admin.collectors.printer_code_hint')}
                />
                <Show when={printers.data && printers.data.data.length > 0}>
                  <HStack gap="$1" mt="$1" flexWrap="wrap">
                    <For each={printers.data!.data}>
                      {(p) => (
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => setPrinterCode(p.code)}
                        >
                          {p.code}
                        </Button>
                      )}
                    </For>
                  </HStack>
                </Show>
              </FormControl>
              <FormControl>
                <FormLabel for="collector-label">{t('admin.collectors.label')}</FormLabel>
                <Input id="collector-label" value={label()} onInput={(e) => setLabel(e.currentTarget.value)} />
              </FormControl>
              <ErrorText>{issueError()}</ErrorText>
            </VStack>
          </ModalBody>
          <ModalFooter display="flex" gap="$2">
            <Button variant="ghost" colorScheme="neutral" onClick={() => setIssueOpen(false)}>
              {t('global.cancel')}
            </Button>
            <Button type="submit" loading={issue.isPending}>
              {t('global.confirm')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ReasonModal
        open={revokeTarget() !== null}
        title={t('admin.collectors.revoke_title', { label: revokeTarget()?.label ?? '' })}
        onConfirm={(reason) => doRevoke(reason)}
        onClose={() => setRevokeTarget(null)}
      />
      <ReasonModal
        open={purgeTarget() !== null}
        title={t('admin.collectors.purge_title', { label: purgeTarget()?.label ?? '' })}
        danger
        onConfirm={(reason) => doPurge(reason)}
        onClose={() => setPurgeTarget(null)}
      />
    </VStack>
  )
}

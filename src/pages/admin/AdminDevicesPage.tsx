/* 设备管理：按账号分组；解绑=彻底释放、停用=可逆；理由必填。 */

import { For, Show, createSignal } from 'solid-js'
import { Box, Button, HStack, Table, Tbody, Td, Text, Th, Thead, Tr, VStack } from '@hope-ui/solid'

import { useAdminDevices, useReleaseDevice, useBlockDevice, useRestoreDevice } from '../../hooks/adminQueries'
import { PageTitle, ReasonModal, SectionCard, StatusBadge, EmptyText, ErrorText } from '../../components/ui'
import { rowEnter } from '../../components/motion'
import { relativeTime } from '../../lib/format'
import type { DeviceView } from '../../lib/types'
import { t } from '../../app/i18n'

type Action = 'release' | 'block' | 'restore'

export default function AdminDevicesPage() {
  const query = useAdminDevices(100)
  const release = useReleaseDevice()
  const block = useBlockDevice()
  const restore = useRestoreDevice()
  const [target, setTarget] = createSignal<{ device: DeviceView; action: Action } | null>(null)
  const [error, setError] = createSignal('')

  const groups = () => {
    const map = new Map<string, DeviceView[]>()
    for (const device of query.data?.data ?? []) {
      const key = device.user_id ? `${device.username ?? device.user_id}` : t('admin.devices.unbound_group')
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(device)
    }
    // 未绑定组排最后
    return [...map.entries()].sort(([a], [b]) =>
      a === t('admin.devices.unbound_group') ? 1 : b === t('admin.devices.unbound_group') ? -1 : a.localeCompare(b),
    )
  }

  const submit = async (reason: string) => {
    const item = target()
    if (!item) return
    setError('')
    try {
      if (item.action === 'release') {
        await release.mutateAsync({ deviceId: item.device.id, reason: reason || t('admin.devices.default_release_reason') })
      } else if (item.action === 'block') {
        await block.mutateAsync({ deviceId: item.device.id, reason: reason || t('admin.devices.default_block_reason') })
      } else {
        await restore.mutateAsync({ deviceId: item.device.id, reason: reason || t('admin.devices.default_restore_reason') })
      }
    } catch (err) {
      setError(t('admin.devices.action_failed'))
    }
  }

  const actionTitle = () => {
    const item = target()
    if (!item) return ''
    if (item.action === 'release') return t('admin.devices.release_title', { label: item.device.label })
    if (item.action === 'block') return t('admin.devices.block_title', { label: item.device.label })
    return t('admin.devices.restore_title', { label: item.device.label })
  }

  return (
    <VStack spacing="$4" alignItems="stretch">
      <PageTitle description={t('admin.devices.subtitle')}>{t('admin.devices.title')}</PageTitle>
      <ErrorText>{error()}</ErrorText>
      <ErrorText>{query.isError ? t('global.load_failed') : ''}</ErrorText>
      <Show when={query.data && query.data.data.length === 0}>
        <EmptyText>{t('admin.devices.empty')}</EmptyText>
      </Show>

      <For each={groups()}>
        {([username, devices], i) => (
          <SectionCard delay={Math.min(i(), 6) * 0.05} title={username}>
            <Box overflowX="auto">
              <Table dense highlightOnHover class="pp-table">
                <Thead>
                  <Tr>
                    <Th>{t('admin.devices.label')}</Th>
                    <Th>{t('admin.devices.platform')}</Th>
                    <Th>{t('admin.devices.status')}</Th>
                    <Th>{t('admin.devices.last_seen')}</Th>
                    <Th>{t('admin.actions')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  <For each={devices}>
                    {(device, i) => (
                      <Tr {...rowEnter(i())}>
                        <Td>
                          <Text fontSize="$sm" fontWeight="medium">
                            {device.label || t('devices.unnamed')}
                          </Text>
                        </Td>
                        <Td fontSize="$sm">{device.platform}</Td>
                        <Td>
                          <StatusBadge tone={device.tone} text={device.status_text} />
                        </Td>
                        <Td fontSize="$xs" color="$subtleText">
                          {relativeTime(device.last_seen_at)}
                        </Td>
                        <Td>
                          <HStack spacing="$1">
                            {/* released 的行不再是设备：不能停用/恢复；停用可逆，解绑彻底 */}
                            <Show when={device.status !== 'released' && device.status !== 'revoked'}>
                              <Button
                                size="xs"
                                variant="outline"
                                colorScheme="danger"
                                onClick={() => setTarget({ device, action: 'release' })}
                              >
                                {t('admin.devices.release')}
                              </Button>
                              <Show when={device.status === 'active'}>
                                <Button size="xs" variant="outline" onClick={() => setTarget({ device, action: 'block' })}>
                                  {t('admin.devices.block')}
                                </Button>
                              </Show>
                            </Show>
                            <Show when={device.status === 'revoked'}>
                              <Button size="xs" variant="outline" onClick={() => setTarget({ device, action: 'restore' })}>
                                {t('admin.devices.restore')}
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
        )}
      </For>

      <ReasonModal
        open={target() !== null}
        title={actionTitle()}
        danger={target()?.action === 'release'}
        onConfirm={(reason) => submit(reason)}
        onClose={() => setTarget(null)}
      />
    </VStack>
  )
}

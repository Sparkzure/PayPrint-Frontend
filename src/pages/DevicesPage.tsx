/* 设备页：只读列表（解绑仅管理员，用户端没有自助解绑入口）。 */

import { For, Show } from 'solid-js'
import { HStack, Text, VStack } from '@hope-ui/solid'

import { useDevices } from '../hooks/queries'
import { SectionCard, StatusBadge, EmptyText, ErrorText, PageTitle, InfoGrid, InfoRow, Hint } from '../components/ui'
import { MotionItem } from '../components/motion'
import { relativeTime } from '../lib/format'
import { t } from '../app/i18n'

export default function DevicesPage() {
  const query = useDevices()

  return (
    <VStack spacing="$5" alignItems="stretch">
      <PageTitle description={t('devices.subtitle')}>{t('devices.title')}</PageTitle>
      <Show when={query.isError}>
        <ErrorText>{t('global.load_failed')}</ErrorText>
      </Show>
      <Show when={query.data && query.data.length === 0}>
        <EmptyText>{t('devices.empty')}</EmptyText>
      </Show>
      <VStack alignItems="stretch" spacing="$3">
        <For each={query.data ?? []}>
          {(device, i) => (
            <MotionItem index={i()}>
              <SectionCard delay={false}>
                <VStack alignItems="stretch" spacing="$3">
                  <HStack justifyContent="space-between" flexWrap="wrap" gap="$2" alignItems="center">
                    <Text fontWeight="semibold">{device.label || t('devices.unnamed')}</Text>
                    <HStack spacing="$2">
                      <StatusBadge tone={device.tone} text={device.status_text} />
                      <Show when={device.current}>
                        <StatusBadge tone="primary" text={t('devices.current')} />
                      </Show>
                    </HStack>
                  </HStack>
                  <InfoGrid>
                    <InfoRow label={t('devices.platform')} value={device.platform} />
                    <InfoRow label={t('devices.app_version')} value={device.app_version} />
                    <InfoRow label={t('devices.bound_at')} value={relativeTime(device.bound_at)} />
                    <InfoRow label={t('devices.last_seen')} value={relativeTime(device.last_seen_at)} />
                  </InfoGrid>
                  <Hint>{t('devices.release_note')}</Hint>
                </VStack>
              </SectionCard>
            </MotionItem>
          )}
        </For>
      </VStack>
    </VStack>
  )
}

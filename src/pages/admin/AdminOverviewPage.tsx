/* 管理总览：任务状态分布、账号统计、当前生效的运行参数速览。 */

import { Component, For, Show } from 'solid-js'
import { HStack, Text, VStack, Box } from '@hope-ui/solid'

import { useAdminStats } from '../../hooks/adminQueries'
import { PageTitle, SectionCard, StatusBadge, ErrorText } from '../../components/ui'
import { MotionItem } from '../../components/motion'
import { t } from '../../app/i18n'

export default function AdminOverviewPage() {
  const stats = useAdminStats()

  return (
    <Show when={stats.data} fallback={<ErrorText>{t('global.load_failed')}</ErrorText>}>
      <VStack spacing="$4" alignItems="stretch">
        <PageTitle description={t('admin.overview.subtitle')}>{t('admin.overview.title')}</PageTitle>

        <Box
          display="grid"
          gridTemplateColumns="repeat(auto-fit, minmax(240px, 1fr))"
          gap="$4"
        >
          <SectionCard delay={0.05} title={t('admin.overview.users')}>
            <Text fontSize="$2xl" fontWeight="bold">
              {stats.data!.users.total}
            </Text>
            <Text fontSize="$xs" color="$subtleText">
              {t('admin.overview.users_breakdown', {
                admin: stats.data!.users.admin,
                user: stats.data!.users.user,
              })}
            </Text>
          </SectionCard>
          <SectionCard delay={0.1} title={t('admin.overview.auto_release')}>
            <StatusBadge
              tone={stats.data!.auto_release_on_payment ? 'warning' : 'success'}
              text={
                stats.data!.auto_release_on_payment
                  ? t('admin.overview.auto_release_on')
                  : t('admin.overview.auto_release_off')
              }
            />
            <Text fontSize="$xs" color="$subtleText" mt="$2">
              {t('admin.overview.auto_release_help')}
            </Text>
          </SectionCard>
          <SectionCard delay={0.15} title={t('admin.overview.registration')}>
            <StatusBadge
              tone={stats.data!.open_registration ? 'success' : 'neutral'}
              text={stats.data!.open_registration ? t('global.open') : t('global.closed')}
            />
          </SectionCard>
        </Box>

        <SectionCard delay={0.2} title={t('admin.overview.jobs_by_status')}>
          <Show when={Object.keys(stats.data!.print_jobs_by_status).length > 0}>
            <HStack gap="$2" flexWrap="wrap">
              <For each={Object.entries(stats.data!.print_jobs_by_status)}>
                {([status, count], i) => (
                  <MotionItem index={i()}>
                    <Box px="$3" py="$1" rounded="$md" bg="$primarySoft">
                      <Text fontSize="$sm">
                        {status}: <Text as="b">{count}</Text>
                      </Text>
                    </Box>
                  </MotionItem>
                )}
              </For>
            </HStack>
          </Show>
        </SectionCard>

        <SectionCard delay={0.25} title={t('admin.overview.runtime')}>
          <VStack alignItems="stretch" spacing="$2">
            <Row label={t('admin.overview.release_ttl')} value={`${Math.round(stats.data!.release_ttl_seconds / 60)} min`} />
            <Row label={t('admin.overview.order_ttl')} value={`${Math.round(stats.data!.order_ttl_seconds / 60)} min`} />
            <Row label={t('admin.overview.payment_sources')} value={stats.data!.payment_sources.join(', ')} />
            <Row label={t('admin.overview.wechat_query')} value={stats.data!.wechat_query_enabled ? t('global.enabled') : t('global.disabled')} />
            <Row label={t('admin.overview.worker')} value={stats.data!.worker_enabled ? t('global.enabled') : t('global.disabled')} />
            <Row label={t('admin.overview.session_ttl')} value={`${Math.round(stats.data!.session_ttl_seconds / 3600)} h`} />
          </VStack>
        </SectionCard>
      </VStack>
    </Show>
  )
}

const Row: Component<{ label: string; value: string }> = (props) => (
  <HStack justifyContent="space-between" flexWrap="wrap">
    <Text fontSize="$sm" color="$subtleText">
      {props.label}
    </Text>
    <Text fontSize="$sm">{props.value}</Text>
  </HStack>
)

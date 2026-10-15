/**
 * 账户页：账号信息、外观、记账流水。
 *
 * "累计支出"一律用接口已经算好的数字（MeResponse.total_spent_fen 与流水行的
 * LedgerView.total_spent_fen），不拿最近一页流水自己求和，那样只会算出误导性的数字。
 */

import { For, Show } from 'solid-js'
import { Box, HStack, Text, VStack } from '@hope-ui/solid'

import { colorPreference, setColorPreference, type ColorPreference } from '../app/colorMode'

import { useLedger, useMe } from '../hooks/queries'
import {
  SectionCard,
  StatusBadge,
  EmptyText,
  ErrorText,
  PageTitle,
  InfoGrid,
  InfoRow,
  OptionGroup,
} from '../components/ui'
import { MotionItem } from '../components/motion'
import { money, dateTime } from '../lib/format'
import { t } from '../app/i18n'

export default function AccountPage() {
  const me = useMe()
  const ledger = useLedger()

  return (
    <VStack spacing="$5" alignItems="stretch">
      <PageTitle description={t('account.subtitle')}>{t('account.title')}</PageTitle>

      <SectionCard delay={0.05} title={t('account.profile')}>
        <Show when={me.data} fallback={<ErrorText>{t('global.load_failed')}</ErrorText>}>
          <InfoGrid>
            <InfoRow label={t('auth.username')} value={me.data!.user.username} />
            <InfoRow label={t('account.total_spent')} value={money(me.data!.total_spent_fen)} mono />
            <Show when={me.data!.user.free_print}>
              <InfoRow
                label={t('account.free_print')}
                value={<StatusBadge tone="success" text={t('account.free_print_on')} />}
              />
            </Show>
          </InfoGrid>
        </Show>
      </SectionCard>

      <SectionCard delay={0.1} title={t('account.theme')}>
        {/* 这里改的是"用户意图"，落到 Hope UI 由 ThemeSync 统一做（见 app/colorMode.ts） */}
        <OptionGroup
          value={colorPreference()}
          onChange={(v) => setColorPreference(v as ColorPreference)}
          options={[
            { value: 'light', label: t('nav.color_light') },
            { value: 'dark', label: t('nav.color_dark') },
            { value: 'system', label: t('nav.color_system') },
          ]}
        />
      </SectionCard>

      <SectionCard delay={0.15} title={t('account.ledger')}>
        <Show when={ledger.data && ledger.data.entries.length === 0}>
          <EmptyText>{t('account.ledger_empty')}</EmptyText>
        </Show>
        <Show when={ledger.isError}>
          <ErrorText>{t('global.load_failed')}</ErrorText>
        </Show>
        <VStack alignItems="stretch" spacing="$3">
          <For each={ledger.data?.entries ?? []}>
            {(entry, i) => (
              <MotionItem index={i()}>
                <Box borderBottomWidth="1px" borderBottomColor="$border" pb="$3">
                  <HStack justifyContent="space-between" flexWrap="wrap" gap="$2" alignItems="center">
                    <HStack spacing="$2" alignItems="center" minW="0">
                      <StatusBadge tone={entry.tone} text={entry.type_text} />
                      <Text fontSize="$sm">{entry.memo || entry.type_text}</Text>
                    </HStack>
                    <Text
                      fontWeight="semibold"
                      class="pp-num"
                      color={entry.amount_fen < 0 ? '$success' : '$text'}
                    >
                      {money(entry.amount_fen)}
                    </Text>
                  </HStack>
                  <HStack justifyContent="space-between" mt="$1" flexWrap="wrap" gap="$2">
                    <Text fontSize="$xs" color="$subtleText" class="pp-num">
                      {dateTime(entry.created_at)}
                    </Text>
                    <Text fontSize="$xs" color="$subtleText" class="pp-num">
                      {t('account.spent_after')}: {money(entry.total_spent_fen)}
                    </Text>
                  </HStack>
                </Box>
              </MotionItem>
            )}
          </For>
        </VStack>
      </SectionCard>
    </VStack>
  )
}

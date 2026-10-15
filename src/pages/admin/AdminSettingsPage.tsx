/* 运行参数：按组展示，就地修改、整组提交、可还原默认。非法值后端整体拒绝。 */

import { For, Show, createSignal } from 'solid-js'
import { Button, HStack, Input, Switch, Text, VStack, Box } from '@hope-ui/solid'

import { useAdminSettings, useUpdateSettings } from '../../hooks/adminQueries'
import { PageTitle, SectionCard, ErrorText, StatusBadge } from '../../components/ui'
import { MotionItem } from '../../components/motion'
import type { SettingView } from '../../lib/types'
import { t } from '../../app/i18n'

export default function AdminSettingsPage() {
  const query = useAdminSettings()
  const update = useUpdateSettings()
  const [draft, setDraft] = createSignal<Record<string, string>>({})
  const [error, setError] = createSignal('')
  const [saved, setSaved] = createSignal(false)

  const groups = () => {
    const map = new Map<string, SettingView[]>()
    for (const setting of query.data ?? []) {
      if (!map.has(setting.group)) map.set(setting.group, [])
      map.get(setting.group)!.push(setting)
    }
    return [...map.entries()]
  }

  const valueOf = (setting: SettingView) => draft()[setting.key] ?? setting.value

  const setLocal = (key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const dirty = () => Object.keys(draft()).length > 0

  const save = async () => {
    setError('')
    setSaved(false)
    const set: Record<string, string> = {}
    const reset: string[] = []
    for (const [key, value] of Object.entries(draft())) {
      const setting = (query.data ?? []).find((s) => s.key === key)
      if (!setting) continue
      if (value.trim() === '') reset.push(key)
      else set[key] = value.trim()
    }
    try {
      await update.mutateAsync({ set, reset })
      setDraft({})
      setSaved(true)
    } catch (err) {
      const code = (err as { code?: string }).code
      setError(code === 'invalid_setting' ? t('admin.settings.invalid_value') : t('admin.settings.save_failed'))
    }
  }

  return (
    <VStack spacing="$4" alignItems="stretch">
      <HStack justifyContent="space-between" flexWrap="wrap">
        <PageTitle description={t('admin.settings.subtitle')}>{t('admin.settings.title')}</PageTitle>
        <HStack spacing="$2">
          <Show when={dirty()}>
            <Button size="sm" variant="ghost" colorScheme="neutral" onClick={() => setDraft({})}>
              {t('global.give_up')}
            </Button>
            <Button size="sm" loading={update.isPending} onClick={save}>
              {t('admin.settings.save')}
            </Button>
          </Show>
        </HStack>
      </HStack>
      <Text fontSize="$sm" color="$subtleText">
        {t('admin.settings.note')}
      </Text>
      <Show when={saved()}>
        <Text color="$success" fontSize="$sm">
          {t('admin.settings.saved')}
        </Text>
      </Show>
      <ErrorText>{error()}</ErrorText>
      <ErrorText>{query.isError ? t('global.load_failed') : ''}</ErrorText>

      <For each={groups()}>
        {([group, settings], i) => (
          <SectionCard delay={Math.min(i(), 6) * 0.05} title={group}>
            <VStack alignItems="stretch" spacing="$3">
              <For each={settings}>
                {(setting, j) => (
                  <MotionItem index={j()}>
                    <Box borderBottomWidth="1px" borderBottomColor="$border" pb="$3">
                      <HStack justifyContent="space-between" flexWrap="wrap">
                        <VStack alignItems="start" spacing="0" maxW="60%">
                          <HStack spacing="$2">
                            <Text fontSize="$sm" fontWeight="medium">
                              {setting.label}
                            </Text>
                            <Show when={setting.overridden}>
                              <StatusBadge tone="primary" text={t('admin.settings.overridden')} />
                            </Show>
                          </HStack>
                          <Text fontSize="$xs" color="$subtleText">
                            {setting.help}
                          </Text>
                          <Text fontSize="$xs" color="$subtleText">
                            {t('admin.settings.default')}: {setting.default || '—'}
                          </Text>
                        </VStack>
                        <Show
                          when={setting.kind === 'bool'}
                          fallback={
                            <Input
                              size="sm"
                              width="140px"
                              value={valueOf(setting)}
                              onChange={(e) => setLocal(setting.key, e.currentTarget.value)}
                            />
                          }
                        >
                          <Switch
                            checked={valueOf(setting) === 'true'}
                            onChange={(e) => setLocal(setting.key, e.currentTarget.checked ? 'true' : 'false')}
                          />
                        </Show>
                      </HStack>
                    </Box>
                  </MotionItem>
                )}
              </For>
            </VStack>
          </SectionCard>
        )}
      </For>
    </VStack>
  )
}

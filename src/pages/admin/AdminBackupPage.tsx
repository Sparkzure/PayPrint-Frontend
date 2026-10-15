/* 备份：导出整站 zip；上传还原（暂存 + 重启应用，两段式）。 */

import { Show, createSignal } from 'solid-js'
import { Alert, AlertIcon, Button, HStack, Text, VStack, Box, Divider } from '@hope-ui/solid'

import { useDownloadBackup, useRestoreBackup, useCancelRestore, useStagedRestore } from '../../hooks/adminQueries'
import { PageTitle, SectionCard, ErrorText } from '../../components/ui'
import { dateTime } from '../../lib/format'
import { t } from '../../app/i18n'

export default function AdminBackupPage() {
  const download = useDownloadBackup()
  const restore = useRestoreBackup()
  const cancelRestore = useCancelRestore()
  const staged = useStagedRestore()
  const [error, setError] = createSignal('')
  const [file, setFile] = createSignal<File | null>(null)

  const onFile = (input: HTMLInputElement) => {
    setFile(input.files?.[0] ?? null)
    setError('')
  }

  const doRestore = async () => {
    if (!file()) return
    setError('')
    try {
      const info = await restore.mutateAsync(file()!)
      setFile(null)
      void staged.refetch()
      if (info.hint) setError(info.hint)
    } catch (err) {
      const code = (err as { code?: string }).code
      setError(code === 'invalid_backup' ? t('admin.backup.invalid') : t('admin.backup.restore_failed'))
    }
  }

  return (
    <VStack spacing="$4" alignItems="stretch">
      <PageTitle description={t('admin.backup.subtitle')}>{t('admin.backup.title')}</PageTitle>

      <Show when={staged.data?.staged}>
        <Alert status="warning">
          <AlertIcon />
          <VStack alignItems="start" spacing="$1">
            <Text fontSize="$sm" fontWeight="semibold">
              {t('admin.backup.staged_title')}
            </Text>
            <Text fontSize="$sm">
              {t('admin.backup.staged_detail', {
                version: String(staged.data?.migration_version ?? ''),
                time: staged.data?.created_at ? dateTime(staged.data.created_at) : '—',
              })}
            </Text>
            <HStack spacing="$2">
              <Button size="xs" variant="outline" colorScheme="danger" loading={cancelRestore.isPending} onClick={() => cancelRestore.mutateAsync()}>
                {t('admin.backup.cancel_restore')}
              </Button>
            </HStack>
          </VStack>
        </Alert>
      </Show>

      <SectionCard delay={0.05} title={t('admin.backup.export')}>
        <VStack alignItems="stretch" spacing="$2">
          <Text fontSize="$sm" color="$subtleText">
            {t('admin.backup.export_note')}
          </Text>
          <ErrorText>{download.isError ? t('admin.backup.export_failed') : ''}</ErrorText>
          <HStack>
            <Button loading={download.isPending} onClick={() => download.mutateAsync()}>
              {t('admin.backup.download')}
            </Button>
          </HStack>
        </VStack>
      </SectionCard>

      <SectionCard delay={0.1} title={t('admin.backup.restore')}>
        <VStack alignItems="stretch" spacing="$3">
          <Text fontSize="$sm" color="$subtleText">
            {t('admin.backup.restore_note')}
          </Text>
          <Divider />
          <input type="file" accept=".zip" onChange={(e) => void onFile(e.currentTarget)} />
          <ErrorText>{error()}</ErrorText>
          <HStack>
            <Button colorScheme="danger" disabled={!file()} loading={restore.isPending} onClick={doRestore}>
              {t('admin.backup.restore_submit')}
            </Button>
          </HStack>
          <Text fontSize="$xs" color="$subtleText">
            {t('admin.backup.restore_help')}
          </Text>
        </VStack>
      </SectionCard>

      <Box />
    </VStack>
  )
}

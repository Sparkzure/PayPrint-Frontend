/* 账号管理：建号、封禁/解封（理由必填）、免费打印开关（理由必填）。 */

import { For, Show, createSignal } from 'solid-js'
import { Button, Checkbox, HStack, Input, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Table, Tbody, Td, Text, Th, Thead, Tr, VStack, Box, FormControl, FormLabel } from '@hope-ui/solid'

import { useAdminUsers, useCreateUser, useBanUser, useUnbanUser, useSetFreePrint } from '../../hooks/adminQueries'
import { PageTitle, ReasonModal, SectionCard, StatusBadge, ErrorText, SelectField } from '../../components/ui'
import { rowEnter } from '../../components/motion'
import { money, dateOnly } from '../../lib/format'
import type { UserView } from '../../lib/types'
import { t } from '../../app/i18n'

export default function AdminUsersPage() {
  const query = useAdminUsers()
  const createUser = useCreateUser()
  const banUser = useBanUser()
  const unbanUser = useUnbanUser()
  const setFreePrint = useSetFreePrint()

  const [createOpen, setCreateOpen] = createSignal(false)
  const [username, setUsername] = createSignal('')
  const [password, setPassword] = createSignal('')
  const [role, setRole] = createSignal('user')
  const [createError, setCreateError] = createSignal('')

  const [banTarget, setBanTarget] = createSignal<{ user: UserView; action: 'ban' | 'unban' } | null>(null)
  const [freeTarget, setFreeTarget] = createSignal<{ user: UserView; enabled: boolean } | null>(null)
  const [error, setError] = createSignal('')

  const doCreate = async (e: Event) => {
    e.preventDefault()
    setCreateError('')
    try {
      await createUser.mutateAsync({
        username: username().trim(),
        password: password(),
        role: role(),
      })
      setCreateOpen(false)
      setUsername('')
      setPassword('')
      setRole('user')
    } catch (err) {
      const code = (err as { code?: string }).code
      setCreateError(code === 'username_taken' ? t('admin.users.username_taken') : t('admin.users.create_failed'))
    }
  }

  const doBan = async (reason: string) => {
    const item = banTarget()
    if (!item) return
    setError('')
    try {
      if (item.action === 'ban') {
        await banUser.mutateAsync({ userId: item.user.id, reason: reason || t('admin.users.default_ban_reason') })
      } else {
        await unbanUser.mutateAsync({ userId: item.user.id, reason: reason || t('admin.users.default_unban_reason') })
      }
    } catch {
      setError(t('admin.users.ban_action_failed'))
    }
  }

  const doFreePrint = async (reason: string) => {
    const item = freeTarget()
    if (!item) return
    setError('')
    try {
      await setFreePrint.mutateAsync({
        userId: item.user.id,
        enabled: item.enabled,
        reason: reason || t('admin.users.default_free_reason'),
      })
    } catch {
      setError(t('admin.users.free_action_failed'))
    }
  }

  return (
    <VStack spacing="$4" alignItems="stretch">
      <HStack justifyContent="space-between" flexWrap="wrap">
        <PageTitle description={t('admin.users.subtitle')}>{t('admin.users.title')}</PageTitle>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          {t('admin.users.create')}
        </Button>
      </HStack>
      <ErrorText>{error()}</ErrorText>
      <ErrorText>{query.isError ? t('global.load_failed') : ''}</ErrorText>

      <Show when={query.data && query.data.data.length > 0}>
        <SectionCard delay={0.05}>
          <Box overflowX="auto">
            <Table dense highlightOnHover class="pp-table">
              <Thead>
                <Tr>
                  <Th>{t('admin.users.username')}</Th>
                  <Th>{t('admin.users.role')}</Th>
                  <Th>{t('admin.users.status')}</Th>
                  <Th css={{ textAlign: 'right' }}>{t('admin.users.total_spent')}</Th>
                  <Th>{t('admin.users.free_print')}</Th>
                  <Th>{t('admin.actions')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                <For each={query.data!.data}>
                  {(user, i) => (
                    <Tr {...rowEnter(i())}>
                      <Td>
                        <Text fontSize="$sm" fontWeight="medium">
                          {user.username}
                        </Text>
                        <Show when={user.ban_reason}>
                          <Text fontSize="$xs" color="$danger">
                            {t('admin.users.ban_reason')}: {user.ban_reason}
                          </Text>
                        </Show>
                      </Td>
                      <Td fontSize="$sm">{user.role}</Td>
                      <Td>
                        <StatusBadge tone={user.tone} text={user.status_text} />
                      </Td>
                      <Td css={{ textAlign: 'right' }} fontSize="$sm">
                        {money(user.total_spent_fen)}
                      </Td>
                      <Td>
                        <Checkbox
                          checked={user.free_print}
                          onChange={(e) => setFreeTarget({ user, enabled: e.currentTarget.checked })}
                        />
                      </Td>
                      <Td>
                        <Show when={user.status === 'banned'} fallback={
                          <Button
                            size="xs"
                            variant="outline"
                            colorScheme="danger"
                            onClick={() => setBanTarget({ user, action: 'ban' })}
                          >
                            {t('admin.users.ban')}
                          </Button>
                        }>
                          <Button size="xs" variant="outline" onClick={() => setBanTarget({ user, action: 'unban' })}>
                            {t('admin.users.unban')}
                          </Button>
                        </Show>
                      </Td>
                    </Tr>
                  )}
                </For>
              </Tbody>
            </Table>
          </Box>
        </SectionCard>
      </Show>

      {/* 建号弹窗（行内确认优于弹窗的约定在账号页保留：这里是低频动作，弹窗承载表单） */}
      <Modal opened={createOpen()} onClose={() => setCreateOpen(false)}>
        <ModalOverlay />
        <ModalContent as="form" onSubmit={doCreate}>
          <ModalHeader>{t('admin.users.create_title')}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing="$3" alignItems="stretch">
              <FormControl>
                <FormLabel for="new-username">{t('auth.username')}</FormLabel>
                <Input id="new-username" value={username()} onInput={(e) => setUsername(e.currentTarget.value)} />
              </FormControl>
              <FormControl>
                <FormLabel for="new-password">{t('auth.password')}</FormLabel>
                <Input
                  id="new-password"
                  type="password"
                  value={password()}
                  onInput={(e) => setPassword(e.currentTarget.value)}
                />
              </FormControl>
              <FormControl>
                <FormLabel for="new-role">{t('admin.users.role')}</FormLabel>
                <SelectField
                  value={role()}
                  onChange={setRole}
                  options={[
                    { value: 'user', label: 'user' },
                    { value: 'admin', label: 'admin' },
                  ]}
                />
              </FormControl>
              <ErrorText>{createError()}</ErrorText>
            </VStack>
          </ModalBody>
          <ModalFooter display="flex" gap="$2">
            <Button variant="ghost" colorScheme="neutral" onClick={() => setCreateOpen(false)}>
              {t('global.cancel')}
            </Button>
            <Button type="submit" loading={createUser.isPending}>
              {t('global.confirm')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ReasonModal
        open={banTarget() !== null}
        title={
          banTarget()?.action === 'ban'
            ? t('admin.users.ban_title', { name: banTarget()?.user.username ?? '' })
            : t('admin.users.unban_title', { name: banTarget()?.user.username ?? '' })
        }
        danger={banTarget()?.action === 'ban'}
        onConfirm={(reason) => doBan(reason)}
        onClose={() => setBanTarget(null)}
      />
      <ReasonModal
        open={freeTarget() !== null}
        title={
          freeTarget()?.enabled
            ? t('admin.users.free_on_title', { name: freeTarget()?.user.username ?? '' })
            : t('admin.users.free_off_title', { name: freeTarget()?.user.username ?? '' })
        }
        onConfirm={(reason) => doFreePrint(reason)}
        onClose={() => setFreeTarget(null)}
      />
    </VStack>
  )
}

void dateOnly

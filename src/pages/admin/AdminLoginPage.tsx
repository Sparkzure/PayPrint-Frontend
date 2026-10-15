/* 管理面板登录：账号密码，不带设备签名。 */

import { createSignal } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { Box, Button, Flex, FormControl, FormLabel, HStack, Input, Text, VStack } from '@hope-ui/solid'

import { ApiError } from '../../lib/api'
import { adminApi, setAdminToken } from '../../lib/adminApi'
import { t } from '../../app/i18n'
import { SwitchColorMode } from '../../shell/SwitchColorMode'
import { SwitchLanguage } from '../../shell/SwitchLanguage'
import { ErrorText } from '../../components/ui'
import { FadeIn } from '../../components/motion'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = createSignal('')
  const [password, setPassword] = createSignal('')
  const [error, setError] = createSignal('')
  const [busy, setBusy] = createSignal(false)

  const submit = async (e: Event) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await adminApi.login(username().trim(), password())
      setAdminToken(result.token)
      navigate('/admin', { replace: true })
    } catch (err) {
      // 密码错误与账号不存在返回同一错误（后端约定：不泄露账号是否存在）。
      setError(err instanceof ApiError && err.isNetworkError ? t('global.network_error') : t('admin.auth_failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Flex minH="100vh" alignItems="center" justifyContent="center" px="$4" bg="$background">
      <VStack spacing="$4" w="$full" maxW="400px">
        <FadeIn>
          <HStack justifyContent="space-between" w="$full">
            <Text fontWeight="bold" fontSize="$lg" color="$primary">
              PayPrint · {t('admin.title')}
            </Text>
            <HStack gap="$1">
              <SwitchColorMode />
              <SwitchLanguage />
            </HStack>
          </HStack>
        </FadeIn>
        <FadeIn delay={0.05}>
          <Box w="$full" bg="$surface1" borderWidth="1px" borderColor="$border" rounded="$lg" p="$6">
            <VStack spacing="$4" as="form" onSubmit={submit} w="$full">
              <Text fontSize="$lg" fontWeight="bold">{t('admin.login_title')}</Text>
              <FormControl>
                <FormLabel for="admin-username">{t('auth.username')}</FormLabel>
                <Input
                  id="admin-username"
                  value={username()}
                  onInput={(e) => setUsername(e.currentTarget.value)}
                  autocomplete="username"
                />
              </FormControl>
              <FormControl>
                <FormLabel for="admin-password">{t('auth.password')}</FormLabel>
                <Input
                  id="admin-password"
                  type="password"
                  value={password()}
                  onInput={(e) => setPassword(e.currentTarget.value)}
                  autocomplete="current-password"
                />
              </FormControl>
              <ErrorText>{error()}</ErrorText>
              <Button type="submit" w="$full" loading={busy()}>
                {t('admin.login_submit')}
              </Button>
            </VStack>
          </Box>
        </FadeIn>
        <FadeIn delay={0.1}>
          <Text fontSize="$xs" color="$subtleText" textAlign="center">
            {t('admin.login_note')}
          </Text>
        </FadeIn>
      </VStack>
    </Flex>
  )
}

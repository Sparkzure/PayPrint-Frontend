/* 登录页：设备签名走注册/登录两道门（api.login 内部处理），管理员自动跳面板。 */

import { createSignal, Show } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { Box, Button, Flex, FormControl, FormLabel, HStack, Input, Text, VStack } from '@hope-ui/solid'
import { A } from '@solidjs/router'

import { api, setToken, ApiError } from '../lib/api'
import { setAdminToken } from '../lib/adminApi'
import { t } from '../app/i18n'
import { SwitchColorMode } from '../shell/SwitchColorMode'
import { SwitchLanguage } from '../shell/SwitchLanguage'
import { ErrorText } from '../components/ui'
import { FadeIn } from '../components/motion'

export default function LoginPage() {
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
      const auth = await api.login(username().trim(), password())
      if (auth.user.role === 'admin') {
        // bootstrap 管理员不占设备：登录态进管理端令牌位，注册响应里也没有 device。
        setToken(null)
        setAdminToken(auth.token)
        navigate('/admin', { replace: true })
        return
      }
      setToken(auth.token)
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.isNetworkError
            ? t('global.network_error')
            : t(err.code === 'invalid_credentials' ? 'auth.invalid_credentials' : 'auth.login_failed'),
        )
      } else {
        // 设备密钥/存储之类的环境问题：把可读原因直接显示出来。
        setError(err instanceof Error ? err.message : t('auth.login_failed'))
      }
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
              PayPrint
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
              <Text fontSize="$lg" fontWeight="bold">{t('auth.login_title')}</Text>
              <FormControl>
                <FormLabel for="username">{t('auth.username')}</FormLabel>
                <Input
                  id="username"
                  value={username()}
                  onInput={(e) => setUsername(e.currentTarget.value)}
                  autocomplete="username"
                />
              </FormControl>
              <FormControl>
                <FormLabel for="password">{t('auth.password')}</FormLabel>
                <Input
                  id="password"
                  type="password"
                  value={password()}
                  onInput={(e) => setPassword(e.currentTarget.value)}
                  autocomplete="current-password"
                />
              </FormControl>
              <ErrorText>{error()}</ErrorText>
              <Button type="submit" w="$full" loading={busy()}>
                {t('auth.login_submit')}
              </Button>
              <Show when={true}>
                <HStack fontSize="$sm" color="$subtleText" spacing="$1">
                  <span>{t('auth.no_account')}</span>
                  <A href="/register" class="link-primary">
                    {t('auth.go_register')}
                  </A>
                </HStack>
              </Show>
            </VStack>
          </Box>
        </FadeIn>
        <FadeIn delay={0.1}>
          <Text fontSize="$xs" color="$subtleText" textAlign="center">
            {t('auth.webcrypto_note')}
          </Text>
        </FadeIn>
      </VStack>
    </Flex>
  )
}

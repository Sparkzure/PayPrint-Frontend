/* 注册页：设备签名注册；自助注册关闭时后端拒绝（registration_closed）。 */

import { createSignal } from 'solid-js'
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

export default function RegisterPage() {
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
      const auth = await api.register({
        username: username().trim(),
        password: password(),
      })
      if (auth.user.role === 'admin') {
        setToken(null)
        setAdminToken(auth.token)
        navigate('/admin', { replace: true })
        return
      }
      setToken(auth.token)
      navigate('/', { replace: true })
    } catch (err) {
      if (!(err instanceof ApiError)) {
        // 设备密钥/存储之类的环境问题：把可读原因直接显示出来。
        setError(err instanceof Error ? err.message : t('auth.register_failed'))
        return
      }
      if (err.isNetworkError) {
        setError(t('global.network_error'))
      } else if (err.code === 'device_already_used') {
        setError(t('auth.device_already_used'))
      } else if (err instanceof ApiError && err.code === 'device_bound_to_other_account') {
        setError(t('auth.device_bound_to_other_account'))
      } else if (err instanceof ApiError && err.code === 'registration_closed') {
        setError(t('auth.registration_closed'))
      } else {
        setError(t('auth.register_failed'))
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
              <Text fontSize="$lg" fontWeight="bold">{t('auth.register_title')}</Text>
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
                  autocomplete="new-password"
                />
              </FormControl>
              <ErrorText>{error()}</ErrorText>
              <Button type="submit" w="$full" loading={busy()}>
                {t('auth.register_submit')}
              </Button>
              <HStack fontSize="$sm" color="$subtleText" spacing="$1">
                <span>{t('auth.has_account')}</span>
                <A href="/login" class="link-primary">
                  {t('auth.go_login')}
                </A>
              </HStack>
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

/* 打印预览：带 Authorization fetch 成 Blob 再交给 iframe（不能直接塞接口地址进 src）。 */

import { Component, Match, Switch, createResource, onCleanup } from 'solid-js'
import { Box, Spinner, Text } from '@hope-ui/solid'

import { fetchFileContent } from '../lib/api'
import { t } from '../app/i18n'

export const FilePreview: Component<{ fileId: string }> = (props) => {
  const [blob] = createResource(
    () => props.fileId,
    async (id) => {
      const b = await fetchFileContent(id)
      return URL.createObjectURL(b)
    },
  )
  onCleanup(() => {
    const url = blob()
    if (url) URL.revokeObjectURL(url)
  })

  return (
    <Box borderWidth="1px" borderColor="$border" rounded="$md" overflow="hidden" minH="420px">
      <Switch>
        <Match when={blob.loading}>
          <Box p="$6" display="flex" justifyContent="center">
            <Spinner />
          </Box>
        </Match>
        <Match when={blob.error}>
          <Box p="$6">
            <Text color="$danger" fontSize="$sm">
              {t('preview.load_failed')}
            </Text>
          </Box>
        </Match>
        <Match when={blob()}>
          {/*
            PDF 由浏览器内建查看器渲染，它自己画白底，且是跨域文档、页面样式进不去 ——
            深色模式下这里就是一块白纸，属于预期，不是"没跟随主题"。外框仍取 $border，
            所以整体还是主题色，只有纸面是白的。
          */}
          <iframe
            title={t('preview.title')}
            src={blob()!}
            width="100%"
            height="560px"
            style={{ border: '0' }}
          />
        </Match>
      </Switch>
    </Box>
  )
}

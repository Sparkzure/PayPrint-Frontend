/* 配色切换（照抄 OpenList 的 SwitchColorMode：图标点击即切换明暗）。 */

import { Icon, useColorModeValue } from '@hope-ui/solid'
import { FiMoon as Moon } from 'solid-icons/fi'
import { FiSun as Sun } from 'solid-icons/fi'

import { toggleColorPreference } from '../app/colorMode'

export const SwitchColorMode = () => {
  // 图标只反映"当前是不是深色"，所以这里继续用 useColorModeValue（它会随模式重算）。
  // 点击改的是"用户意图"，不能直接调 Hope UI 的 toggleColorMode：那只会把模式钉成
  // light/dark，用户在账号页选的"跟随系统"会被悄悄丢掉。
  const icon = useColorModeValue(
    { size: '$6', component: Moon },
    { size: '$6', component: Sun },
  )
  return (
    <Icon
      cursor="pointer"
      boxSize={icon().size}
      as={icon().component}
      onClick={toggleColorPreference}
      color="$subtleText"
      _hover={{ color: '$primary' }}
    />
  )
}

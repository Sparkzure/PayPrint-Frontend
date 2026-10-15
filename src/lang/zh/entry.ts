/* 中文语言包入口：分模块 json 汇总（OpenList 同款结构）。 */

import global from './global.json'
import auth from './auth.json'
import user from './user.json'
import admin from './admin.json'

export default { ...global, ...auth, ...user, ...admin }

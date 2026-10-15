/* English pack entry: module json files aggregated (OpenList-style layout). */

import global from './global.json'
import auth from './auth.json'
import user from './user.json'
import admin from './admin.json'

export default { ...global, ...auth, ...user, ...admin }

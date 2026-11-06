import BackgroundTimer from 'react-native-background-timer'

import { DEFAULT_USER_API_SOURCES } from '@/config/defaultUserApi'
import { storageDataPrefix } from '@/config/constant'
import { getData, saveData } from '@/plugins/storage'
import {
  addUserApiInfo,
  getUserApiList,
  setUserApiUpdateState,
  updateUserApiScript,
} from '@/utils/data'
import { refreshUserApiList } from '@/core/userApi'
import { httpFetch } from '@/utils/request'
import { log } from '@/utils/log'


const initedKey = storageDataPrefix.defaultUserApiInited

const MAX_SCRIPT_SIZE = 9_000_000

const fetchScript = async(url: string): Promise<string> => {
  const resp = await httpFetch(url, { timeout: 30_000 }).promise as { body?: unknown }
  const script: unknown = resp?.body
  if (typeof script != 'string' || !script.length) throw new Error('empty script')
  if (script.length > MAX_SCRIPT_SIZE) throw new Error('script too large')
  return script
}

/**
 * 拉取内置音源的脚本内容
 * 脚本头部的音源名称不覆盖预置名称，保证列表里显示的名称与内置清单一致
 */
const loadDefaultScripts = async(apis: LX.UserApi.UserApiInfo[]) => {
  let loaded = false
  for (const api of apis) {
    const url = api.sourceUrl
    if (!url) continue
    try {
      const script = await fetchScript(url)
      await updateUserApiScript(api.id, script)
      if (api.name) await setUserApiUpdateState(api.id, { name: api.name })
      loaded = true
    } catch (err: any) {
      log.warn(`load default user api script failed: ${api.name} ${err?.message ?? err}`)
    }
  }
  if (loaded) await refreshUserApiList()
}

/**
 * 初始化内置在线音源
 * 只在首次启动时写入一次，之后用户自行删除不会被重新添加
 */
export const initDefaultUserApi = async() => {
  try {
    if (await getData<boolean>(initedKey)) return

    // 先写入标记，避免脚本下载失败后每次启动都重试
    await saveData(initedKey, true)

    const existsUrls = new Set((await getUserApiList()).map(api => api.sourceUrl).filter(Boolean) as string[])

    const addedApis: LX.UserApi.UserApiInfo[] = []
    for (const source of DEFAULT_USER_API_SOURCES) {
      if (existsUrls.has(source.url)) continue
      const apiInfo: LX.UserApi.UserApiInfo = {
        id: `user_api_default_${Math.random().toString().substring(2, 5)}_${Date.now()}`,
        name: source.name,
        description: '',
        author: '',
        homepage: '',
        version: '',
        allowShowUpdateAlert: false,
        sourceUrl: source.url,
      }
      await addUserApiInfo(apiInfo)
      addedApis.push(apiInfo)
    }

    if (!addedApis.length) return
    await refreshUserApiList()

    // 脚本内容放到后台拉取，不阻塞启动
    BackgroundTimer.setTimeout(() => {
      void loadDefaultScripts(addedApis)
    }, 2000)
  } catch (err: any) {
    log.error(`init default user api failed: ${err?.message ?? err}`)
  }
}

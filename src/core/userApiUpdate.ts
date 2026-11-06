import BackgroundTimer from 'react-native-background-timer'

import { compareVer } from '@/utils'
import { httpFetch } from '@/utils/request'
import {
  getUserApiList,
  parseUserApiScriptInfo,
  setUserApiUpdateState,
  updateUserApiScript,
} from '@/utils/data'
import settingState from '@/store/setting/state'
import { refreshUserApiList, setUserApi } from '@/core/userApi'
import { confirmDialog, toast } from '@/utils/tools'
import { log } from '@/utils/log'

/**
 * 自定义源在线更新检查周期：6 小时
 */
const CHECK_INTERVAL = 6 * 60 * 60 * 1000
/**
 * 轮询检测是否到达检查周期的时间间隔：30 分钟
 */
const POLL_INTERVAL = 30 * 60 * 1000
const MAX_SCRIPT_SIZE = 9_000_000

/** 缓存最近一次抓取到的新版本脚本，避免更新时重复下载 */
const latestScripts = new Map<string, string>()

let checkingPromise: Promise<LX.UserApi.UserApiUpdateCheckResult[]> | null = null

const isOnlineUrl = (url?: string): url is string => typeof url === 'string' && /^https?:\/\//.test(url)

const fetchScript = async(url: string): Promise<string> => {
  const resp = await httpFetch(url).promise as { body?: unknown }
  const script: unknown = resp?.body
  if (typeof script != 'string' || !script.length) throw new Error('empty script')
  if (script.length > MAX_SCRIPT_SIZE) throw new Error('script too large')
  return script
}

const checkOne = async(api: LX.UserApi.UserApiInfo): Promise<LX.UserApi.UserApiUpdateCheckResult> => {
  const result: LX.UserApi.UserApiUpdateCheckResult = {
    id: api.id,
    name: api.name,
    currentVersion: api.version ?? '',
    latestVersion: api.version ?? '',
    hasUpdate: false,
  }
  if (!isOnlineUrl(api.sourceUrl)) {
    result.error = 'no source url'
    return result
  }

  try {
    const script = await fetchScript(api.sourceUrl)
    const info = parseUserApiScriptInfo(script)
    const latestVersion = info.version ?? ''
    const hasUpdate = !!latestVersion && compareVer(latestVersion, api.version ?? '0') > 0

    result.latestVersion = latestVersion || result.currentVersion
    result.hasUpdate = hasUpdate
    if (hasUpdate) latestScripts.set(api.id, script)
    else latestScripts.delete(api.id)

    await setUserApiUpdateState(api.id, {
      lastCheckTime: Date.now(),
      latestVersion: result.latestVersion,
      hasUpdate,
      checkError: undefined,
    })
  } catch (err: any) {
    result.error = err?.message ?? String(err)
    log.warn(`check user api update failed: ${api.name} ${result.error}`)
    await setUserApiUpdateState(api.id, {
      lastCheckTime: Date.now(),
      checkError: result.error,
    }).catch(() => {})
  }

  return result
}

/**
 * 检查自定义源更新
 * @param ids 指定要检查的自定义源 id，不传则检查全部支持在线更新的源
 */
export const checkUserApiUpdates = async(ids?: string[]): Promise<LX.UserApi.UserApiUpdateCheckResult[]> => {
  if (checkingPromise) return checkingPromise

  checkingPromise = (async() => {
    const list = await getUserApiList()
    const targets = list.filter(api => isOnlineUrl(api.sourceUrl) && (!ids || ids.includes(api.id)))
    const results: LX.UserApi.UserApiUpdateCheckResult[] = []
    // 串行检查，避免同时发起大量请求
    for (const api of targets) {
      results.push(await checkOne(api))
    }
    await refreshUserApiList()
    return results
  })().finally(() => {
    checkingPromise = null
  })

  return checkingPromise
}

/**
 * 更新指定自定义源到最新版本
 */
export const applyUserApiUpdate = async(id: string): Promise<boolean> => {
  const list = await getUserApiList()
  const api = list.find(item => item.id == id)
  if (!api) return false

  let script = latestScripts.get(id)
  if (!script) {
    if (!isOnlineUrl(api.sourceUrl)) return false
    script = await fetchScript(api.sourceUrl)
  }

  const updated = await updateUserApiScript(id, script)
  if (!updated) return false
  latestScripts.delete(id)
  await refreshUserApiList()

  // 若更新的是当前启用的源，立即重载脚本
  if (settingState.setting['common.apiSource'] == id) {
    await setUserApi(id).catch((err: any) => {
      log.error(`reload user api failed: ${err?.message ?? err}`)
    })
  }
  return true
}

const applyAllUpdates = async(results: LX.UserApi.UserApiUpdateCheckResult[]) => {
  let updatedCount = 0
  for (const result of results) {
    if (!result.hasUpdate) continue
    try {
      if (await applyUserApiUpdate(result.id)) updatedCount++
    } catch (err: any) {
      log.error(`apply user api update failed: ${err?.message ?? err}`)
    }
  }
  return updatedCount
}

/**
 * 处理检查结果：静默更新或提示用户
 */
export const handleUserApiUpdateResult = async(results: LX.UserApi.UserApiUpdateCheckResult[], showEmptyTip = false) => {
  const updateResults = results.filter(result => result.hasUpdate)
  if (!updateResults.length) {
    if (showEmptyTip) toast(global.i18n.t('user_api_check_update_latest'))
    return
  }

  if (settingState.setting['common.userApiAutoUpdate']) {
    const count = await applyAllUpdates(updateResults)
    if (count) toast(global.i18n.t('user_api_auto_update_done', { count }))
    return
  }

  for (const result of updateResults) {
    const list = await getUserApiList()
    const api = list.find(item => item.id == result.id)
    if (!api?.allowShowUpdateAlert) continue

    const confirm = await confirmDialog({
      message: global.i18n.t('user_api_check_update_found', {
        name: result.name,
        currentVersion: result.currentVersion || '-',
        latestVersion: result.latestVersion || '-',
      }),
      confirmButtonText: global.i18n.t('user_api_update_now'),
      cancelButtonText: global.i18n.t('user_api_update_later'),
    })
    if (!confirm) continue
    try {
      const success = await applyUserApiUpdate(result.id)
      toast(success ? global.i18n.t('user_api_update_success') : global.i18n.t('user_api_update_failed'))
    } catch (err: any) {
      toast(global.i18n.t('user_api_update_failed'), 'long')
      log.error(`apply user api update failed: ${err?.message ?? err}`)
    }
  }
}

/**
 * 手动检查并处理更新
 */
export const checkAndHandleUserApiUpdate = async(ids?: string[]) => {
  const list = await getUserApiList()
  if (!list.some(api => isOnlineUrl(api.sourceUrl))) {
    toast(global.i18n.t('user_api_check_update_no_source'))
    return []
  }
  const results = await checkUserApiUpdates(ids)
  await handleUserApiUpdateResult(results, true)
  return results
}

const needCheck = async() => {
  const list = await getUserApiList()
  const targets = list.filter(api => isOnlineUrl(api.sourceUrl))
  if (!targets.length) return false
  return targets.some(api => !api.lastCheckTime || Date.now() - api.lastCheckTime > CHECK_INTERVAL)
}

const runMonitorTask = async() => {
  if (!settingState.setting['common.userApiAutoCheckUpdate']) return
  try {
    if (!await needCheck()) return
    const results = await checkUserApiUpdates()
    await handleUserApiUpdateResult(results)
  } catch (err: any) {
    log.error(`check user api update failed: ${err?.message ?? err}`)
  }
}

/**
 * 启动自定义源更新监控：启动后延迟检查一次，之后定期检查
 */
export const startUserApiUpdateMonitor = () => {
  BackgroundTimer.setTimeout(() => {
    void runMonitorTask()
  }, 8000)

  BackgroundTimer.setInterval(() => {
    void runMonitorTask()
  }, POLL_INTERVAL)

  global.state_event.on('configUpdated', (keys) => {
    if (!keys.includes('common.userApiAutoCheckUpdate')) return
    if (!settingState.setting['common.userApiAutoCheckUpdate']) return
    setTimeout(() => {
      void runMonitorTask()
    }, 1000)
  })
}

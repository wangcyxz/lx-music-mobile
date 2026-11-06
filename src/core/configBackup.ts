import settingState from '@/store/setting/state'
import { updateSetting } from '@/core/common'
import { refreshUserApiList } from '@/core/userApi'
import { setApiSource } from '@/core/apiSource'
import { getAllLists, importNewListData } from '@/screens/Home/Views/Setting/settings/Backup/actions'
import {
  getDislikeListRules,
  getUserApiList,
  getUserApiScript,
  getWebDavConfig,
  overwriteUserApiList,
} from '@/utils/data'
import { readFile, writeFile } from '@/utils/fs'
import { confirmDialog, handleReadFile, showImportTip, toast } from '@/utils/tools'
import { DEFAULT_SETTING } from '@/config/constant'
import { log } from '@/utils/log'
import {
  BACKUP_FILE_EXT,
  deleteWebDavFile,
  downloadWebDavFile,
  listWebDavFiles,
  testWebDavConnection as testWebDav,
  uploadWebDavFile,
} from './webdav'


const pad = (num: number) => String(num).padStart(2, '0')

const buildFileName = () => {
  const now = new Date()
  return `lx_config_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`
}

/**
 * 收集备份数据（用户设置 + 自定义音源 + 列表 + 不喜欢列表）
 */
export const buildBackupData = async() => {
  const userApiList = await getUserApiList()
  const userApis = []
  for (const info of userApiList) {
    userApis.push({ ...info, script: await getUserApiScript(info.id) })
  }

  const data: LX.ConfigFile.ConfigBackup = {
    type: 'lx_config_backup',
    version: '1.0',
    timestamp: Date.now(),
    setting: { ...settingState.setting },
    userApi: userApis,
    playList: await getAllLists(),
    dislikeRules: await getDislikeListRules(),
  }

  return { fileName: buildFileName(), data }
}

/**
 * 读取备份文件内容
 * 统一为 JSON 文本格式，同时兼容旧版 .lxmc（gzip）备份
 */
const readBackupFile = async(filePath: string): Promise<LX.ConfigFile.ConfigBackup | null> => {
  if (/\.lxmc$/i.test(filePath)) {
    return await handleReadFile<LX.ConfigFile.ConfigBackup>(filePath)
  }
  const text: string = await readFile(filePath)
  let data: unknown = null
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  return data as LX.ConfigFile.ConfigBackup
}

/**
 * 导出配置备份到本地目录
 * @param dirPath 备份文件保存目录
 */
export const exportConfig = async(dirPath: string) => {
  const { fileName, data } = await buildBackupData()
  await writeFile(`${dirPath}/${fileName}.${BACKUP_FILE_EXT}`, JSON.stringify(data))
  return fileName
}

/**
 * 应用备份数据到当前应用
 */
export const applyBackupData = async(data: LX.ConfigFile.ConfigBackup) => {
  if (!data || typeof data != 'object') throw new Error('invalid backup data')

  const confirm = await confirmDialog({
    message: global.i18n.t('backup_config_import_confirm'),
    bgClose: false,
  })
  if (!confirm) return false

  // 1. 恢复用户设置（与默认设置合并，避免旧备份缺少新增的配置项）
  if (data.setting) {
    // 与默认设置合并，避免旧备份缺少新增的配置项；不覆盖用户协议状态
    const mergedSetting: LX.AppSetting = { ...DEFAULT_SETTING, ...(data.setting as LX.AppSetting) }
    const { 'common.isAgreePact': _ignored, ...restoredSetting } = mergedSetting
    void _ignored
    updateSetting(restoredSetting)
  }

  // 2. 恢复自定义音源（含脚本内容）
  if (data.userApi?.length) {
    await overwriteUserApiList(data.userApi)
    await refreshUserApiList()
  }

  // 3. 应用音源
  try {
    const apiId = settingState.setting['common.apiSource']
    if (apiId) setApiSource(apiId)
  } catch (err) {
    log.warn('restore api source failed: ' + (err as Error).message)
  }

  // 4. 恢复列表数据
  if (data.playList?.length) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    await importNewListData(data.playList as any)
  }

  // 5. 恢复不喜欢列表
  if (typeof data.dislikeRules == 'string' && data.dislikeRules) {
    await global.dislike_event.dislike_data_overwrite(data.dislikeRules)
  }

  return true
}

/**
 * 从本地备份文件恢复配置
 * @param filePath 备份文件路径
 */
export const importConfig = async(filePath: string) => {
  const data = await readBackupFile(filePath)
  if (data?.type != 'lx_config_backup') {
    showImportTip(data?.type ?? '')
    return
  }
  await applyBackupData(data)
}

/* ------------------------------ WebDAV ------------------------------ */

/**
 * 上传配置备份到 WebDAV
 */
export const exportConfigToWebDav = async() => {
  const config = await getWebDavConfig()
  const { fileName, data } = await buildBackupData()
  await uploadWebDavFile(config, `${fileName}.${BACKUP_FILE_EXT}`, JSON.stringify(data))
  return fileName
}

/**
 * 获取 WebDAV 上的备份文件列表
 */
export const fetchWebDavBackupList = async() => {
  return listWebDavFiles(await getWebDavConfig())
}

/**
 * 从 WebDAV 备份恢复配置
 */
export const importConfigFromWebDav = async(file: LX.Backup.WebDavFileInfo) => {
  const config = await getWebDavConfig()
  const content = await downloadWebDavFile(config, file)
  let data: LX.ConfigFile.ConfigBackup | null = null
  try {
    data = JSON.parse(content) as LX.ConfigFile.ConfigBackup
  } catch {
    data = null
  }
  if (data?.type != 'lx_config_backup') {
    showImportTip(data?.type ?? '')
    return false
  }
  return applyBackupData(data)
}

/**
 * 删除 WebDAV 上的备份文件
 */
export const removeWebDavBackup = async(file: LX.Backup.WebDavFileInfo) => {
  await deleteWebDavFile(await getWebDavConfig(), file)
}

/**
 * 测试 WebDAV 连接
 */
export const testWebDavConnection = async(config: LX.Backup.WebDavConfig) => {
  return testWebDav(config)
}

/* ------------------------------ 带提示的调用入口 ------------------------------ */

export const handleExportConfig = (path: string) => {
  toast(global.i18n.t('backup_config_export_tip_zip'))
  void exportConfig(path).then(() => {
    toast(global.i18n.t('backup_config_export_tip_success'))
  }).catch((err: any) => {
    log.error(err.message)
    toast(global.i18n.t('backup_config_export_tip_failed') + ': ' + (err.message as string))
  })
}

export const handleImportConfig = (path: string) => {
  toast(global.i18n.t('backup_config_import_tip_unzip'))
  void importConfig(path).then(() => {
    toast(global.i18n.t('backup_config_import_tip_success'), 'long')
  }).catch((err: any) => {
    log.error(err.message)
    toast(global.i18n.t('backup_config_import_tip_failed') + ': ' + (err.message as string))
  })
}

export const handleExportConfigToWebDav = () => {
  toast(global.i18n.t('webdav_uploading'))
  void exportConfigToWebDav().then(() => {
    toast(global.i18n.t('webdav_upload_success'))
  }).catch((err: any) => {
    log.error(err.message)
    toast(global.i18n.t('webdav_upload_failed') + ': ' + (err.message as string), 'long')
  })
}

export const handleImportConfigFromWebDav = (file: LX.Backup.WebDavFileInfo, onDone?: () => void) => {
  toast(global.i18n.t('backup_config_import_tip_unzip'))
  void importConfigFromWebDav(file).then(() => {
    toast(global.i18n.t('backup_config_import_tip_success'), 'long')
    onDone?.()
  }).catch((err: any) => {
    log.error(err.message)
    toast(global.i18n.t('webdav_download_failed') + ': ' + (err.message as string), 'long')
  })
}

export const handleRemoveWebDavBackup = (file: LX.Backup.WebDavFileInfo, onDone?: () => void) => {
  void removeWebDavBackup(file).then(() => {
    toast(global.i18n.t('webdav_delete_success'))
    onDone?.()
  }).catch((err: any) => {
    log.error(err.message)
    toast(global.i18n.t('webdav_delete_failed') + ': ' + (err.message as string), 'long')
  })
}

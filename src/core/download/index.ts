import BackgroundTimer from 'react-native-background-timer'

import { getMusicUrl, getLyricInfo } from '@/core/music'
import { getPlayQuality } from '@/core/music/utils'
import settingState from '@/store/setting/state'
import { state as downloadState } from '@/store/download/state'
import * as downloadAction from '@/store/download/action'
import { getDownloadList, saveDownloadList } from '@/utils/data'
import {
  downloadFile,
  existsFile,
  externalStorageDirectoryPath,
  mkdir,
  moveFile,
  privateStorageDirectoryPath,
  stopDownload,
  unlink,
  writeFile,
} from '@/utils/fs'
import { filterFileName, sizeFormate, throttle } from '@/utils/common'
import { formatMusicName, requestStoragePermission, toast } from '@/utils/tools'
import { log } from '@/utils/log'

// 默认使用系统公共 Music 目录，方便系统播放器 / 其他音乐 App 扫描
const PUBLIC_MUSIC_DOWNLOAD_DIR = `${externalStorageDirectoryPath}/Music`
// 无存储权限或分区存储不可用时的回退目录
const PRIVATE_DOWNLOAD_DIR = `${privateStorageDirectoryPath}/download`
const MAX_TASK_COUNT = 300

let downloadDir = PUBLIC_MUSIC_DOWNLOAD_DIR
let permissionRequested = false

const runningJobs = new Map<string, number>()
const pendingUrls = new Map<string, string>()

let isRunning = false
let initPromise: Promise<void> | null = null

const saveTasksThrottle = throttle(() => {
  void saveDownloadList(downloadState.tasks.map(task => ({ ...task })))
}, 2000)

const saveTasks = () => {
  saveTasksThrottle()
}

/**
 * 当前实际使用的下载目录
 */
export const getDownloadDir = () => downloadDir

/**
 * 测试目录是否可写
 */
const checkDirWritable = async(dir: string) => {
  try {
    await mkdir(dir)
    const probePath = `${dir}/.lx_write_test`
    await writeFile(probePath, 'lx')
    await unlink(probePath)
    return true
  } catch (err) {
    console.log('download dir is not writable: ' + dir, err)
    return false
  }
}

/**
 * 确定下载目录，优先使用系统 Music 目录，不可用时回退到应用私有目录
 * @param canRequestPermission 是否允许申请存储权限
 */
export const ensureDownloadDir = async(canRequestPermission = false) => {
  if (downloadDir == PUBLIC_MUSIC_DOWNLOAD_DIR && await checkDirWritable(PUBLIC_MUSIC_DOWNLOAD_DIR)) return downloadDir

  if (canRequestPermission && !permissionRequested) {
    permissionRequested = true
    await requestStoragePermission()
  }

  if (await checkDirWritable(PUBLIC_MUSIC_DOWNLOAD_DIR)) {
    downloadDir = PUBLIC_MUSIC_DOWNLOAD_DIR
  } else {
    downloadDir = PRIVATE_DOWNLOAD_DIR
    await mkdir(PRIVATE_DOWNLOAD_DIR).catch(() => {})
  }
  return downloadDir
}

const getStatusText = (status: LX.Download.DownloadTaskStatus, extra?: string) => {
  switch (status) {
    case 'waiting': return global.i18n.t('download_status_waiting')
    case 'run': return extra ?? global.i18n.t('download_status_running')
    case 'completed': return global.i18n.t('download_status_completed')
    case 'error': return extra ?? global.i18n.t('download_status_error')
    case 'pause': return global.i18n.t('download_status_paused')
    default: return ''
  }
}

const getExt = (url: string, quality: LX.Quality): LX.Download.FileExt => {
  const path = url.split('?')[0].split('#')[0]
  const result = /\.(mp3|flac|wav|ape|m4a|aac|ogg)$/i.exec(path)
  if (result) return result[1].toLowerCase() as LX.Download.FileExt
  return quality.startsWith('flac') ? 'flac' : 'mp3'
}

const getBaseFileName = (musicInfo: LX.Music.MusicInfoOnline) => {
  const name = formatMusicName(settingState.setting['download.fileName'], musicInfo.name, musicInfo.singer)
  return filterFileName(name).trim() || filterFileName(musicInfo.name).trim() || `music_${Date.now()}`
}

/**
 * 生成不重复的文件路径
 */
const createFilePath = async(musicInfo: LX.Music.MusicInfoOnline, ext: LX.Download.FileExt) => {
  const baseName = getBaseFileName(musicInfo)
  let fileName = `${baseName}.${ext}`
  let filePath = `${downloadDir}/${fileName}`
  let index = 1
  while (await existsFile(filePath)) {
    fileName = `${baseName} (${index++}).${ext}`
    filePath = `${downloadDir}/${fileName}`
  }
  return { fileName, filePath }
}

const findTask = (musicInfo: LX.Music.MusicInfoOnline, quality?: LX.Quality) => {
  return downloadState.tasks.find(task => {
    if (task.metadata.musicInfo.id != musicInfo.id) return false
    if (task.metadata.musicInfo.source != musicInfo.source) return false
    if (quality && task.metadata.quality != quality) return false
    return true
  })
}

const updateTask = (id: string, patch: Partial<LX.Download.ListItem>) => {
  downloadAction.updateTask(id, patch)
}

const createTask = (musicInfo: LX.Music.MusicInfoOnline, quality: LX.Quality, isAuto: boolean): LX.Download.ListItem => {
  return {
    id: `download_${Date.now()}_${Math.random().toString().substring(2, 6)}`,
    isComplate: false,
    status: 'waiting',
    statusText: getStatusText('waiting'),
    downloaded: 0,
    total: 0,
    progress: 0,
    speed: '',
    isAuto,
    createdAt: Date.now(),
    metadata: {
      musicInfo,
      url: null,
      quality,
      ext: quality.startsWith('flac') ? 'flac' : 'mp3',
      fileName: '',
      filePath: '',
    },
  }
}

const getTargetQuality = (musicInfo: LX.Music.MusicInfoOnline, quality?: LX.Quality): LX.Quality => {
  if (quality) return quality
  if (!musicInfo.meta?._qualitys) return '128k'
  return getPlayQuality(settingState.setting['player.playQuality'], musicInfo)
}

/**
 * 加入下载队列
 * @param musicInfo 歌曲信息
 * @param options.quality 目标音质，默认跟随播放音质
 * @param options.url 已解析好的播放地址（边听边下时复用，避免重复请求）
 * @param options.isAuto 是否由边听边下自动加入
 * @param options.silent 是否静默加入（不提示）
 */
export const addDownload = async(
  musicInfo: LX.Music.MusicInfoOnline,
  { quality, url, isAuto = false, silent = false }: { quality?: LX.Quality, url?: string, isAuto?: boolean, silent?: boolean } = {},
) => {
  if (downloadState.tasks.length >= MAX_TASK_COUNT) {
    toast(global.i18n.t('download_max_task_tip'))
    return null
  }

  await ensureInit()

  // 手动下载时若当前在私有目录，则尝试申请权限切换到公共 Music 目录
  if (!isAuto && downloadDir != PUBLIC_MUSIC_DOWNLOAD_DIR) {
    await ensureDownloadDir(true)
    if (downloadDir != PUBLIC_MUSIC_DOWNLOAD_DIR) {
      toast(global.i18n.t('download_dir_private_tip'), 'long')
    }
  }

  const targetQuality = getTargetQuality(musicInfo, quality)
  if (url && /\.m3u8(\?|#|$)/i.test(url)) {
    if (!silent) toast(global.i18n.t('download_m3u8_not_supported'))
    return null
  }
  const existTask = findTask(musicInfo, targetQuality)
  if (existTask) {
    if (silent) return null
    const message = existTask.status == 'completed'
      ? global.i18n.t('download_exist_tip')
      : global.i18n.t('download_task_exist_tip')
    toast(message)
    return existTask
  }

  const task = createTask(musicInfo, targetQuality, isAuto)
  if (url) pendingUrls.set(task.id, url)

  if (isAuto) downloadAction.addTask(task)
  else {
    // 手动任务优先于自动缓存任务
    const firstAutoIndex = downloadState.tasks.findIndex(item => item.isAuto && item.status == 'waiting')
    if (firstAutoIndex < 0) downloadAction.addTask(task)
    else downloadAction.setTasks([...downloadState.tasks.slice(0, firstAutoIndex), task, ...downloadState.tasks.slice(firstAutoIndex)])
  }
  saveTasks()
  if (!silent) toast(global.i18n.t('download_added_tip'))

  void runQueue()
  return task
}

/**
 * 边听边下：播放地址解析完成后调用
 */
export const autoCacheMusic = async(musicInfo: LX.Music.MusicInfoOnline, url: string) => {
  if (!settingState.setting['download.isAutoCache']) return
  if (!url) return
  if (findTask(musicInfo)) return
  await addDownload(musicInfo, {
    url,
    quality: getTargetQuality(musicInfo),
    isAuto: true,
    silent: true,
  })
}

const saveSidecarFiles = async(task: LX.Download.ListItem) => {
  const musicInfo = task.metadata.musicInfo
  const basePath = task.metadata.filePath.replace(/\.[^./]+$/, '')

  if (settingState.setting['download.isSaveLyric']) {
    try {
      const lyricInfo = await getLyricInfo({ musicInfo })
      const lyric = lyricInfo.rawlrcInfo?.lyric || lyricInfo.lyric
      if (lyric) await writeFile(`${basePath}.lrc`, lyric)
    } catch (err) {
      console.log('save lyric failed', err)
    }
  }

  if (musicInfo.meta.picUrl) {
    try {
      await downloadFile(musicInfo.meta.picUrl, `${basePath}.jpg`, { progressInterval: 0 }).promise
    } catch (err) {
      console.log('save pic failed', err)
    }
  }
}

const runTask = async(task: LX.Download.ListItem, isRetry = false) => {
  const { musicInfo } = task.metadata
  updateTask(task.id, {
    status: 'run',
    statusText: getStatusText('run'),
    progress: 0,
    downloaded: 0,
    total: 0,
    speed: '',
    errorMessage: undefined,
  })

  let usedPendingUrl = false
  try {
    let url = pendingUrls.get(task.id) ?? ''
    pendingUrls.delete(task.id)
    usedPendingUrl = !!url
    if (!url) {
      updateTask(task.id, { statusText: global.i18n.t('download_status_resolving') })
      url = await getMusicUrl({
        musicInfo,
        quality: task.metadata.quality,
        // 下载任务不复用可能已过期的播放地址缓存
        isRefresh: true,
      })
    }
    if (!url) throw new Error(global.i18n.t('download_url_failed'))
    if (/\.m3u8(\?|#|$)/i.test(url)) throw new Error(global.i18n.t('download_m3u8_not_supported'))

    const ext = getExt(url, task.metadata.quality)
    const { fileName, filePath } = await createFilePath(musicInfo, ext)
    const partPath = `${filePath}.part`
    if (await existsFile(partPath)) await unlink(partPath)

    updateTask(task.id, {
      metadata: {
        ...task.metadata,
        url,
        ext,
        fileName,
        filePath,
      },
    })

    let lastTime = Date.now()
    let lastBytes = 0
    const downloadJob = downloadFile(url, partPath, {
      progressInterval: 500,
      connectionTimeout: 30_000,
      readTimeout: 60_000,
      progress: ({ contentLength, bytesWritten }) => {
        const now = Date.now()
        const duration = (now - lastTime) / 1000
        const speed = duration > 0 ? (bytesWritten - lastBytes) / duration : 0
        lastTime = now
        lastBytes = bytesWritten
        const total = contentLength > 0 ? contentLength : 0
        updateTask(task.id, {
          downloaded: bytesWritten,
          total,
          progress: total > 0 ? Math.min(bytesWritten / total, 1) : 0,
          speed: `${sizeFormate(speed)}/s`,
          statusText: getStatusText('run', `${sizeFormate(bytesWritten)}${total > 0 ? ` / ${sizeFormate(total)}` : ''}`),
        })
      },
    })
    runningJobs.set(task.id, downloadJob.jobId)
    const result = await downloadJob.promise
    runningJobs.delete(task.id)

    if (result.statusCode && result.statusCode >= 400) throw new Error(`HTTP ${result.statusCode}`)
    if (!await existsFile(partPath)) throw new Error(global.i18n.t('download_file_missing'))

    if (await existsFile(filePath)) await unlink(filePath)
    await moveFile(partPath, filePath)

    updateTask(task.id, {
      isComplate: true,
      status: 'completed',
      statusText: getStatusText('completed'),
      progress: 1,
      speed: '',
      downloaded: result.bytesWritten ?? task.downloaded,
    })
    saveTasks()

    void saveSidecarFiles(task).catch(() => {})
  } catch (err: any) {
    // 复用的播放地址可能已过期，自动用新解析的地址重试一次
    if (usedPendingUrl && !isRetry) {
      console.log('download with pending url failed, retry with fresh url', err)
      return runTask(task, true)
    }

    console.log('download failed', err)
    log.error(`download failed: ${err?.message ?? err}`)
    // 地址可能已过期，清空以便重试时重新解析
    updateTask(task.id, {
      status: 'error',
      statusText: getStatusText('error', err?.message),
      errorMessage: err?.message ?? String(err),
      speed: '',
    })
    runningJobs.delete(task.id)
    saveTasks()

    if (task.metadata.filePath) {
      void existsFile(`${task.metadata.filePath}.part`).then(async exists => {
        if (exists) await unlink(`${task.metadata.filePath}.part`)
      }).catch(() => {})
    }
  } finally {
    pendingUrls.delete(task.id)
  }
}

const runQueue = async() => {
  if (isRunning) return
  isRunning = true
  try {
    while (true) {
      const task = downloadState.tasks.find(item => item.status == 'waiting')
      if (!task) break
      await runTask(task)
    }
  } finally {
    isRunning = false
  }
}

const ensureInit = async(): Promise<void> => {
  if (!initPromise) initPromise = initDownload()
  return initPromise
}

/**
 * 重试下载任务
 */
export const retryDownload = async(id: string) => {
  const task = downloadState.tasks.find(item => item.id == id)
  if (!task || task.status == 'run') return
  updateTask(id, {
    status: 'waiting',
    statusText: getStatusText('waiting'),
    progress: 0,
    downloaded: 0,
    speed: '',
    errorMessage: undefined,
  })
  await ensureInit()
  void runQueue()
}

/**
 * 删除下载任务
 */
export const removeDownload = async(id: string, deleteFile = true) => {
  const task = downloadState.tasks.find(item => item.id == id)
  if (!task) return

  const jobId = runningJobs.get(id)
  if (jobId) {
    runningJobs.delete(id)
    try {
      stopDownload(jobId)
    } catch (err) {
      console.log('stop download failed', err)
    }
  }
  pendingUrls.delete(id)
  downloadAction.removeTask(id)
  saveTasks()

  if (!deleteFile) return
  try {
    if (task.metadata.filePath) {
      if (await existsFile(task.metadata.filePath)) await unlink(task.metadata.filePath)
      if (await existsFile(`${task.metadata.filePath}.part`)) await unlink(`${task.metadata.filePath}.part`)
      const basePath = task.metadata.filePath.replace(/\.[^./]+$/, '')
      for (const ext of ['lrc', 'jpg']) {
        if (await existsFile(`${basePath}.${ext}`)) await unlink(`${basePath}.${ext}`)
      }
    }
  } catch (err) {
    console.log('delete download file failed', err)
  }
}

/**
 * 清空已完成/失败的任务
 */
export const clearDownload = async(status: LX.Download.DownloadTaskStatus[] = ['completed', 'error']) => {
  for (const task of [...downloadState.tasks]) {
    if (!status.includes(task.status)) continue
    await removeDownload(task.id, task.status == 'completed')
  }
}

/**
 * 初始化下载模块：创建目录、恢复任务
 */
export const initDownload = async() => {
  await ensureDownloadDir()

  const savedTasks = await getDownloadList()
  const tasks: LX.Download.ListItem[] = []
  for (const task of savedTasks) {
    if (!task?.metadata?.musicInfo) continue
    if (task.status == 'completed') {
      if (!await existsFile(task.metadata.filePath)) {
        task.status = 'error'
        task.statusText = global.i18n.t('download_file_not_found')
        task.errorMessage = global.i18n.t('download_file_not_found')
      }
    } else {
      task.status = 'waiting'
      task.statusText = getStatusText('waiting')
      task.progress = 0
      task.downloaded = 0
      task.total = 0
      task.speed = ''
    }
    tasks.push(task)
  }
  downloadAction.setTasks(tasks)
  if (tasks.some(task => task.status == 'waiting')) {
    BackgroundTimer.setTimeout(() => { void runQueue() }, 3000)
  }
}

/**
 * 组件/播放器需要下载模块时调用，确保已完成初始化
 */
export const ensureDownloadInit = ensureInit

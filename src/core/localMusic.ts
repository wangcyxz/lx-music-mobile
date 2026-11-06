import { readDir } from '@/utils/fs'
import { readMetadata } from '@/utils/localMediaMetadata'
import { getLocalMusicData, saveLocalMusicData } from '@/utils/data'
import { formatPlayTime2 } from '@/utils'
import { requestStoragePermission, toast } from '@/utils/tools'
import { setTempList } from '@/core/list'
import { playList } from '@/core/player/player'
import { LIST_IDS } from '@/config/constant'
import settingState from '@/store/setting/state'
import {
  setLastScanTime,
  setScanDirs,
  setScanStatus,
  setSongs,
} from '@/store/localMusic/action'
import { log } from '@/utils/log'

/** 支持的音频扩展名 */
const AUDIO_EXT = ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'opus', 'ape', 'wma', 'aiff', 'aif']
/** 扫描时跳过这些目录（系统目录 / 无权限目录 / 缓存目录） */
const IGNORE_DIRS = ['Android', '.git', '.thumbnails', 'cache', 'Cache', '.Trash', 'LOST.DIR']
/** 递归最大深度，避免异常目录导致扫描卡死 */
const MAX_SCAN_DEPTH = 12
/** 同时读取元数据的文件数 */
const META_BATCH_SIZE = 5
/** 临时播放列表 id，用于区分本地音乐的临时列表 */
const LOCAL_TEMP_LIST_ID = 'local_music'

/** 扫描状态（用对象持有，避免模块级变量读写产生的竞态告警） */
const scanState = {
  scanning: false,
  canceled: false,
}

/** 目录条目（原生文件模块未提供类型声明，这里显式定义以保留类型检查） */
interface ScanFileItem {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
  size: number
}

/** 音频文件元数据 */
interface LocalMusicMetadata {
  type: string
  bitrate: string
  /** 时长，单位秒 */
  interval: number
  size: number
  ext: string
  albumName: string
  singer: string
  name: string
}

const isAudioFile = (name: string) => {
  const index = name.lastIndexOf('.')
  if (index < 1) return false
  return AUDIO_EXT.includes(name.substring(index + 1).toLowerCase())
}

const getDirName = (path: string) => {
  const parts = path.split('/').filter(Boolean)
  return parts.at(-1) ?? path
}

/**
 * 获取文件所在文件夹路径
 */
export const getFileDirPath = (filePath: string) => {
  const index = filePath.lastIndexOf('/')
  return index > 0 ? filePath.substring(0, index) : filePath
}

const buildMusicInfo = (file: ScanFileItem, metadata: LocalMusicMetadata | null): LX.Music.MusicInfoLocal => {
  const index = file.name.lastIndexOf('.')
  const ext = index > 0 ? file.name.substring(index + 1).toLowerCase() : ''
  const name = index > 0 ? file.name.substring(0, index) : file.name

  if (!metadata) {
    // 元数据读取失败（例如 m4a 等原生模块不支持的格式）时按文件名兜底，仍可播放
    return {
      id: file.path,
      name,
      singer: '',
      source: 'local',
      interval: null,
      meta: {
        albumName: '',
        filePath: file.path,
        songId: file.path,
        picUrl: '',
        ext,
      },
    }
  }

  return {
    id: file.path,
    name: metadata.name || name,
    singer: metadata.singer,
    source: 'local',
    interval: formatPlayTime2(metadata.interval),
    meta: {
      albumName: metadata.albumName,
      filePath: file.path,
      songId: file.path,
      picUrl: '',
      ext: metadata.ext || ext,
    },
  }
}

/**
 * 递归收集目录下的音频文件
 */
const scanDirRecursive = async(dirPath: string, depth: number, files: ScanFileItem[]): Promise<void> => {
  if (depth > MAX_SCAN_DEPTH || scanState.canceled) return
  const list = await readDir(dirPath).catch(() => [] as ScanFileItem[]) as ScanFileItem[]
  for (const item of list) {
    if (scanState.canceled) return
    if (item.isDirectory) {
      // 跳过隐藏目录与系统目录
      if (item.name.startsWith('.') || IGNORE_DIRS.includes(item.name)) continue
      await scanDirRecursive(item.path, depth + 1, files)
    } else if (item.isFile && isAudioFile(item.name)) {
      files.push(item)
    }
  }
}

/**
 * 批量读取文件元数据，并做短音频过滤
 */
const readMetadatas = async(files: ScanFileItem[], status: { filtered: number, failed: number }): Promise<LX.Music.MusicInfoLocal[]> => {
  const filterShortAudio = settingState.setting['localMusic.filterShortAudio']
  const minDuration = settingState.setting['localMusic.minDuration']
  const songs: LX.Music.MusicInfoLocal[] = []

  await Promise.all(files.map(async file => {
    const metadata = await readMetadata(file.path).catch(() => null) as LocalMusicMetadata | null
    if (!metadata) status.failed++
    else if (filterShortAudio && metadata.interval > 0 && metadata.interval < minDuration) {
      // 过短的音频（录音、通知音、铃声等）不计入
      status.filtered++
      return
    }
    songs.push(buildMusicInfo(file, metadata))
  }))

  return songs
}

/**
 * 初始化：载入持久化的扫描目录与扫描结果
 */
export const initLocalMusic = async() => {
  const data = await getLocalMusicData()
  if (!data) return
  setScanDirs(data.scanDirs ?? [])
  setSongs(data.songs ?? [])
  setLastScanTime(data.lastScanTime ?? 0)
}

/**
 * 添加扫描目录
 */
export const addScanDir = async(dirPath: string) => {
  const data = await getLocalMusicData()
  const scanDirs = data?.scanDirs ?? []
  if (scanDirs.includes(dirPath)) return false
  scanDirs.push(dirPath)
  setScanDirs(scanDirs)
  await saveLocalMusicData({
    scanDirs,
    songs: data?.songs ?? [],
    lastScanTime: data?.lastScanTime ?? 0,
  })
  return true
}

/**
 * 移除扫描目录，同时清理该目录下的扫描结果
 */
export const removeScanDir = async(dirPath: string) => {
  const data = await getLocalMusicData()
  if (!data) return
  const scanDirs = data.scanDirs.filter(dir => dir != dirPath)
  const songs = data.songs.filter(song => !song.meta.filePath.startsWith(`${dirPath}/`))
  setScanDirs(scanDirs)
  setSongs(songs)
  await saveLocalMusicData({ scanDirs, songs, lastScanTime: data.lastScanTime })
}

/**
 * 扫描所有目录下的音频文件
 */
export const startScan = async() => {
  if (scanState.scanning) return
  const hasPermission = await requestStoragePermission()
  if (!hasPermission) {
    toast(global.i18n.t('storage_permission_tip_disagree'), 'long')
    return
  }

  const data = await getLocalMusicData()
  const scanDirs = data?.scanDirs ?? []
  if (!scanDirs.length) {
    toast(global.i18n.t('local_music_no_dir_tip'), 'long')
    return
  }

  scanState.scanning = true
  scanState.canceled = false
  setScanStatus({ scanning: true, total: 0, scanned: 0, filtered: 0, failed: 0 })

  const files: ScanFileItem[] = []
  for (const dir of scanDirs) {
    if (scanState.canceled) break
    await scanDirRecursive(dir, 0, files)
  }

  if (scanState.canceled) {
    scanState.scanning = false
    setScanStatus({ scanning: false, total: 0, scanned: 0, filtered: 0, failed: 0 })
    toast(global.i18n.t('local_music_scan_canceled'), 'long')
    return
  }

  const status = { filtered: 0, failed: 0 }
  const songs: LX.Music.MusicInfoLocal[] = []
  setScanStatus({ scanning: true, total: files.length, scanned: 0, filtered: 0, failed: 0 })

  for (let index = 0; index < files.length; index += META_BATCH_SIZE) {
    if (scanState.canceled) break
    const batch = files.slice(index, index + META_BATCH_SIZE)
    const infos = await readMetadatas(batch, status).catch((err: any) => {
      log.warn('read metadata failed:', err?.message as string)
      return [] as LX.Music.MusicInfoLocal[]
    })
    songs.push(...infos)
    // 边扫边显示，避免长时间白屏
    setSongs([...songs])
    setScanStatus({
      scanning: true,
      total: files.length,
      scanned: Math.min(index + META_BATCH_SIZE, files.length),
      filtered: status.filtered,
      failed: status.failed,
    })
  }

  scanState.scanning = false
  const lastScanTime = scanState.canceled ? (data?.lastScanTime ?? 0) : Date.now()
  setScanStatus({ scanning: false, total: files.length, scanned: songs.length, filtered: status.filtered, failed: status.failed })
  setLastScanTime(lastScanTime)
  await saveLocalMusicData({ scanDirs, songs, lastScanTime })

  if (scanState.canceled) toast(global.i18n.t('local_music_scan_canceled'), 'long')
  else if (!songs.length) toast(global.i18n.t('local_music_scan_empty_tip'), 'long')
  else toast(global.i18n.t('local_music_scan_result_tip', { total: songs.length }), 'long')
}

/**
 * 取消正在进行的扫描
 */
export const cancelScan = () => {
  if (!scanState.scanning) return
  scanState.canceled = true
}

export const isScanning = () => scanState.scanning

/**
 * 按文件夹分组
 */
export const groupByFolder = (songs: LX.Music.MusicInfoLocal[]): LX.LocalMusic.FolderGroup[] => {
  const map = new Map<string, LX.Music.MusicInfoLocal[]>()
  for (const song of songs) {
    const dir = getFileDirPath(song.meta.filePath)
    const list = map.get(dir)
    if (list) list.push(song)
    else map.set(dir, [song])
  }
  const groups: LX.LocalMusic.FolderGroup[] = []
  for (const [path, list] of map) {
    groups.push({ path, name: getDirName(path), songs: list })
  }
  groups.sort((a, b) => a.name.localeCompare(b.name))
  return groups
}

/**
 * 播放一组本地歌曲
 */
export const playLocalMusicList = async(songs: LX.Music.MusicInfoLocal[], index: number) => {
  if (!songs.length) return
  await setTempList(LOCAL_TEMP_LIST_ID, songs as unknown as LX.Music.MusicInfoOnline[])
  void playList(LIST_IDS.TEMP, index)
}

/**
 * 从扫描结果中移除歌曲（不会删除磁盘文件）
 */
export const removeLocalSong = async(filePath: string) => {
  const data = await getLocalMusicData()
  if (!data) return
  const songs = data.songs.filter(song => song.meta.filePath != filePath)
  setSongs(songs)
  await saveLocalMusicData({ ...data, songs })
}

/**
 * 清空扫描结果（不会删除磁盘文件）
 */
export const clearLocalMusic = async() => {
  const data = await getLocalMusicData()
  setSongs([])
  await saveLocalMusicData({
    scanDirs: data?.scanDirs ?? [],
    songs: [],
    lastScanTime: 0,
  })
}

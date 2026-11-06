declare namespace LX {
  namespace LocalMusic {
    /** 本地音乐持久化数据 */
    interface LocalMusicData {
      /** 扫描目录列表 */
      scanDirs: string[]
      /** 扫描到的歌曲，id 即文件路径 */
      songs: LX.Music.MusicInfoLocal[]
      /** 上次扫描完成时间 */
      lastScanTime: number
    }

    /** 按文件夹分组后的歌曲集合 */
    interface FolderGroup {
      /** 文件夹完整路径 */
      path: string
      /** 文件夹名（最后一级） */
      name: string
      /** 该文件夹下的歌曲 */
      songs: LX.Music.MusicInfoLocal[]
    }

    /** 扫描进度 */
    interface ScanStatus {
      /** 是否正在扫描 */
      scanning: boolean
      /** 已发现的文件总数 */
      total: number
      /** 已处理的文件数 */
      scanned: number
      /** 短音频被过滤掉的数量 */
      filtered: number
      /** 元数据读取失败的数量 */
      failed: number
    }
  }
}

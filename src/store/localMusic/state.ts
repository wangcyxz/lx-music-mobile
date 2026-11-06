interface InitState {
  /** 扫描到的歌曲 */
  songs: LX.Music.MusicInfoLocal[]
  /** 扫描目录 */
  scanDirs: string[]
  /** 上次扫描完成时间 */
  lastScanTime: number
  /** 扫描进度 */
  scanStatus: LX.LocalMusic.ScanStatus
}

const state: InitState = {
  songs: [],
  scanDirs: [],
  lastScanTime: 0,
  scanStatus: {
    scanning: false,
    total: 0,
    scanned: 0,
    filtered: 0,
    failed: 0,
  },
}

export { state }

import { state } from './state'
import { event } from './event'


export const setSongs = (songs: LX.Music.MusicInfoLocal[]) => {
  state.songs = songs
  event.songs_changed([...state.songs])
}

export const setScanDirs = (scanDirs: string[]) => {
  state.scanDirs = scanDirs
  event.scan_dirs_changed([...state.scanDirs])
}

export const setLastScanTime = (lastScanTime: number) => {
  state.lastScanTime = lastScanTime
  event.last_scan_time_changed(state.lastScanTime)
}

export const setScanStatus = (scanStatus: LX.LocalMusic.ScanStatus) => {
  state.scanStatus = { ...scanStatus }
  event.scan_status_changed(state.scanStatus)
}

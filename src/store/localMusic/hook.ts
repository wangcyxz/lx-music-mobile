import { useEffect, useState } from 'react'
import { state } from './state'
import { event } from './event'

export const useLocalSongs = () => {
  const [value, update] = useState(state.songs)

  useEffect(() => {
    event.on('songs_changed', update)
    return () => {
      event.off('songs_changed', update)
    }
  }, [])

  return value
}

export const useScanDirs = () => {
  const [value, update] = useState(state.scanDirs)

  useEffect(() => {
    event.on('scan_dirs_changed', update)
    return () => {
      event.off('scan_dirs_changed', update)
    }
  }, [])

  return value
}

export const useLastScanTime = () => {
  const [value, update] = useState(state.lastScanTime)

  useEffect(() => {
    event.on('last_scan_time_changed', update)
    return () => {
      event.off('last_scan_time_changed', update)
    }
  }, [])

  return value
}

export const useScanStatus = () => {
  const [value, update] = useState(state.scanStatus)

  useEffect(() => {
    event.on('scan_status_changed', update)
    return () => {
      event.off('scan_status_changed', update)
    }
  }, [])

  return value
}

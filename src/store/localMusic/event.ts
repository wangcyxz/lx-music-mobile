import Event from '@/event/Event'


class LocalMusicEvent extends Event {
  songs_changed(songs: LX.Music.MusicInfoLocal[]) {
    this.emit('songs_changed', songs)
  }

  scan_dirs_changed(scanDirs: string[]) {
    this.emit('scan_dirs_changed', scanDirs)
  }

  last_scan_time_changed(lastScanTime: number) {
    this.emit('last_scan_time_changed', lastScanTime)
  }

  scan_status_changed(scanStatus: LX.LocalMusic.ScanStatus) {
    this.emit('scan_status_changed', scanStatus)
  }
}


type EventMethods = Omit<EventType, keyof Event>


declare class EventType extends LocalMusicEvent {
  on<K extends keyof EventMethods>(event: K, listener: EventMethods[K]): any
  off<K extends keyof EventMethods>(event: K, listener: EventMethods[K]): any
}

type LocalMusicEventTypes = Omit<EventType, keyof Omit<Event, 'on' | 'off'>>


export const event: LocalMusicEventTypes = new LocalMusicEvent()

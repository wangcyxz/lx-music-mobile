import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { View, TouchableOpacity, FlatList } from 'react-native'

import Text from '@/components/common/Text'
import Input from '@/components/common/Input'
import { Icon } from '@/components/common/Icon'
import MusicAddModal, { type MusicAddModalType } from '@/components/MusicAddModal'
import { BorderWidths } from '@/theme'
import { createStyle, confirmDialog, toast } from '@/utils/tools'
import { dateFormat2 } from '@/utils'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { useLastScanTime, useLocalSongs, useScanDirs, useScanStatus } from '@/store/localMusic'
import { addTempPlayList } from '@/core/player/tempPlayList'
import { LIST_IDS } from '@/config/constant'
import {
  cancelScan,
  clearLocalMusic,
  groupByFolder,
  playLocalMusicList,
  removeLocalSong,
  startScan,
} from '@/core/localMusic'
import MusicMenu, { type MusicMenuType } from './MusicMenu'
import ScanDirModal, { type ScanDirModalType } from './ScanDirModal'

type TabType = 'folder' | 'all'

const SongItem = memo(({ song, onPlay, onShowMenu }: {
  song: LX.Music.MusicInfoLocal
  onPlay: (song: LX.Music.MusicInfoLocal) => void
  onShowMenu: (song: LX.Music.MusicInfoLocal, position: { x: number, y: number, w: number, h: number }) => void
}) => {
  const theme = useTheme()
  const moreButtonRef = useRef<TouchableOpacity>(null)

  const handlePress = useCallback(() => { onPlay(song) }, [onPlay, song])

  const handleShowMenu = useCallback(() => {
    if (moreButtonRef.current?.measure) {
      moreButtonRef.current.measure((_fx, _fy, width, height, px, py) => {
        onShowMenu(song, { x: Math.ceil(px), y: Math.ceil(py), w: Math.ceil(width), h: Math.ceil(height) })
      })
    }
  }, [onShowMenu, song])

  const desc = useMemo(() => {
    const items = [song.singer || global.i18n.t('local_music_unknown_singer')]
    if (song.interval) items.push(song.interval)
    if (song.meta.ext) items.push(song.meta.ext.toUpperCase())
    return items.join(' · ')
  }, [song])

  return (
    <View style={styles.item}>
      <TouchableOpacity style={styles.itemMain} onPress={handlePress} activeOpacity={0.6}>
        <Text size={14} numberOfLines={1}>{song.name}</Text>
        <Text size={11} color={theme['c-font-label']} numberOfLines={1}>{desc}</Text>
      </TouchableOpacity>
      <TouchableOpacity ref={moreButtonRef} style={styles.btn} onPress={handleShowMenu}>
        <Icon name="dots-vertical" size={16} color={theme['c-font-label']} />
      </TouchableOpacity>
    </View>
  )
})

const FolderItem = ({ group, onPress }: { group: LX.LocalMusic.FolderGroup, onPress: (path: string) => void }) => {
  const theme = useTheme()
  const t = useI18n()
  const handlePress = useCallback(() => { onPress(group.path) }, [group.path, onPress])

  return (
    <TouchableOpacity style={styles.item} onPress={handlePress} activeOpacity={0.6}>
      <Icon name="add_folder" size={18} color={theme['c-font-label']} />
      <View style={styles.itemMain}>
        <Text size={14} numberOfLines={1}>{group.name}</Text>
        <Text size={11} color={theme['c-font-label']} numberOfLines={1}>{group.path}</Text>
      </View>
      <Text size={11} color={theme['c-font-label']}>{t('local_music_song_count', { count: group.songs.length })}</Text>
    </TouchableOpacity>
  )
}

const FilterTab = ({ id, label, active, onPress }: {
  id: TabType
  label: string
  active: boolean
  onPress: (id: TabType) => void
}) => {
  const theme = useTheme()
  const handlePress = useCallback(() => { onPress(id) }, [id, onPress])
  return (
    <TouchableOpacity style={styles.filterTab} onPress={handlePress} activeOpacity={0.6}>
      <Text size={13} color={active ? theme['c-primary-font-active'] : theme['c-font-label']}>{label}</Text>
      <View style={{ ...styles.filterLine, backgroundColor: active ? theme['c-primary'] : 'transparent' }} />
    </TouchableOpacity>
  )
}

const ScanProgressBar = ({ status }: { status: LX.LocalMusic.ScanStatus }) => {
  const theme = useTheme()
  const progress = status.total > 0 ? status.scanned / status.total : 0
  return (
    <View style={{ ...styles.progress, backgroundColor: theme['c-primary-light-300-alpha-800'] }}>
      <View style={{ ...styles.progressBar, width: `${Math.min(Math.max(progress, 0), 1) * 100}%`, backgroundColor: theme['c-primary'] }} />
    </View>
  )
}

export default memo(() => {
  const theme = useTheme()
  const t = useI18n()
  const songs = useLocalSongs()
  const scanDirs = useScanDirs()
  const scanStatus = useScanStatus()
  const lastScanTime = useLastScanTime()
  const [tab, setTab] = useState<TabType>('folder')
  const [keyword, setKeyword] = useState('')
  const [folderPath, setFolderPath] = useState<string | null>(null)
  const musicMenuRef = useRef<MusicMenuType>(null)
  const musicAddModalRef = useRef<MusicAddModalType>(null)
  const scanDirModalRef = useRef<ScanDirModalType>(null)

  const filteredSongs = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return songs
    return songs.filter(song => {
      return song.name.toLowerCase().includes(kw) ||
        song.singer.toLowerCase().includes(kw) ||
        (song.meta.albumName ?? '').toLowerCase().includes(kw) ||
        song.meta.filePath.toLowerCase().includes(kw)
    })
  }, [songs, keyword])

  const groups = useMemo(() => groupByFolder(filteredSongs), [filteredSongs])

  const currentFolder = useMemo(() => {
    if (!folderPath) return null
    return groups.find(group => group.path == folderPath) ?? null
  }, [groups, folderPath])

  // 当前展示的歌曲列表（决定播放时的上下文）
  const visibleSongs = useMemo(() => {
    if (currentFolder) return currentFolder.songs
    if (tab == 'all') return filteredSongs
    return []
  }, [currentFolder, tab, filteredSongs])

  const handleTabChange = useCallback((id: TabType) => {
    setTab(id)
    setFolderPath(null)
  }, [])

  const handleOpenFolder = useCallback((path: string) => {
    setFolderPath(path)
  }, [])

  const handleBack = useCallback(() => {
    setFolderPath(null)
  }, [])

  const handlePlaySong = useCallback((song: LX.Music.MusicInfoLocal) => {
    const list = currentFolder ? currentFolder.songs : filteredSongs
    const index = list.findIndex(item => item.id == song.id)
    if (index < 0) return
    void playLocalMusicList(list, index)
  }, [currentFolder, filteredSongs])

  const handlePlayAll = useCallback(() => {
    const list = currentFolder ? currentFolder.songs : filteredSongs
    if (!list.length) return
    void playLocalMusicList(list, 0)
  }, [currentFolder, filteredSongs])

  const handleShowMenu = useCallback((song: LX.Music.MusicInfoLocal, position: { x: number, y: number, w: number, h: number }) => {
    musicMenuRef.current?.show(song, position)
  }, [])

  const handleMenuPlay = useCallback((song: LX.Music.MusicInfoLocal) => {
    handlePlaySong(song)
  }, [handlePlaySong])

  const handleMenuPlayLater = useCallback((song: LX.Music.MusicInfoLocal) => {
    addTempPlayList([{ listId: LIST_IDS.PLAY_LATER, musicInfo: song, isTop: true }])
    toast(t('play_later_added_tip'))
  }, [t])

  const handleMenuAdd = useCallback((song: LX.Music.MusicInfoLocal) => {
    musicAddModalRef.current?.show({ musicInfo: song, listId: '', isMove: false })
  }, [])

  const handleMenuRemove = useCallback((song: LX.Music.MusicInfoLocal) => {
    void confirmDialog({
      message: t('local_music_remove_song_confirm', { name: song.name }),
      confirmButtonText: t('dialog_confirm'),
      cancelButtonText: t('dialog_cancel'),
    }).then(isConfirm => {
      if (!isConfirm) return
      void removeLocalSong(song.meta.filePath)
    })
  }, [t])

  const handleScan = useCallback(() => {
    if (scanStatus.scanning) {
      cancelScan()
      return
    }
    void startScan()
  }, [scanStatus.scanning])

  const handleManageDir = useCallback(() => {
    scanDirModalRef.current?.show()
  }, [])

  const handleClear = useCallback(() => {
    void confirmDialog({
      message: t('local_music_clear_confirm'),
      confirmButtonText: t('dialog_confirm'),
      cancelButtonText: t('dialog_cancel'),
    }).then(isConfirm => {
      if (!isConfirm) return
      void clearLocalMusic()
    })
  }, [t])

  const renderSongItem = useCallback(({ item }: { item: LX.Music.MusicInfoLocal }) => (
    <SongItem song={item} onPlay={handlePlaySong} onShowMenu={handleShowMenu} />
  ), [handlePlaySong, handleShowMenu])

  const renderGroupItem = useCallback(({ item }: { item: LX.LocalMusic.FolderGroup }) => (
    <FolderItem group={item} onPress={handleOpenFolder} />
  ), [handleOpenFolder])

  const showSongList = currentFolder != null || tab == 'all'

  const listEmptyComponent = (
    <View style={styles.empty}>
      <Icon name="sd-card" size={40} color={theme['c-350']} />
      <Text size={13} color={theme['c-font-label']} style={styles.emptyText}>{t('local_music_empty')}</Text>
      <Text size={11} color={theme['c-font-label']} style={styles.emptyTip}>{t('local_music_empty_tip')}</Text>
    </View>
  )

  const listFooterComponent = (
    <Text size={10} color={theme['c-font-label']} style={styles.footerTip} numberOfLines={2}>
      {
        lastScanTime
          ? `${t('local_music_last_scan')}: ${dateFormat2(lastScanTime)}`
          : t('local_music_never_scan')
      }
      {scanDirs.length ? `\n${t('local_music_scan_dir_title')}: ${scanDirs.length}` : ''}
    </Text>
  )

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <FilterTab id="folder" label={t('local_music_tab_folder')} active={tab == 'folder'} onPress={handleTabChange} />
        <FilterTab id="all" label={t('local_music_tab_all')} active={tab == 'all'} onPress={handleTabChange} />
        <View style={styles.filterSpace} />
        <TouchableOpacity style={styles.topBtn} onPress={handleManageDir}>
          <Icon name="add_folder" size={15} color={theme['c-font-label']} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.topBtn} onPress={handleScan}>
          <Icon
            name={scanStatus.scanning ? 'close' : 'available_updates'}
            size={15}
            color={theme['c-font-label']}
          />
        </TouchableOpacity>
        {
          !songs.length
            ? null
            : (
                <TouchableOpacity style={styles.topBtn} onPress={handleClear}>
                  <Icon name="eraser" size={15} color={theme['c-font-label']} />
                </TouchableOpacity>
              )
        }
      </View>

      {
        scanStatus.scanning
          ? <ScanProgressBar status={scanStatus} />
          : null
      }

      <View style={{ ...styles.searchBar, borderBottomColor: theme['c-border-background'] }}>
        <Input
          value={keyword}
          onChangeText={setKeyword}
          placeholder={t('local_music_search_tip')}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ ...styles.searchInput, backgroundColor: theme['c-primary-input-background'] }}
        />
      </View>

      {
        currentFolder
          ? (
              <View style={{ ...styles.subBar, borderBottomColor: theme['c-border-background'] }}>
                <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
                  <Icon name="chevron-left" size={16} color={theme['c-font-label']} />
                  <Text size={13} color={theme['c-font-label']} numberOfLines={1} style={styles.folderName}>{currentFolder.name}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.playAllBtn} onPress={handlePlayAll}>
                  <Icon name="play" size={13} color={theme['c-primary-font']} />
                  <Text size={12} color={theme['c-primary-font']} style={styles.playAllText}>{t('local_music_play_all')}</Text>
                </TouchableOpacity>
              </View>
            )
          : null
      }

      {
        showSongList
          ? (
              <FlatList
                style={styles.list}
                contentContainerStyle={visibleSongs.length ? undefined : styles.listEmptyContainer}
                data={visibleSongs}
                keyExtractor={item => item.id}
                renderItem={renderSongItem}
                ListEmptyComponent={listEmptyComponent}
                ListFooterComponent={listFooterComponent}
              />
            )
          : (
              <FlatList
                style={styles.list}
                contentContainerStyle={groups.length ? undefined : styles.listEmptyContainer}
                data={groups}
                keyExtractor={item => item.path}
                renderItem={renderGroupItem}
                ListEmptyComponent={listEmptyComponent}
                ListFooterComponent={listFooterComponent}
              />
            )
      }

      <MusicMenu
        ref={musicMenuRef}
        onPlay={handleMenuPlay}
        onPlayLater={handleMenuPlayLater}
        onAdd={handleMenuAdd}
        onRemove={handleMenuRemove}
      />
      <MusicAddModal ref={musicAddModalRef} />
      <ScanDirModal ref={scanDirModalRef} />
    </View>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    paddingLeft: 10,
    paddingRight: 6,
  },
  filterTab: {
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  filterLine: {
    marginTop: 3,
    height: 2,
    width: 20,
    borderRadius: 1,
  },
  filterSpace: {
    flex: 1,
  },
  topBtn: {
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  progress: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: 3,
    borderRadius: 2,
  },
  searchBar: {
    paddingHorizontal: 12,
    paddingBottom: 6,
    borderBottomWidth: BorderWidths.normal,
  },
  searchInput: {
    height: 32,
    borderRadius: 4,
    paddingHorizontal: 8,
    fontSize: 13,
  },
  subBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    paddingLeft: 8,
    paddingRight: 12,
    borderBottomWidth: BorderWidths.normal,
  },
  backBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  folderName: {
    marginLeft: 2,
  },
  playAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  playAllText: {
    marginLeft: 3,
  },
  list: {
    flex: 1,
  },
  listEmptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 15,
    paddingRight: 8,
    paddingVertical: 9,
    gap: 8,
    borderBottomWidth: BorderWidths.normal,
    borderBottomColor: 'rgba(128, 128, 128, 0.15)',
  },
  itemMain: {
    flex: 1,
    paddingRight: 4,
    gap: 3,
  },
  btn: {
    padding: 6,
  },
  empty: {
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 10,
  },
  emptyTip: {
    marginTop: 6,
    paddingHorizontal: 40,
    textAlign: 'center',
  },
  footerTip: {
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
})

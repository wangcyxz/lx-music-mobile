import { forwardRef, useImperativeHandle, useRef, useState } from 'react'

import Menu, { type MenuType, type Position, type Menus } from '@/components/common/Menu'
import { useI18n } from '@/lang'

const initSelectInfo = {}

export interface MusicMenuType {
  show: (musicInfo: LX.Music.MusicInfoLocal, position: Position) => void
}

export interface MusicMenuProps {
  onPlay: (musicInfo: LX.Music.MusicInfoLocal) => void
  onPlayLater: (musicInfo: LX.Music.MusicInfoLocal) => void
  onAdd: (musicInfo: LX.Music.MusicInfoLocal) => void
  onRemove: (musicInfo: LX.Music.MusicInfoLocal) => void
}

export default forwardRef<MusicMenuType, MusicMenuProps>((props, ref) => {
  const t = useI18n()
  const [visible, setVisible] = useState(false)
  const menuRef = useRef<MenuType>(null)
  const musicInfoRef = useRef<LX.Music.MusicInfoLocal>(initSelectInfo as LX.Music.MusicInfoLocal)

  const menus: Menus = [
    { action: 'play', label: t('play') },
    { action: 'playLater', label: t('play_later') },
    { action: 'add', label: t('add_to') },
    { action: 'remove', label: t('local_music_remove_from_list') },
  ]

  useImperativeHandle(ref, () => ({
    show(musicInfo, position) {
      musicInfoRef.current = musicInfo
      if (visible) menuRef.current?.show(position)
      else {
        setVisible(true)
        requestAnimationFrame(() => {
          menuRef.current?.show(position)
        })
      }
    },
  }))

  const handleMenuPress = ({ action }: typeof menus[number]) => {
    const musicInfo = musicInfoRef.current
    switch (action) {
      case 'play':
        props.onPlay(musicInfo)
        break
      case 'playLater':
        props.onPlayLater(musicInfo)
        break
      case 'add':
        props.onAdd(musicInfo)
        break
      case 'remove':
        props.onRemove(musicInfo)
        break
      default:
        break
    }
  }

  return (
    visible
      ? <Menu ref={menuRef} menus={menus} onPress={handleMenuPress} />
      : null
  )
})

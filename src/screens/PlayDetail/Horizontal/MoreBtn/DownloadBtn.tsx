import playerState from '@/store/player/state'
import { addDownload } from '@/core/download'
import { toast } from '@/utils/tools'
import Btn from './Btn'


export default () => {
  const handleDownload = () => {
    const playMusicInfo = playerState.playMusicInfo.musicInfo
    if (!playMusicInfo) return
    const musicInfo = 'progress' in playMusicInfo ? playMusicInfo.metadata.musicInfo : playMusicInfo
    if (musicInfo.source == 'local') {
      toast(global.i18n.t('download_local_not_support'))
      return
    }
    void addDownload(musicInfo as LX.Music.MusicInfoOnline)
  }

  return <Btn icon="download-2" onPress={handleDownload} />
}

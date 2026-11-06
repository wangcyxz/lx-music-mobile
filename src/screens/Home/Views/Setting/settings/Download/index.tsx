import { memo, useMemo } from 'react'
import { View } from 'react-native'

import Section from '../../components/Section'
import CheckBoxItem from '../../components/CheckBoxItem'
import Text from '@/components/common/Text'
import Button from '../../components/Button'
import { createStyle } from '@/utils/tools'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { useSettingValue } from '@/store/setting/hook'
import { useDownloadList } from '@/store/download'
import { setNavActiveId, updateSetting } from '@/core/common'
import { getDownloadDir } from '@/core/download'

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const tasks = useDownloadList()
  const isAutoCache = useSettingValue('download.isAutoCache')
  const isSaveLyric = useSettingValue('download.isSaveLyric')

  const summary = useMemo(() => ({
    total: tasks.length,
    completed: tasks.filter(task => task.status == 'completed').length,
    running: tasks.filter(task => task.status == 'run' || task.status == 'waiting').length,
  }), [tasks])

  const handleShowList = () => {
    setNavActiveId('nav_download')
  }

  return (
    <Section title={t('setting_download')}>
      <View style={styles.autoCache}>
        <CheckBoxItem
          check={isAutoCache}
          onChange={check => { updateSetting({ 'download.isAutoCache': check }) }}
          label={t('download_auto_cache')}
          helpDesc={t('download_auto_cache_tip')}
        />
        <CheckBoxItem
          check={isSaveLyric}
          onChange={check => { updateSetting({ 'download.isSaveLyric': check }) }}
          label={t('download_save_lyric')}
          helpDesc={t('download_save_lyric_tip')}
        />
      </View>

      <View style={styles.footer}>
        <Text size={13} style={styles.summary} numberOfLines={2}>
          {t('download_list_summary', {
            total: summary.total,
            completed: summary.completed,
            running: summary.running,
          })}
        </Text>
        <Button onPress={handleShowList}>{t('download_manage')}</Button>
        <Text size={11} color={theme['c-font-label']} style={styles.dir} numberOfLines={2}>
          {`${t('download_save_path')}: ${getDownloadDir()}`}
        </Text>
      </View>
    </Section>
  )
})

const styles = createStyle({
  autoCache: {
    marginTop: 5,
    gap: 5,
  },
  footer: {
    marginTop: 15,
    paddingLeft: 25,
    paddingRight: 15,
  },
  summary: {
    marginBottom: 8,
  },
  dir: {
    marginTop: 8,
  },
})

import { memo, useCallback, useMemo, useState } from 'react'
import { View } from 'react-native'

import Section from '../../components/Section'
import CheckBoxItem from '../../components/CheckBoxItem'
import Text from '@/components/common/Text'
import Input from '@/components/common/Input'
import Button from '../../components/Button'
import { createStyle } from '@/utils/tools'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { useSettingValue } from '@/store/setting/hook'
import { useLocalSongs, useScanDirs } from '@/store/localMusic'
import { setNavActiveId, updateSetting } from '@/core/common'

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const songs = useLocalSongs()
  const scanDirs = useScanDirs()
  const filterShortAudio = useSettingValue('localMusic.filterShortAudio')
  const minDuration = useSettingValue('localMusic.minDuration')
  const [duration, setDuration] = useState(String(minDuration))

  const handleChangeDuration = useCallback((text: string) => {
    const value = text.replace(/[^\d]/g, '')
    setDuration(value)
    if (!value) return
    const num = Math.min(Math.max(parseInt(value), 1), 600)
    updateSetting({ 'localMusic.minDuration': num })
  }, [])

  const handleBlur = useCallback(() => {
    setDuration(String(minDuration))
  }, [minDuration])

  const summary = useMemo(() => ({
    dirs: scanDirs.length,
    songs: songs.length,
  }), [scanDirs.length, songs.length])

  const handleShowLocalMusic = useCallback(() => {
    setNavActiveId('nav_local')
  }, [])

  const inputStyle = { ...styles.input, backgroundColor: theme['c-primary-input-background'] }

  return (
    <Section title={t('setting_local_music')}>
      <View style={styles.content}>
        <CheckBoxItem
          check={filterShortAudio}
          onChange={check => { updateSetting({ 'localMusic.filterShortAudio': check }) }}
          label={t('local_music_filter_short_audio')}
          helpDesc={t('local_music_filter_short_audio_tip')}
        />

        <View style={styles.durationRow}>
          <Text size={13} style={styles.durationLabel}>{t('local_music_min_duration')}</Text>
          <Input
            value={duration}
            onChangeText={handleChangeDuration}
            onBlur={handleBlur}
            keyboardType="numeric"
            autoCapitalize="none"
            autoCorrect={false}
            style={inputStyle}
          />
          <Text size={12} color={theme['c-font-label']}>{t('local_music_min_duration_unit')}</Text>
        </View>

        <View style={styles.footer}>
          <Text size={13} style={styles.summary}>
            {t('local_music_summary', { dirs: summary.dirs, songs: summary.songs })}
          </Text>
          <Button onPress={handleShowLocalMusic}>{t('local_music_manage')}</Button>
        </View>
      </View>
    </Section>
  )
})

const styles = createStyle({
  content: {
    marginTop: 5,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 25,
    paddingRight: 15,
    marginTop: 5,
    gap: 8,
  },
  durationLabel: {
    flex: 1,
  },
  input: {
    width: 60,
    height: 30,
    borderRadius: 4,
    paddingHorizontal: 8,
    fontSize: 13,
    textAlign: 'center',
  },
  footer: {
    marginTop: 15,
    paddingLeft: 25,
    paddingRight: 15,
  },
  summary: {
    marginBottom: 8,
  },
})

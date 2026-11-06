import { memo } from 'react'
import { View } from 'react-native'

import CheckBoxItem from '../../components/CheckBoxItem'
import { useSettingValue } from '@/store/setting/hook'
import { useI18n } from '@/lang'
import { updateSetting } from '@/core/common'
import { createStyle } from '@/utils/tools'

export default memo(() => {
  const t = useI18n()
  const isAutoCheck = useSettingValue('common.userApiAutoCheckUpdate')
  const isAutoUpdate = useSettingValue('common.userApiAutoUpdate')

  return (
    <View style={styles.content}>
      <CheckBoxItem
        check={isAutoCheck}
        onChange={check => { updateSetting({ 'common.userApiAutoCheckUpdate': check }) }}
        label={t('setting_basic_user_api_auto_check')}
        helpDesc={t('setting_basic_user_api_auto_check_tip')}
      />
      <CheckBoxItem
        check={isAutoUpdate}
        onChange={check => { updateSetting({ 'common.userApiAutoUpdate': check }) }}
        label={t('setting_basic_user_api_auto_update')}
        helpDesc={t('setting_basic_user_api_auto_update_tip')}
      />
    </View>
  )
})

const styles = createStyle({
  content: {
    marginTop: 5,
    gap: 5,
  },
})

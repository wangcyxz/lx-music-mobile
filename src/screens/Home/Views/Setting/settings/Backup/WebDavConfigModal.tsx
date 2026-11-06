import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'

import Dialog, { type DialogType } from '@/components/common/Dialog'
import Input from '@/components/common/Input'
import Text from '@/components/common/Text'
import Button from '@/components/common/Button'
import { createStyle, toast } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { getWebDavConfig, saveWebDavConfig } from '@/utils/data'
import { testWebDavConnection } from '@/core/configBackup'
import { log } from '@/utils/log'


export interface WebDavConfigModalType {
  show: () => void
}

const initConfig: LX.Backup.WebDavConfig = {
  url: '',
  user: '',
  password: '',
  path: 'lx-music-backup',
}

export default forwardRef<WebDavConfigModalType, {}>((props, ref) => {
  const t = useI18n()
  const theme = useTheme()
  const dialogRef = useRef<DialogType>(null)
  const [visible, setVisible] = useState(false)
  const [config, setConfig] = useState<LX.Backup.WebDavConfig>({ ...initConfig })
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleShow = () => {
    dialogRef.current?.setVisible(true)
    setTesting(false)
    setSaving(false)
    void getWebDavConfig().then(saved => {
      setConfig({ ...initConfig, ...saved })
    })
  }

  useImperativeHandle(ref, () => ({
    show() {
      if (visible) handleShow()
      else {
        setVisible(true)
        requestAnimationFrame(() => {
          handleShow()
        })
      }
    },
  }))

  const update = (patch: Partial<LX.Backup.WebDavConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }))
  }

  const handleTest = async() => {
    if (testing) return
    if (!config.url.trim()) {
      toast(t('webdav_config_required'), 'long')
      return
    }
    setTesting(true)
    try {
      await testWebDavConnection({ ...config, url: config.url.trim() })
      toast(t('webdav_test_success'))
    } catch (err: any) {
      log.error(err.message)
      toast(t('webdav_test_failed') + ': ' + (err.message as string), 'long')
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async() => {
    if (saving) return
    setSaving(true)
    try {
      await saveWebDavConfig({ ...config, url: config.url.trim(), path: config.path.trim() || initConfig.path })
      toast(t('webdav_config_saved'))
      dialogRef.current?.setVisible(false)
    } catch (err: any) {
      log.error(err.message)
      toast(t('webdav_config_save_failed') + ': ' + (err.message as string), 'long')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = { ...styles.input, backgroundColor: theme['c-primary-input-background'] }

  return (
    visible
      ? (
          <Dialog ref={dialogRef} bgHide={false} title={t('webdav_config_title')}>
            <View style={styles.content}>
              <ScrollView style={styles.scrollContent} keyboardShouldPersistTaps="handled">
                <Text style={styles.label}>{t('webdav_config_url')}</Text>
                <Input
                  value={config.url}
                  onChangeText={text => { update({ url: text }) }}
                  placeholder="https://dav.example.com/dav/"
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={false}
                  style={inputStyle}
                />
                <Text size={11} color={theme['c-font-label']} style={styles.tip}>{t('webdav_config_url_tip')}</Text>

                <Text style={styles.label}>{t('webdav_config_user')}</Text>
                <Input
                  value={config.user}
                  onChangeText={text => { update({ user: text }) }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={inputStyle}
                />

                <Text style={styles.label}>{t('webdav_config_password')}</Text>
                <Input
                  value={config.password}
                  onChangeText={text => { update({ password: text }) }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={inputStyle}
                />

                <Text style={styles.label}>{t('webdav_config_path')}</Text>
                <Input
                  value={config.path}
                  onChangeText={text => { update({ path: text }) }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={inputStyle}
                />
                <Text size={11} color={theme['c-font-label']} style={styles.tip}>{t('webdav_config_path_tip')}</Text>
              </ScrollView>

              <View style={styles.btns}>
                <Button style={styles.button} onPress={() => { void handleTest() }} disabled={testing}>
                  <Text size={14}>{testing ? t('webdav_testing') : t('webdav_btn_test')}</Text>
                </Button>
                <Button style={styles.button} onPress={() => { void handleSave() }} disabled={saving}>
                  <Text size={14}>{t('dialog_confirm')}</Text>
                </Button>
              </View>
            </View>
          </Dialog>
        )
      : null
  )
})

const styles = createStyle({
  content: {
    flexGrow: 1,
    flexShrink: 1,
    paddingLeft: 15,
    paddingRight: 15,
    paddingBottom: 10,
  },
  scrollContent: {
    flexGrow: 0,
    flexShrink: 1,
  },
  label: {
    marginTop: 10,
    marginBottom: 4,
  },
  tip: {
    marginTop: 2,
    marginBottom: 2,
  },
  input: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 260,
    borderRadius: 4,
  },
  btns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    gap: 10,
  },
  button: {
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 6,
    paddingBottom: 6,
    borderRadius: 4,
  },
})

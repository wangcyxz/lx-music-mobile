import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'

import Dialog, { type DialogType } from '@/components/common/Dialog'
import Text from '@/components/common/Text'
import Button from '@/components/common/Button'
import { confirmDialog, createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { sizeFormate } from '@/utils/common'
import { dateFormat2 } from '@/utils'
import {
  fetchWebDavBackupList,
  handleImportConfigFromWebDav,
  handleRemoveWebDavBackup,
} from '@/core/configBackup'
import { log } from '@/utils/log'


export interface WebDavBackupListType {
  show: () => void
}

export default forwardRef<WebDavBackupListType, {}>((props, ref) => {
  const t = useI18n()
  const theme = useTheme()
  const dialogRef = useRef<DialogType>(null)
  const [visible, setVisible] = useState(false)
  const [list, setList] = useState<LX.Backup.WebDavFileInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const loadList = async() => {
    if (loading) return
    setLoading(true)
    setMessage(t('webdav_list_loading'))
    try {
      const files = await fetchWebDavBackupList()
      setList(files)
      setMessage(files.length ? '' : t('webdav_list_empty'))
    } catch (err: any) {
      log.error(err.message)
      setList([])
      setMessage(t('webdav_list_failed') + ': ' + (err.message as string))
    } finally {
      setLoading(false)
    }
  }

  const handleShow = () => {
    dialogRef.current?.setVisible(true)
    void loadList()
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

  const handleRestore = (file: LX.Backup.WebDavFileInfo) => {
    dialogRef.current?.setVisible(false)
    handleImportConfigFromWebDav(file)
  }

  const handleRemove = (file: LX.Backup.WebDavFileInfo) => {
    void confirmDialog({
      message: t('webdav_delete_confirm', { name: file.name }),
      bgClose: false,
    }).then(confirm => {
      if (!confirm) return
      handleRemoveWebDavBackup(file, () => {
        void loadList()
      })
    })
  }

  return (
    visible
      ? (
          <Dialog ref={dialogRef} bgHide={false} title={t('webdav_list_title')}>
            <View style={styles.content}>
              {
                message
                  ? <Text size={13} color={theme['c-font-label']} style={styles.message}>{message}</Text>
                  : null
              }
              <ScrollView style={styles.scrollContent}>
                {list.map(item => (
                  <View key={item.name} style={{ ...styles.item, borderBottomColor: theme['c-border-background'] }}>
                    <View style={styles.itemInfo}>
                      <Text size={13} numberOfLines={2}>{item.name}</Text>
                      <Text size={11} color={theme['c-font-label']}>
                        {`${item.mtime ? dateFormat2(item.mtime) : '--'} · ${sizeFormate(item.size)}`}
                      </Text>
                    </View>
                    <View style={styles.itemBtns}>
                      <Button style={styles.button} onPress={() => { handleRestore(item) }}>
                        <Text size={13}>{t('webdav_btn_restore')}</Text>
                      </Button>
                      <Button style={styles.button} onPress={() => { handleRemove(item) }}>
                        <Text size={13}>{t('webdav_btn_delete')}</Text>
                      </Button>
                    </View>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.btns}>
                <Button style={styles.button} onPress={() => { void loadList() }} disabled={loading}>
                  <Text size={14}>{t('webdav_btn_refresh')}</Text>
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
    maxHeight: 380,
  },
  message: {
    paddingTop: 5,
    paddingBottom: 5,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
  },
  itemInfo: {
    flexGrow: 1,
    flexShrink: 1,
    paddingRight: 8,
    gap: 2,
  },
  itemBtns: {
    flexDirection: 'row',
    flexGrow: 0,
    flexShrink: 0,
    gap: 6,
  },
  btns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  button: {
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 5,
    paddingBottom: 5,
    borderRadius: 4,
  },
})

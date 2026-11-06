import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'
import { View, TouchableOpacity, FlatList } from 'react-native'

import Dialog, { type DialogType } from '@/components/common/Dialog'
import Text from '@/components/common/Text'
import Button from '@/components/common/Button'
import { Icon } from '@/components/common/Icon'
import ChoosePath, { type ChoosePathType } from '@/components/common/ChoosePath'
import { createStyle, confirmDialog, toast } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { useScanDirs } from '@/store/localMusic'
import { addScanDir, removeScanDir, startScan } from '@/core/localMusic'
import { log } from '@/utils/log'

export interface ScanDirModalType {
  show: () => void
}

const renderSeparator = () => <View style={{ height: 1, backgroundColor: 'rgba(128, 128, 128, 0.15)' }} />

const DirItem = ({ path, onRemove }: { path: string, onRemove: (path: string) => void }) => {
  const theme = useTheme()
  const handleRemove = useCallback(() => { onRemove(path) }, [onRemove, path])
  return (
    <View style={styles.dirItem}>
      <Icon name="add_folder" size={16} color={theme['c-font-label']} />
      <Text size={13} style={styles.dirPath} numberOfLines={2}>{path}</Text>
      <TouchableOpacity style={styles.dirBtn} onPress={handleRemove}>
        <Icon name="close" size={15} color={theme['c-font-label']} />
      </TouchableOpacity>
    </View>
  )
}

export default forwardRef<ScanDirModalType, {}>((props, ref) => {
  const t = useI18n()
  const theme = useTheme()
  const dialogRef = useRef<DialogType>(null)
  const choosePathRef = useRef<ChoosePathType>(null)
  const [visible, setVisible] = useState(false)
  const dirs = useScanDirs()

  useImperativeHandle(ref, () => ({
    show() {
      if (visible) dialogRef.current?.setVisible(true)
      else {
        setVisible(true)
        requestAnimationFrame(() => {
          dialogRef.current?.setVisible(true)
        })
      }
    },
  }))

  const handleAdd = useCallback(() => {
    choosePathRef.current?.show({ title: t('local_music_select_dir'), dirOnly: true })
  }, [t])

  const handleChooseDir = useCallback((path: string) => {
    void addScanDir(path).then(added => {
      if (!added) {
        toast(t('local_music_dir_exists_tip'), 'long')
        return
      }
      toast(t('local_music_dir_added_tip'), 'long')
      // 首次添加目录后直接开始扫描，省一步操作
      if (dirs.length == 0) void startScan()
    }).catch((err: any) => {
      log.error(err?.message as string)
      toast(t('local_music_dir_add_failed'), 'long')
    })
  }, [dirs.length, t])

  const handleRemove = useCallback((path: string) => {
    void confirmDialog({
      message: t('local_music_remove_dir_confirm', { name: path.split('/').filter(Boolean).at(-1) ?? path }),
      confirmButtonText: t('dialog_confirm'),
      cancelButtonText: t('dialog_cancel'),
    }).then(isConfirm => {
      if (!isConfirm) return
      void removeScanDir(path)
    })
  }, [t])

  const renderItem = useCallback(({ item }: { item: string }) => <DirItem path={item} onRemove={handleRemove} />, [handleRemove])

  return (
    visible
      ? (
          <Dialog ref={dialogRef} bgHide={false} title={t('local_music_scan_dir_title')}>
            <View style={styles.content}>
              {
                dirs.length
                  ? <FlatList
                      style={styles.dirList}
                      data={dirs}
                      keyExtractor={item => item}
                      renderItem={renderItem}
                      ItemSeparatorComponent={renderSeparator}
                    />
                  : (
                      <View style={styles.empty}>
                        <Text size={12} color={theme['c-font-label']}>{t('local_music_scan_dir_empty')}</Text>
                      </View>
                    )
              }
              <View style={styles.footer}>
                <Button style={styles.addBtn} onPress={handleAdd}>
                  <Icon name="add_folder" size={15} color={theme['c-primary-font']} />
                  <Text size={13} color={theme['c-primary-font']} style={styles.addBtnText}>{t('local_music_add_dir')}</Text>
                </Button>
              </View>
            </View>
            <ChoosePath ref={choosePathRef} onConfirm={handleChooseDir} />
          </Dialog>
        )
      : null
  )
})

const styles = createStyle({
  content: {
    // maxHeight: 320,
    minHeight: 120,
  },
  dirList: {
    maxHeight: 260,
  },
  dirItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingLeft: 4,
    paddingRight: 2,
    gap: 8,
  },
  dirPath: {
    flex: 1,
  },
  dirBtn: {
    padding: 4,
  },
  empty: {
    paddingVertical: 22,
    alignItems: 'center',
  },
  footer: {
    marginTop: 10,
    alignItems: 'flex-start',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addBtnText: {
    marginLeft: 5,
  },
})

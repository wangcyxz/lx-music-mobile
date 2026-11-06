import { memo, useRef } from 'react'
import { StyleSheet, View } from 'react-native'

// import { gzip, ungzip } from 'pako'

import SubTitle from '../../components/SubTitle'
import Button from '../../components/Button'
import { useI18n } from '@/lang'
import ListImportExport, { type ListImportExportType } from './ListImportExport'
import ConfigImportExport, { type ConfigImportExportType } from './ConfigImportExport'
import WebDavConfigModal, { type WebDavConfigModalType } from './WebDavConfigModal'
import WebDavBackupList, { type WebDavBackupListType } from './WebDavBackupList'
import { handleExportConfigToWebDav } from '@/core/configBackup'


export default memo(() => {
  const t = useI18n()
  const listImportExportRef = useRef<ListImportExportType>(null)
  const configImportExportRef = useRef<ConfigImportExportType>(null)
  const webDavConfigRef = useRef<WebDavConfigModalType>(null)
  const webDavListRef = useRef<WebDavBackupListType>(null)

  return (
    <>
      <SubTitle title={t('setting_backup_local')}>
        <View style={styles.list}>
          <Button onPress={() => configImportExportRef.current?.export()}>{t('backup_local_export')}</Button>
          <Button onPress={() => configImportExportRef.current?.import()}>{t('backup_local_import')}</Button>
        </View>
      </SubTitle>

      <SubTitle title={t('setting_backup_webdav')}>
        <View style={styles.list}>
          <Button onPress={() => { handleExportConfigToWebDav() }}>{t('backup_webdav_export')}</Button>
          <Button onPress={() => webDavListRef.current?.show()}>{t('backup_webdav_import')}</Button>
          <Button onPress={() => webDavConfigRef.current?.show()}>{t('backup_webdav_setting')}</Button>
        </View>
      </SubTitle>

      <SubTitle title={t('setting_backup_part')}>
        <View style={styles.list}>
          <Button onPress={() => listImportExportRef.current?.import()}>{t('setting_backup_part_import_list')}</Button>
          <Button onPress={() => listImportExportRef.current?.export()}>{t('setting_backup_part_export_list')}</Button>
        </View>
      </SubTitle>

      <ListImportExport ref={listImportExportRef} />
      <ConfigImportExport ref={configImportExportRef} />
      <WebDavConfigModal ref={webDavConfigRef} />
      <WebDavBackupList ref={webDavListRef} />
    </>
  )
})

const styles = StyleSheet.create({
  list: {
    flexDirection: 'row',
  },
})

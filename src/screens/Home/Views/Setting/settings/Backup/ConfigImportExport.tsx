import ChoosePath, { type ChoosePathType } from '@/components/common/ChoosePath'
import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { handleExportConfig, handleImportConfig } from '@/core/configBackup'

export interface ConfigImportExportType {
  import: () => void
  export: () => void
}

// 统一为 .json 文本格式，同时兼容旧版 .lxmc（gzip）备份
const BACKUP_FILE_EXT = ['json', 'lxmc']

export default forwardRef<ConfigImportExportType, {}>((props, ref) => {
  const [visible, setVisible] = useState(false)
  const choosePathRef = useRef<ChoosePathType>(null)
  const actionRef = useRef<'import' | 'export'>('export')

  const showChooser = () => {
    const isImport = actionRef.current == 'import'
    const options = {
      title: global.i18n.t(isImport ? 'setting_backup_all_import_desc' : 'setting_backup_all_export_desc'),
      dirOnly: !isImport,
      filter: BACKUP_FILE_EXT,
    }
    if (visible) {
      choosePathRef.current?.show(options)
    } else {
      setVisible(true)
      requestAnimationFrame(() => {
        choosePathRef.current?.show(options)
      })
    }
  }

  useImperativeHandle(ref, () => ({
    import() {
      actionRef.current = 'import'
      showChooser()
    },
    export() {
      actionRef.current = 'export'
      showChooser()
    },
  }))


  const onConfirmPath = (path: string) => {
    switch (actionRef.current) {
      case 'import':
        handleImportConfig(path)
        break
      case 'export':
        handleExportConfig(path)
        break
    }
  }

  return (
    visible
      ? <ChoosePath ref={choosePathRef} onConfirm={onConfirmPath} />
      : null
  )
})

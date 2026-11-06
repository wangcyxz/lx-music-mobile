import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { View, TouchableOpacity, FlatList } from 'react-native'

import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import CheckBox from '@/components/common/CheckBox'
import { BorderWidths } from '@/theme'
import { createStyle, confirmDialog } from '@/utils/tools'
import { sizeFormate } from '@/utils/common'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { useSettingValue } from '@/store/setting/hook'
import { useDownloadList } from '@/store/download'
import { updateSetting } from '@/core/common'
import {
  clearDownload,
  ensureDownloadInit,
  getDownloadDir,
  removeDownload,
  retryDownload,
} from '@/core/download'

type FilterType = 'all' | 'running' | 'completed'

const ProgressBar = memo(({ progress }: { progress: number }) => {
  const theme = useTheme()
  return (
    <View style={{ ...styles.progress, backgroundColor: theme['c-primary-light-300-alpha-800'] }}>
      <View style={{ ...styles.progressBar, width: `${Math.min(Math.max(progress, 0), 1) * 100}%`, backgroundColor: theme['c-primary'] }} />
    </View>
  )
})

// 任务对象在 store 中是被原地修改的，这里不做 memo，保证进度实时刷新
const TaskItem = ({ task }: { task: LX.Download.ListItem }) => {
  const theme = useTheme()
  const t = useI18n()
  const isCompleted = task.status == 'completed'
  const isRunning = task.status == 'run'
  const isWaiting = task.status == 'waiting'
  const isError = task.status == 'error'

  const handleRemove = () => {
    void removeDownload(task.id)
  }
  const handleRetry = () => {
    void retryDownload(task.id)
  }

  const statusText = useMemo(() => {
    if (isCompleted) return `${t('download_status_completed')} · ${sizeFormate(task.downloaded)}${task.isAuto ? ` · ${t('download_auto_cache_tag')}` : ''}`
    if (isError) return `${t('download_status_error')}${task.errorMessage ? ` · ${task.errorMessage}` : ''}`
    const size = task.total > 0 ? `${sizeFormate(task.downloaded)} / ${sizeFormate(task.total)}` : sizeFormate(task.downloaded)
    if (isWaiting) return `${t('download_status_waiting')} · ${size}`
    // 还没拿到数据时 statusText 是「获取地址中…」这类提示
    if (!task.downloaded) return task.statusText || t('download_status_running')
    return `${t('download_status_running')}${task.speed ? ` · ${task.speed}` : ''} · ${size}`
  }, [isCompleted, isError, isWaiting, task, t])

  return (
    <View style={styles.item}>
      <TouchableOpacity style={styles.itemMain} activeOpacity={isError ? 0.5 : 1} onPress={isError ? handleRetry : undefined}>
        <Text size={14} numberOfLines={1}>
          {task.metadata.musicInfo.name}
          <Text size={11} color={theme['c-font-label']}>{`  ${task.metadata.musicInfo.singer}`}</Text>
        </Text>
        <Text size={11} color={isError ? theme['c-primary-font'] : theme['c-font-label']} numberOfLines={1}>
          {statusText}
        </Text>
        {isRunning || isWaiting ? <ProgressBar progress={task.progress} /> : null}
      </TouchableOpacity>
      <View style={styles.itemBtn}>
        {
          isError
            ? (
                <TouchableOpacity style={styles.btn} onPress={handleRetry}>
                  <Icon name="available_updates" size={16} color={theme['c-primary-font']} />
                </TouchableOpacity>
              )
            : null
        }
        <TouchableOpacity style={styles.btn} onPress={handleRemove}>
          <Icon name="close" size={16} color={theme['c-font-label']} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

const FilterTab = ({ id, label, active, onPress }: {
  id: FilterType
  label: string
  active: boolean
  onPress: (id: FilterType) => void
}) => {
  const theme = useTheme()
  const handlePress = useCallback(() => { onPress(id) }, [id, onPress])
  return (
    <TouchableOpacity style={styles.filterTab} onPress={handlePress} activeOpacity={0.6}>
      <Text size={13} color={active ? theme['c-primary-font-active'] : theme['c-font-label']}>{label}</Text>
      <View style={{ ...styles.filterLine, backgroundColor: active ? theme['c-primary'] : 'transparent' }} />
    </TouchableOpacity>
  )
}

export default memo(() => {
  const theme = useTheme()
  const t = useI18n()
  const tasks = useDownloadList()
  const isAutoCache = useSettingValue('download.isAutoCache')
  const [filter, setFilter] = useState<FilterType>('all')

  useEffect(() => {
    void ensureDownloadInit()
  }, [])

  const counts = useMemo(() => ({
    running: tasks.filter(task => task.status == 'run' || task.status == 'waiting').length,
    completed: tasks.filter(task => task.status == 'completed').length,
    finished: tasks.filter(task => task.status == 'completed' || task.status == 'error').length,
  }), [tasks])

  const list = useMemo(() => {
    const filterFn = (task: LX.Download.ListItem) => {
      switch (filter) {
        case 'running': return task.status == 'run' || task.status == 'waiting'
        case 'completed': return task.status == 'completed' || task.status == 'error'
        default: return true
      }
    }
    const weight = (task: LX.Download.ListItem) => {
      switch (task.status) {
        case 'run': return 0
        case 'waiting': return 1
        case 'error': return 2
        default: return 3
      }
    }
    return tasks.filter(filterFn).sort((a, b) => {
      const diff = weight(a) - weight(b)
      if (diff != 0) return diff
      return (b.createdAt ?? 0) - (a.createdAt ?? 0)
    })
  }, [tasks, filter])

  const handleFilterChange = useCallback((id: FilterType) => { setFilter(id) }, [])

  const handleClear = useCallback(() => {
    void confirmDialog({
      message: t('download_clear_tip'),
      confirmButtonText: t('dialog_confirm'),
      cancelButtonText: t('dialog_cancel'),
    }).then(isConfirm => {
      if (!isConfirm) return
      void clearDownload()
    })
  }, [t])

  const handleChangeAutoCache = useCallback((check: boolean) => {
    updateSetting({ 'download.isAutoCache': check })
  }, [])

  const renderItem = useCallback(({ item }: { item: LX.Download.ListItem }) => <TaskItem task={item} />, [])

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.autoCache}>
          <CheckBox
            check={isAutoCache}
            label={t('download_auto_cache')}
            onChange={handleChangeAutoCache}
            size={0.9}
            helpTitle={t('download_auto_cache')}
            helpDesc={t('download_auto_cache_tip')}
          />
        </View>
        <TouchableOpacity style={styles.clearBtn} onPress={handleClear} disabled={!counts.finished}>
          <Icon name="eraser" size={14} color={counts.finished ? theme['c-font-label'] : theme['c-350']} />
          <Text size={12} color={counts.finished ? theme['c-font-label'] : theme['c-350']} style={styles.clearText}>
            {t('download_clear')}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={{ ...styles.filterBar, borderBottomColor: theme['c-border-background'] }}>
        <FilterTab id="all" label={t('download_filter_all')} active={filter == 'all'} onPress={handleFilterChange} />
        <FilterTab id="running" label={`${t('download_filter_running')}${counts.running ? ` (${counts.running})` : ''}`} active={filter == 'running'} onPress={handleFilterChange} />
        <FilterTab id="completed" label={`${t('download_filter_completed')}${counts.completed ? ` (${counts.completed})` : ''}`} active={filter == 'completed'} onPress={handleFilterChange} />
        <View style={styles.filterSpace} />
      </View>
      <FlatList
        style={styles.list}
        contentContainerStyle={list.length ? undefined : styles.listEmptyContainer}
        data={list}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="download-2" size={40} color={theme['c-350']} />
            <Text size={13} color={theme['c-font-label']} style={styles.emptyText}>{t('download_empty')}</Text>
            <Text size={11} color={theme['c-font-label']} style={styles.emptyTip}>{t('download_empty_tip')}</Text>
          </View>
        }
        ListFooterComponent={list.length
          ? (
              <Text size={10} color={theme['c-font-label']} style={styles.dir} numberOfLines={2}>
                {`${t('download_save_path')}: ${getDownloadDir()}`}
              </Text>
            )
          : null}
      />
    </View>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 15,
    paddingRight: 10,
    height: 40,
  },
  autoCache: {
    flex: 1,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  clearText: {
    marginLeft: 4,
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    borderBottomWidth: BorderWidths.normal,
    paddingLeft: 10,
  },
  filterTab: {
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  filterLine: {
    marginTop: 3,
    height: 2,
    width: 20,
    borderRadius: 1,
  },
  filterSpace: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listEmptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 15,
    paddingRight: 8,
    paddingVertical: 9,
    borderBottomWidth: BorderWidths.normal,
    borderBottomColor: 'rgba(128, 128, 128, 0.15)',
  },
  itemMain: {
    flex: 1,
    paddingRight: 8,
    gap: 3,
  },
  itemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btn: {
    padding: 6,
  },
  progress: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 2,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
  },
  empty: {
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 10,
  },
  emptyTip: {
    marginTop: 6,
    paddingHorizontal: 40,
    textAlign: 'center',
  },
  dir: {
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
})

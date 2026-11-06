import { useEffect, useState } from 'react'
import { state } from './state'
import { event } from './event'

export const useDownloadList = () => {
  const [value, update] = useState(state.tasks)

  useEffect(() => {
    event.on('tasks_changed', update)
    return () => {
      event.off('tasks_changed', update)
    }
  }, [])

  return value
}

export const useDownloadCount = () => {
  const tasks = useDownloadList()
  return {
    total: tasks.length,
    running: tasks.filter(task => task.status == 'run').length,
    waiting: tasks.filter(task => task.status == 'waiting').length,
    completed: tasks.filter(task => task.status == 'completed').length,
    error: tasks.filter(task => task.status == 'error').length,
  }
}

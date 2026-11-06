import { state } from './state'
import { event } from './event'


const emitChange = () => {
  event.tasks_changed([...state.tasks])
}

export const setTasks = (tasks: LX.Download.ListItem[]) => {
  state.tasks = tasks
  emitChange()
}

export const addTask = (task: LX.Download.ListItem) => {
  state.tasks.push(task)
  emitChange()
}

export const updateTask = (id: string, patch: Partial<LX.Download.ListItem>) => {
  const target = state.tasks.find(task => task.id == id)
  if (!target) return
  Object.assign(target, patch)
  emitChange()
}

export const removeTask = (id: string) => {
  const index = state.tasks.findIndex(task => task.id == id)
  if (index < 0) return
  state.tasks.splice(index, 1)
  emitChange()
}

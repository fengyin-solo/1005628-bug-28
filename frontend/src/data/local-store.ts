import { SEED_ROWS } from './seed'
import type { EntryRow, MaintenanceReminder } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'district-heating:entries'
// 循环泵保养提醒单独存放，复位示例数据时一并清掉，避免已停用设备的提醒残留。
const REMINDER_KEY = 'district-heating:maintenance-reminders'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// 读取存量记录时，以示例数据的模块顺序与编号顺序为基准回填：
// 浏览器里删掉某条不会让数组错位，重复播种也不会多出重复编号。
function mergeSeed(parsed: Record<string, EntryRow[]>): Record<string, EntryRow[]> {
  const merged: Record<string, EntryRow[]> = {}
  for (const key of Object.keys(SEED_ROWS)) {
    const stored = Array.isArray(parsed[key]) ? parsed[key] : []
    const seen = new Set<number>()
    const rows: EntryRow[] = []
    // 先按示例数据的原顺序回填已有的同编号记录，保留复位前已有的登记内容。
    for (const seed of SEED_ROWS[key]) {
      const hit = stored.find((row) => Number(row.id) === Number(seed.id))
      if (hit) {
        rows.push(hit)
        seen.add(Number(hit.id))
      } else {
        rows.push(clone(seed))
      }
    }
    // 示例数据之外新增的记录，按其原有顺序追加在后。
    for (const row of stored) {
      if (!seen.has(Number(row.id))) {
        rows.push(row)
        seen.add(Number(row.id))
      }
    }
    merged[key] = rows
  }
  return merged
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    // 反复初始化只补齐缺失、按原顺序归位，不追加重复记录。
    return mergeSeed(parsed)
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null
let reminderCache: MaintenanceReminder[] | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

// 复位示例数据：按示例数据的原顺序回填，并清掉该模块挂在本地的保养提醒，
// 已停用的设备复位后不会再冒出残留的「待保养」提醒。
export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  saveReminders([])
  return rows
}

// 全部模块复位：所有记录回到示例数据，保养提醒一并清空。
export function resetAllRows(): Record<string, EntryRow[]> {
  const next = clone(SEED_ROWS)
  cache = next
  reminderCache = []
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    window.localStorage.setItem(REMINDER_KEY, JSON.stringify([]))
  }
  return next
}

export function listReminders(): MaintenanceReminder[] {
  if (reminderCache === null) {
    if (typeof window === 'undefined' || !window.localStorage) {
      reminderCache = []
      return reminderCache
    }
    try {
      const raw = window.localStorage.getItem(REMINDER_KEY)
      reminderCache = raw ? (JSON.parse(raw) as MaintenanceReminder[]) : []
    } catch {
      reminderCache = []
    }
  }
  return reminderCache
}

// 保养提醒整表覆盖写入：调用方负责按当前循环泵记录重建，保证不残留、不重复。
export function saveReminders(reminders: MaintenanceReminder[]): void {
  reminderCache = clone(reminders)
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(REMINDER_KEY, JSON.stringify(reminders))
  }
}

// 本地环境一次性初始化：补齐示例数据、按原顺序归位；反复执行幂等，不产生重复记录。
export function initLocalData(): Record<string, EntryRow[]> {
  const rows = allRows()
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  }
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}

export function reminderStorageKey(): string {
  return REMINDER_KEY
}

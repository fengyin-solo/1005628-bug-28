import { SEED_ROWS } from './seed'
import type { EntryRow, MaintenanceReminder } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'district-heating:entries'
// 保养提醒镜像：和台账同生共死，复位台账时必须一并复位，避免停用设备的提醒残留。
const REMINDER_STORAGE_KEY = 'district-heating:maintenance-reminders'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(key)
  if (!raw) {
    window.localStorage.setItem(key, JSON.stringify(fallback))
    return fallback
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    window.localStorage.setItem(key, JSON.stringify(fallback))
    return fallback
  }
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
    // 示例里新增的模块也要补齐；浏览器里已有的模块改动继续优先。整个对象整体覆盖写回，
    // 反复初始化、多次播种都是幂等的，不会追加出重复记录。
    const merged = { ...fallback, ...parsed }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
    return merged
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null

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

export function resetRows(key: string): EntryRow[] {
  // 复位就是用示例数据整体替换该模块：既回填复位前的既有记录（保持示例原顺序），
  // 也清掉该模块挂着的保养提醒，停用设备不会带着提醒残留下来。重复复位结果一致。
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  resetReminders(key)
  return rows
}

export function nextRowId(key: string): number {
  return listRows(key).reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

// 台账只认业务编号（如泵编号）唯一：重复提交登记时返回既有记录，不会多出重复行。
export function findRowByField(key: string, field: string, value: string): EntryRow | undefined {
  const target = value.trim()
  return listRows(key).find((row) => String(row[field] ?? '').trim() === target)
}

export function appendRow(key: string, row: EntryRow): void {
  saveRows(key, [...listRows(key), row])
}

// ===== 保养提醒（本地镜像，真正口径由 local-service 从台账派生） =====

function reminderFallback(): Record<string, MaintenanceReminder[]> {
  return {}
}

export function listReminders(key: string): MaintenanceReminder[] {
  const all = readJson(REMINDER_STORAGE_KEY, reminderFallback())
  return Array.isArray(all[key]) ? (all[key] as MaintenanceReminder[]) : []
}

export function saveReminders(key: string, reminders: MaintenanceReminder[]): void {
  const all = readJson(REMINDER_STORAGE_KEY, reminderFallback())
  const next = { ...all, [key]: reminders }
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(next))
  }
}

function resetReminders(key: string): void {
  // 复位台账时先清空该模块的提醒镜像；下次读取会按复位后的台账重新派生，保证两处一致。
  saveReminders(key, [])
}

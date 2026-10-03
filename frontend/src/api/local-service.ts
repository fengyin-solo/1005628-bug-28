import { MODULE_BY_KEY } from '@/data/modules'
import {
  allRows,
  appendRow,
  findRowByField,
  listReminders,
  listRows,
  nextRowId,
  resetRows,
  saveReminders,
  saveRows,
} from '@/data/local-store'
import type {
  ActionResult,
  CreateResult,
  EntryRow,
  MaintenanceReminder,
  ModuleMeta,
  OverviewResult,
  PageResult,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  if (key === 'circpump') {
    syncMaintenanceReminders()
  }
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function createEntry(key: string, values: Record<string, string>): CreateResult {
  const meta = moduleMeta(key)
  const required = meta.fields.slice(0, 3)
  const missing = required.filter((field) => !String(values[field] ?? '').trim())
  if (missing.length > 0) {
    return { ok: false, message: `请先填写${missing.join('、')}` }
  }
  const [codeField] = meta.fields
  const duplicate = findRowByField(key, codeField, String(values[codeField]))
  if (duplicate) {
    // 重复提交直接挡回，台账里只保留第一次登记的那一条。
    return {
      ok: false,
      message: `${meta.entity}「${String(values[codeField]).trim()}」已登记，请勿重复提交`,
    }
  }
  const row: EntryRow = {
    id: nextRowId(key),
    status: meta.statuses[0],
    pending: meta.statuses.length > 1,
    abnormal: false,
  }
  for (const field of meta.fields) {
    row[field] = String(values[field] ?? '').trim()
  }
  appendRow(key, row)
  if (key === 'circpump') {
    syncMaintenanceReminders()
  }
  return { ok: true, message: `${meta.entity}「${String(values[codeField]).trim()}」登记成功`, item: row }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  if (key === 'circpump') {
    // 台账复位后按复位后的记录重算提醒：停用设备的待保养提醒不会残留。
    syncMaintenanceReminders()
  }
  return listEntries(key)
}

// 循环泵待保养提醒的唯一口径：只看台账里当前状态为「待保养」的泵。
// 「已停用」等其他状态一律不出提醒，页面和侧边栏都从这里读，不会各算各的。
function deriveMaintenanceReminders(): MaintenanceReminder[] {
  return listRows('circpump')
    .filter((row) => String(row.status) === '待保养')
    .map((row) => ({
      id: Number(row.id),
      泵编号: String(row['泵编号'] ?? ''),
      所属换热站: String(row['所属换热站'] ?? ''),
      保养周期: String(row['保养周期'] ?? ''),
      上次保养日: String(row['上次保养日'] ?? ''),
      status: String(row.status),
    }))
}

function remindersEqual(left: MaintenanceReminder[], right: MaintenanceReminder[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

// 按台账重算并落一份本地镜像；若旧版本残留了停用设备的提醒，这里顺手纠正。
export function syncMaintenanceReminders(): MaintenanceReminder[] {
  const derived = deriveMaintenanceReminders()
  const stored = listReminders('circpump')
  if (!remindersEqual(stored, derived)) {
    saveReminders('circpump', derived)
  }
  return derived
}

// 两处（侧边栏徽标、循环泵页面提醒区）都走这一个读取入口，沿用本地持久化口径。
export function listMaintenanceReminders(): MaintenanceReminder[] {
  const stored = listReminders('circpump')
  const derived = deriveMaintenanceReminders()
  if (!remindersEqual(stored, derived)) {
    // 镜像和台账对不上（例如旧数据残留）时以台账为准并纠正镜像，保证两边永远一致。
    saveReminders('circpump', derived)
    return derived
  }
  return stored
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}

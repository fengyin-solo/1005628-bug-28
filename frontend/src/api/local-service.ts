import { MODULE_BY_KEY } from '@/data/modules'
import {
  allRows,
  initLocalData,
  listReminders,
  listRows,
  resetAllRows,
  resetRows,
  saveReminders,
  saveRows,
} from '@/data/local-store'
import type {
  ActionResult,
  EntryRow,
  MaintenanceReminder,
  ModuleMeta,
  OverviewResult,
  PageResult,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

const CIRCPUMP_KEY = 'circpump'
// 保养提醒的本地口径：循环泵记录处于「待保养」才挂提醒，其余状态（含已停用）一律没有。
const MAINTENANCE_PENDING_STATUS = '待保养'

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
  // 停用设备、完成保养都会改变待保养清单，动作落库后按统一口径重建提醒。
  if (key === CIRCPUMP_KEY) {
    syncMaintenanceReminders()
  }
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

// 按循环泵实时记录重建保养提醒：以记录为准整表覆盖，停用/已保养的设备不会留下残留提醒。
export function syncMaintenanceReminders(): MaintenanceReminder[] {
  const reminders: MaintenanceReminder[] = listRows(CIRCPUMP_KEY)
    .filter((row) => String(row.status) === MAINTENANCE_PENDING_STATUS)
    .map((row) => ({
      pumpId: Number(row.id),
      pumpCode: String(row['泵编号'] ?? ''),
      station: String(row['所属换热站'] ?? ''),
      status: String(row.status),
    }))
  saveReminders(reminders)
  return reminders
}

// 保养提醒的唯一读取口径：列表统计与页面提醒区都从这里取，两边永远对得上。
export function listMaintenanceReminders(): MaintenanceReminder[] {
  // 以循环泵实时记录为准，先核对本地持久化的提醒是否漏挂/残留，不一致就重建。
  const expected = listRows(CIRCPUMP_KEY)
    .filter((row) => String(row.status) === MAINTENANCE_PENDING_STATUS)
    .map((row) => Number(row.id))
  const stored = listReminders()
  const sameIds =
    stored.length === expected.length &&
    stored.every((item) => expected.includes(item.pumpId))
  if (!sameIds) {
    return syncMaintenanceReminders()
  }
  // 仍按当前记录顺序返回，保证提醒顺序与待保养清单一致。
  return expected
    .map((id) => stored.find((item) => item.pumpId === id))
    .filter((item): item is MaintenanceReminder => Boolean(item))
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  if (key === CIRCPUMP_KEY) {
    syncMaintenanceReminders()
  }
  return listEntries(key)
}

// 全部模块复位：记录回到示例数据、保养提醒清空后再按示例口径重建；重复提交结果一致。
export function resetAllModules(): PageResult {
  resetAllRows()
  syncMaintenanceReminders()
  return listEntries(CIRCPUMP_KEY)
}

// 本地环境首次/重复初始化：示例数据幂等播种，再让保养提醒与循环泵记录对齐。
export function initLocalEnvironment(): void {
  initLocalData()
  syncMaintenanceReminders()
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

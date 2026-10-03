<template>
  <section class="page" data-module="circpump">
    <header class="page-head">
      <div>
        <h2>循环泵运维管理</h2>
        <p class="page-desc">维护循环泵，围绕泵编号、所属换热站、泵型号、运行电流做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记循环泵</button>
        <button class="btn" type="button" @click="exportRows">导出循环泵运维清单</button>
        <button class="btn ghost" type="button" :disabled="resetting" @click="resetData">
          {{ resetting ? '复位中…' : '复位示例数据' }}
        </button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <section class="reminder-panel" data-hook="maintenance-reminders">
      <h3 class="reminder-title">保养提醒（待保养清单）</h3>
      <p v-if="!reminders.length" class="reminder-empty">暂无待保养循环泵，已停用设备不会保留保养提醒</p>
      <ul v-else class="reminder-list">
        <li v-for="item in reminders" :key="item.pumpId" class="reminder-item">
          <span class="reminder-code">{{ item.pumpCode }}</span>
          <span class="reminder-station">{{ item.station }}</span>
          <span class="reminder-status">{{ item.status }}</span>
        </li>
      </ul>
    </section>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无循环泵运维数据，可先登记循环泵</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条循环泵运维记录，其中待保养 {{ reminders.length }} 条</span>
      <span v-if="noticeMessage" class="notice-text">{{ noticeMessage }}</span>
      <span v-else-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  listMaintenanceReminders,
  moduleMeta,
  resetModule,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow, MaintenanceReminder } from '@/data/types'

const meta = moduleMeta('circpump')
const columns = ["泵编号", "所属换热站", "泵型号", "运行电流", "扬程", "保养周期", "上次保养日", "运行状态"]
const actions = ["登记运行", "完成保养", "停用设备"]
const statuses = ["待保养", "运行中", "已保养", "已停用"]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const reminders = ref<MaintenanceReminder[]>([])
const errorMessage = ref('')
const noticeMessage = ref('')
const resetting = ref(false)
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
// 统计卡与下方提醒区共用同一处保养提醒口径，不各自计数。
const stats = computed(() => {
  const running = rows.value.filter((row) => String(row.status) === '运行中').length
  const maintained = rows.value.filter((row) => String(row.status) === '已保养').length
  return [
    { label: "运行中循环泵", value: running },
    { label: "待保养循环泵", value: reminders.value.length },
    { label: "本月保养数", value: maintained },
  ]
})
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '循环泵登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

// 复位示例数据：按钮在途禁用，重复点击/重复提交只生效一次，重跑后仍只剩一份示例记录。
function resetData() {
  if (resetting.value) {
    return
  }
  resetting.value = true
  errorMessage.value = ''
  noticeMessage.value = ''
  try {
    resetModule(meta.key)
    filters.value = {}
    reload()
    noticeMessage.value = '示例数据已复位，已停用设备的保养提醒已一并清空'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '示例数据复位失败'
  } finally {
    resetting.value = false
  }
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    reminders.value = listMaintenanceReminders()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '循环泵运维列表读取失败'
  }
}

onMounted(reload)
</script>

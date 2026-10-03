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
        <button class="btn ghost" type="button" @click="resetRowsToSeed">复位示例数据</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <section class="reminder-panel">
      <h3 class="reminder-title">待保养提醒（{{ reminders.length }}）</h3>
      <p v-if="!reminders.length" class="reminder-empty">暂无待保养的循环泵，已停用的设备不会出现在这里</p>
      <ul v-else class="reminder-list">
        <li v-for="item in reminders" :key="item.id">
          <span>{{ item['泵编号'] }}</span>
          <span>{{ item['所属换热站'] }}</span>
          <span class="reminder-muted">保养周期：{{ item['保养周期'] || '—' }}</span>
          <span class="reminder-muted">上次保养：{{ item['上次保养日'] || '—' }}</span>
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
      <span>共 {{ total }} 条循环泵运维记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <div v-if="creating" class="modal-mask" @click.self="closeCreate">
      <form class="modal-card" @submit.prevent="submitCreate">
        <h3 class="modal-title">登记循环泵</h3>
        <label v-for="field in columns" :key="field" class="modal-field">
          <span>{{ field }}<em v-if="requiredFields.includes(field)">*</em></span>
          <input v-model="form[field]" :placeholder="`请输入${field}`" />
        </label>
        <p v-if="createError" class="error-text">{{ createError }}</p>
        <div class="modal-actions">
          <button class="btn primary" type="submit">提交登记</button>
          <button class="btn ghost" type="button" @click="closeCreate">取消</button>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  createEntry,
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
// 登记时必填的字段与 local-service 的校验保持一致：前三个业务字段。
const requiredFields = columns.slice(0, 3)

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const reminders = ref<MaintenanceReminder[]>([])

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

// 统计卡沿用本地口径直接从台账算；待保养数与提醒区、侧边栏徽标同出一源。
const stats = computed(() => [
  { label: "运行中循环泵", value: rows.value.filter((row) => String(row.status) === '运行中').length },
  { label: "待保养循环泵", value: reminders.value.length },
  { label: "本月保养数", value: rows.value.filter((row) => String(row.status) === '已保养').length },
])

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

const creating = ref(false)
const createError = ref('')
const emptyForm = (): Record<string, string> =>
  Object.fromEntries(columns.map((field) => [field, '']))
const form = ref<Record<string, string>>(emptyForm())

function openCreate() {
  form.value = emptyForm()
  createError.value = ''
  creating.value = true
}

function closeCreate() {
  creating.value = false
  createError.value = ''
}

function submitCreate() {
  const result = createEntry(meta.key, form.value)
  if (!result.ok) {
    createError.value = result.message
    return
  }
  closeCreate()
  reload()
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

function resetRowsToSeed() {
  errorMessage.value = ''
  resetModule(meta.key)
  filters.value = {}
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    // 页面提醒区与侧边栏读同一个函数，复位、停用后两处一起更新，不会多出残留。
    reminders.value = listMaintenanceReminders()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '循环泵运维列表读取失败'
  }
}

onMounted(reload)
</script>

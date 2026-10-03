<template>
  <div class="app-shell">
    <aside class="app-side">
      <h1 class="app-title">城市集中供热管网与换热站运行管理平台</h1>
      <nav class="nav-list">
        <RouterLink v-for="item in navItems" :key="item.path" :to="item.path" class="nav-item">
          <span>{{ item.label }}</span>
          <span v-if="item.path === '/circpump' && pendingPumps.length" class="nav-badge">
            {{ pendingPumps.length }}
          </span>
        </RouterLink>
      </nav>
      <section class="side-reminders">
        <h3 class="side-reminders-title">循环泵待保养提醒</h3>
        <p v-if="!pendingPumps.length" class="side-reminders-empty">暂无待保养设备</p>
        <ul v-else class="side-reminders-list">
          <li v-for="item in pendingPumps" :key="item.id">
            <span>{{ item['泵编号'] }}</span>
            <span class="side-reminders-station">{{ item['所属换热站'] }}</span>
          </li>
        </ul>
      </section>
    </aside>
    <main class="app-main">
      <header class="app-head">
        <span class="head-desc">面向一次二次管网台账、换热站运行、水力平衡调节、热计量抄表、抢修处置、停暖通知与热费结算的一体化城市集中供热运行管理工作台。</span>
        <span class="head-user">当前值班：{{ store.operator }} · {{ store.shiftLabel }}</span>
      </header>
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { useSessionStore } from '@/stores/session'
import { listMaintenanceReminders } from '@/api/local-service'
import type { MaintenanceReminder } from '@/data/types'

const store = useSessionStore()
const route = useRoute()

const navItems = [{ label: "运营概览", path: "/" }, { label: "换热站台账", path: "/heatstation" }, { label: "一次管网", path: "/primarynet" }, { label: "二次管网", path: "/secondarynet" }, { label: "站点巡检", path: "/stationpatrol" }, { label: "室温监测", path: "/roomtemp" }, { label: "水力平衡", path: "/hydraulic" }, { label: "热计量抄表", path: "/heatmeter" }, { label: "抢修处置", path: "/emergencyrepair" }, { label: "阀门井维护", path: "/valvewell" }, { label: "循环泵运维", path: "/circpump" }, { label: "补水定压", path: "/makeupwater" }, { label: "换热器清洗", path: "/hxclean" }, { label: "锅炉房运行", path: "/boilerroom" }, { label: "管网探漏", path: "/leakdetect" }, { label: "补偿器检查", path: "/compensator" }, { label: "停暖通知", path: "/heatnotice" }, { label: "热费结算", path: "/heatbilling" }, { label: "入户服务", path: "/householdservice" }]

// 侧边栏的待保养提醒与循环泵页面读同一个本地口径：每次切换路由都重新读一遍，
// 停用设备不会在这里留下残留提醒。
const pendingPumps = ref<MaintenanceReminder[]>([])

function refreshReminders() {
  pendingPumps.value = listMaintenanceReminders()
}

onMounted(refreshReminders)
watch(() => route.fullPath, refreshReminders)
</script>

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { initLocalEnvironment } from './api/local-service'
import './styles/global.css'

// 装齐依赖首次打开时播种示例数据并对齐保养提醒；反复执行不会多出重复记录。
initLocalEnvironment()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

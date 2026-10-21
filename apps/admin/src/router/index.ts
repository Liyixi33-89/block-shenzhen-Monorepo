// 路由表：登录页与后台内容完全分离；守卫拦截未认证访问
import { createRouter, createWebHashHistory } from 'vue-router';
import { isAuthenticated } from '../stores/auth';
import AdminLayout from '../views/AdminLayout.vue';
import LoginView from '../views/LoginView.vue';

export interface RouteMeta {
  title: string;
}

const routes = [
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { title: '登录' },
  },
  {
    path: '/',
    component: AdminLayout,
    redirect: '/scene',
    children: [
      { path: 'scene', name: 'scene', component: () => import('../components/SceneInfoCard.vue'), meta: { title: '场景' } },
      { path: 'landmarks', name: 'landmarks', component: () => import('../components/LandmarkEditor.vue'), meta: { title: '地标' } },
      { path: 'spawns', name: 'spawns', component: () => import('../components/SpawnEditor.vue'), meta: { title: '出生点' } },
      { path: 'teleports', name: 'teleports', component: () => import('../components/TeleportEditor.vue'), meta: { title: '传送点' } },
      { path: 'quests', name: 'quests', component: () => import('../components/QuestEditor.vue'), meta: { title: '任务' } },
      { path: 'districts', name: 'districts', component: () => import('../components/DistrictEditor.vue'), meta: { title: '区划' } },
      { path: 'shop', name: 'shop', component: () => import('../components/ShopEditor.vue'), meta: { title: '商店' } },
      { path: 'npcs', name: 'npcs', component: () => import('../components/NpcEditor.vue'), meta: { title: 'NPC' } },
      { path: 'build', name: 'build', component: () => import('../components/BuildEditor.vue'), meta: { title: '建造' } },
      { path: 'traffic', name: 'traffic', component: () => import('../components/TrafficEditor.vue'), meta: { title: '交通' } },
      { path: 'ascension', name: 'ascension', component: () => import('../components/AscensionEditor.vue'), meta: { title: '飞升' } },
      { path: 'users', name: 'users', component: () => import('../components/UsersPanel.vue'), meta: { title: '用户' } },
      { path: 'analytics', name: 'analytics', component: () => import('../components/AnalyticsPanel.vue'), meta: { title: '分析' } },
      { path: 'versions', name: 'versions', component: () => import('../components/VersionPanel.vue'), meta: { title: '版本' } },
      { path: 'json', name: 'json', component: () => import('../components/JsonEditor.vue'), meta: { title: 'JSON' } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/scene' },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

// 全局守卫：未登录 → /login；已登录访问 /login → /scene
router.beforeEach((to) => {
  if (to.name !== 'login' && !isAuthenticated.value) return { name: 'login' };
  if (to.name === 'login' && isAuthenticated.value) return { path: '/scene' };
  return true;
});

// 标题随路由切换
router.afterEach((to) => {
  document.title = `方块鹏城后台 · ${(to.meta as RouteMeta).title}`;
});

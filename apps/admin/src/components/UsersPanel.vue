<script setup lang="ts">
// 用户管理页签：列表/搜索 + 角色变更 + 封禁/解封（DOM 类名契约：.ana-table/.item-list）
import { ref, inject } from 'vue';
import { ADMIN_CTX } from '../context';
import { adminFetch } from '../services/api';

const { token } = inject(ADMIN_CTX)!;

interface AdminUser {
  id: string;
  username: string;
  role: string;
  banned: boolean;
  createdAt: string;
}

const keyword = ref('');
const users = ref<AdminUser[]>([]);
const total = ref(0);
const loading = ref(false);
const msg = ref('');

async function load() {
  loading.value = true;
  msg.value = '';
  const { ok, data } = await adminFetch(
    `/api/admin/users?keyword=${encodeURIComponent(keyword.value)}&limit=50`,
    { token: token.value },
  );
  loading.value = false;
  if (!ok) {
    msg.value = (data as any)?.error || '加载失败';
    return;
  }
  users.value = data.users ?? [];
  total.value = data.total ?? 0;
}

/** 首次切入页签时自动加载 */
if (token.value) void load();

async function changeRole(u: AdminUser, role: string) {
  const { ok, data } = await adminFetch(`/api/admin/users/${u.id}/role`, {
    method: 'PUT', body: { role }, token: token.value,
  });
  if (!ok) {
    msg.value = (data as any)?.error || '角色变更失败';
    return;
  }
  Object.assign(u, data.user);
  msg.value = `「${u.username}」已设为 ${role}`;
}

async function toggleBan(u: AdminUser) {
  const to = !u.banned;
  if (to && !confirm(`封禁「${u.username}」？封禁后该账号无法登录。`)) return;
  const { ok, data } = await adminFetch(`/api/admin/users/${u.id}/ban`, {
    method: 'PUT', body: { banned: to }, token: token.value,
  });
  if (!ok) {
    msg.value = (data as any)?.error || '操作失败';
    return;
  }
  Object.assign(u, data.user);
  msg.value = to ? `「${u.username}」已封禁` : `「${u.username}」已解封`;
}

function fmtDate(s: string): string {
  return s ? s.slice(0, 19).replace('T', ' ') : '';
}
</script>

<template>
  <section class="card">
    <div class="editor-head">
      <h2>用户（{{ total }}）</h2>
      <div class="ana-controls">
        <input v-model="keyword" placeholder="搜索用户名" @keyup.enter="load" />
        <button class="primary" @click="load">搜索</button>
      </div>
    </div>
    <p v-if="msg" class="ok">{{ msg }}</p>

    <table class="ana-table" v-if="users.length">
      <thead>
        <tr><th>用户名</th><th>角色</th><th>状态</th><th>注册时间</th><th>操作</th></tr>
      </thead>
      <tbody>
        <tr v-for="u in users" :key="u.id" :class="{ 'muted-cell': u.banned }">
          <td><b>{{ u.username }}</b></td>
          <td>{{ u.role }}</td>
          <td>
            <span v-if="u.banned" class="off">已封禁</span>
            <span v-else>正常</span>
          </td>
          <td class="muted-cell">{{ fmtDate(u.createdAt) }}</td>
          <td>
            <select :value="u.role" @change="changeRole(u, ($event.target as any).value)">
              <option value="player">player</option>
              <option value="admin">admin</option>
            </select>
            <button class="danger" @click="toggleBan(u)">{{ u.banned ? '解封' : '封禁' }}</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="!loading" class="tip">没有匹配的用户。</p>
  </section>
</template>

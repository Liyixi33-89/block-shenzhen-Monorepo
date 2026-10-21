<script setup lang="ts">
// 登录页：独立视图，与后台内容完全隔离
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../stores/auth';

const router = useRouter();
const { login } = useAuth();

const username = ref('admin');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function submit() {
  if (!username.value || !password.value) {
    error.value = '请输入用户名和密码';
    return;
  }
  loading.value = true;
  error.value = '';
  const res = await login(username.value, password.value);
  loading.value = false;
  if (!res.ok) {
    error.value = res.error || '登录失败';
    return;
  }
  router.replace('/scene');
}
</script>

<template>
  <div class="login-page">
    <form class="login-card card" @submit.prevent="submit">
      <h1 class="login-title">方块鹏城</h1>
      <p class="login-sub">内容管理后台</p>
      <label>
        用户名
        <input v-model="username" autocomplete="username" />
      </label>
      <label>
        密码
        <input v-model="password" type="password" autocomplete="current-password" />
      </label>
      <p v-if="error" class="bad">{{ error }}</p>
      <button class="primary" type="submit" :disabled="loading">
        {{ loading ? '登录中…' : '登录' }}
      </button>
    </form>
  </div>
</template>

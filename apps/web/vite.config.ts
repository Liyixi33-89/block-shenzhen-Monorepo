import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: {
    // three 独立分包：引擎代码迭代不影响 three chunk 的浏览器缓存
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://127.0.0.1:4001',
    },
  },
});

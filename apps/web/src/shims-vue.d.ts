// Vue SFC 类型声明（tsc 识别 .vue import 所需）
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

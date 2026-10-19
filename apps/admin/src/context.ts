// 注入键：App.vue 壳 provide，页签组件 inject（避免逐层透传 props）
import type { InjectionKey } from 'vue';
import type { Ref } from 'vue';
import type { SceneDoc } from '../composables/useSceneDoc';

export interface AdminCtx {
  doc: SceneDoc;
  token: Ref<string>;
}

export const ADMIN_CTX: InjectionKey<AdminCtx> = Symbol('admin-ctx');

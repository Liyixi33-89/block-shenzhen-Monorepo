// 注入键：AdminLayout provide，页签组件 inject（避免逐层透传 props）
import type { InjectionKey } from 'vue';
import type { SceneDoc } from '../composables/useSceneDoc';

export interface AdminCtx {
  doc: SceneDoc;
}

export const ADMIN_CTX: InjectionKey<AdminCtx> = Symbol('admin-ctx');

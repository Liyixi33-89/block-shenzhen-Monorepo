// 场景文档状态：加载 / 草稿 / 发布 / 脏标记 —— 结构化编辑的唯一数据源
// 【composable 视图层逻辑】App.vue 壳 provide，各页签组件 inject 使用
import { ref, computed } from 'vue';
import type { Ref } from 'vue';
import type { Scene } from '@block-sz/schema';
import { adminFetch } from '../services/api';

export interface SceneDoc {
  scene: Ref<Scene | null>;
  sceneVersion: Ref<string>;
  draftSaved: Ref<string>;
  publishMsg: Ref<string>;
  issues: Ref<string[]>;
  dirty: Ref<boolean>;
  loadScene: (token: string) => Promise<void>;
  saveDraft: (token: string) => Promise<void>;
  publish: (token: string) => Promise<void>;
  /** 任意字段修改 → dirty（模板里统一 @input） */
  touch: () => void;
}

const SCENE_ID = 'shenzhen-main';

export function useSceneDoc(): SceneDoc {
  const scene = ref<Scene | null>(null);
  const sceneVersion = ref('');
  const draftSaved = ref('');
  const publishMsg = ref('');
  const issues = ref<string[]>([]);
  const dirty = ref(false);

  async function loadScene(token: string) {
    const { ok, data } = await adminFetch(`/api/content/scenes/${SCENE_ID}`, { token });
    if (ok) {
      scene.value = data.scene;
      sceneVersion.value = data.version;
    }
  }

  /** 保存草稿（Schema 校验） */
  async function saveDraft(token: string) {
    draftSaved.value = '';
    issues.value = [];
    const { ok, data } = await adminFetch(`/api/content/admin/scenes/${SCENE_ID}`, {
      method: 'PUT',
      body: scene.value,
      token,
    });
    if (!ok) {
      issues.value = (data.issues || []).map((i: any) => `${i.path}: ${i.message}`).concat(data.error || []);
      return;
    }
    draftSaved.value = '草稿已保存 ' + new Date().toLocaleTimeString();
    dirty.value = false;
  }

  /** 发布前自动 bump patch 版本 */
  function bumpPatch() {
    if (!scene.value) return;
    const [a, b, c] = scene.value.version.split('.').map(Number);
    scene.value.version = `${a}.${b}.${c + 1}`;
  }

  async function publish(token: string) {
    publishMsg.value = '';
    bumpPatch();
    await saveDraft(token);
    if (issues.value.length) {
      publishMsg.value = '发布失败：草稿校验未通过';
      return;
    }
    const { ok, data } = await adminFetch(`/api/content/admin/scenes/${SCENE_ID}/publish`, {
      method: 'POST',
      token,
    });
    publishMsg.value = ok ? `发布成功 v${data.published}` : `发布失败: ${data.error}`;
    if (ok) sceneVersion.value = data.published;
  }

  function touch() { dirty.value = true; }

  return { scene, sceneVersion, draftSaved, publishMsg, issues, dirty, loadScene, saveDraft, publish, touch };
}

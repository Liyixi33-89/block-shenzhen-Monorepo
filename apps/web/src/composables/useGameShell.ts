// 游戏会话编排：引擎生命周期 + HUD 轮询 + 事件→toast + 面板快捷键
// 【composable 视图层逻辑】从 App.vue 抽出，视图组件只消费状态
import { ref, nextTick, onBeforeUnmount } from 'vue';
import { GameEngine } from '../engine/engine';
import { checkHealth, fetchScene } from '../services/content';
import type { GameplayEvent } from '../domain/events';
import type { IconName } from '../engine/icons';
import { iconSvg } from '../engine/icons';
import type { Scene } from '@block-sz/schema';

export type ShellMode = 'browser' | 'spawn-select' | 'game';

export function useGameShell() {
  const serverOk = ref<boolean | null>(null);
  const scene = ref<Scene | null>(null);
  const mode = ref<ShellMode>('browser');
  const spawnId = ref('');

  // 加载态
  const loading = ref(false);
  const loadingStep = ref('');
  const loadingPct = ref(0);

  // 引擎与 HUD
  const engine = ref<GameEngine | null>(null);
  const hud = ref({ district: '', landmark: '', money: 0, photoMode: false, version: '' });
  const toasts = ref<Array<{ id: number; text: string; kind: string; icon: IconName }>>([]);
  const quests = ref<any[]>([]);
  const album = ref<Array<{ id: string; name: string }>>([]);
  const questPanel = ref(false);
  const albumPanel = ref(false);
  const keysPanel = ref(false);
  const charPanel = ref(false);
  const mapPanel = ref(false);

  let hudTimer: number | undefined;
  let toastId = 0;
  /** 引用句柄（历史 bug：曾误用不存在的 engRef 导致 Q/P/K 快捷键失效） */
  const engRef = ref<GameEngine | null>(null);

  /** 图标快捷渲染（模板内使用） */
  function ic(name: IconName, size = 16) { return iconSvg(name, size); }

  /** 档案模式初始化：健康检查 + 场景拉取 */
  async function boot() {
    serverOk.value = await checkHealth();
    try {
      const r = await fetchScene('shenzhen-main');
      if (r) scene.value = r.scene;
    } catch {
      serverOk.value = false;
    }
  }

  function pushToast(text: string, kind = 'money', icon: IconName = 'info') {
    const id = ++toastId;
    toasts.value.push({ id, text, kind, icon });
    setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, 2600);
  }

  /** 进度临近提醒去重（每个任务每次会话只提示一次） */
  const nearNotified = new Set<string>();

  function drainEngineEvents(eng: GameEngine) {
    const batch = eng.events.splice(0);           // 取走全部
    eng.analytics?.handleEngineEvents(batch);      // 喂给埋点（白名单内才上报）
    for (const e of batch) {
      if (e.type === 'money') {
        const { n, reason, total } = e.payload;
        if (n > 0) pushToast(`${reason ? reason + ' ' : ''}+¥${n}（余额 ¥${total}）`, 'money', 'money');
      } else if (e.type === 'quest-done') {
        pushToast(`任务完成「${e.payload.title}」 奖励 ¥${e.payload.reward.money}`, 'quest', 'check');
      } else if (e.type === 'quest-unlocked') {
        pushToast(`新任务「${e.payload.title}」已解锁（Q 查看）`, 'quest', 'quest');
      } else if (e.type === 'quest-progress') {
        const { quest, cur, target } = e.payload;
        const ratio = target > 0 ? cur / target : 0;
        // 仅多步任务在完成度 ≥60% 且未提示过时提醒
        if (target > 1 && ratio >= 0.6 && !nearNotified.has(quest.id)) {
          nearNotified.add(quest.id);
          pushToast(`「${quest.title}」即将完成 ${cur}/${target}`, 'quest', 'clock');
        }
      } else if (e.type === 'visit') {
        pushToast(`到访 ${eng.gameplay?.lmName(e.payload)}`, 'visit', 'visit');
      } else if (e.type === 'photo') {
        pushToast(`收录 ${eng.gameplay?.lmName(e.payload)} 图鉴 +10 点`, 'photo', 'photo');
      } else if (e.type === 'info') {
        pushToast(e.payload.msg, 'info', 'info');
      }
    }
  }

  /** 分步加载：setStep(step, pct) 前后包裹耗时操作 */
  async function withStep(step: string, pct: number, fn: () => Promise<void>) {
    loadingStep.value = step;
    loadingPct.value = pct;
    await nextTick();
    await fn();
  }

  /** 进入出生点选择 */
  function enterGame() {
    if (!scene.value) return;
    mode.value = 'spawn-select';
    if (!spawnId.value && scene.value.spawnPoints.length) {
      spawnId.value = scene.value.spawnPoints[0].id;
    }
  }

  /** 启动引擎（分阶段加载 + HUD 轮询）；容器在 mode 切换渲染后才存在，故传 getter */
  async function startGame(getContainer: () => HTMLElement) {
    if (!spawnId.value) return;
    mode.value = 'game';
    loading.value = true;
    loadingPct.value = 0;
    await nextTick();
    try {
      const eng = new GameEngine({
        container: getContainer(),
        sceneId: 'shenzhen-main',
        spawnId: spawnId.value,
      });
      await withStep('连接云存档…', 15, async () => { await eng.loadPhase('session'); });
      await withStep('拉取场景内容…', 35, async () => { await eng.loadPhase('content'); });
      await withStep('构建方块城市…', 70, async () => { await eng.loadPhase('world'); });
      await withStep('装载玩法系统…', 90, async () => { await eng.loadPhase('systems'); });
      loadingStep.value = '进入鹏城';
      loadingPct.value = 100;
      engine.value = eng;
      engRef.value = eng;

      hudTimer = window.setInterval(() => {
        const s = eng.state;
        hud.value = {
          district: s.districtName,
          landmark: s.nearLandmark?.name ?? '',
          money: eng.gameplay?.state.money ?? 0,
          photoMode: s.photoActive,
          version: eng.sceneData?.version ?? '',
        };
        drainEngineEvents(eng);
        quests.value = eng.gameplay?.questView() ?? [];
        album.value = (eng.gameplay?.state.photos ?? []).map(id => ({
          id, name: eng.gameplay?.lmName(id) ?? id,
        }));
      }, 250);

      // 面板快捷键
      window.addEventListener('keydown', onPanelKey);
    } catch (e) {
      console.error(e);
      mode.value = 'browser';
      alert('引擎启动失败：' + (e as Error).message);
    } finally {
      setTimeout(() => { loading.value = false; }, 350);
    }
  }

  function onPanelKey(e: KeyboardEvent) {
    const k = e.key.toLowerCase();
    if (k === 'q') { questPanel.value = !questPanel.value; engRef.value?.analytics?.track('ui_panel', { panel: 'quest', open: questPanel.value }); }
    if (k === 'p') { albumPanel.value = !albumPanel.value; engRef.value?.analytics?.track('ui_panel', { panel: 'album', open: albumPanel.value }); }
    if (k === 'k') { keysPanel.value = !keysPanel.value; engRef.value?.analytics?.track('ui_panel', { panel: 'keys', open: keysPanel.value }); }
    if (k === 'x') { charPanel.value = !charPanel.value; engRef.value?.analytics?.track('ui_panel', { panel: 'char', open: charPanel.value }); }
    if (k === 'm') { mapPanel.value = !mapPanel.value; engRef.value?.analytics?.track('ui_panel', { panel: 'map', open: mapPanel.value }); }
    if (k === 'escape') { questPanel.value = false; albumPanel.value = false; keysPanel.value = false; charPanel.value = false; mapPanel.value = false; }
  }

  function exitGame() {
    clearInterval(hudTimer);
    window.removeEventListener('keydown', onPanelKey);
    engine.value?.dispose();
    engine.value = null;
    engRef.value = null;
    questPanel.value = false;
    albumPanel.value = false;
    keysPanel.value = false;
    charPanel.value = false;
    mapPanel.value = false;
    if (mode.value === 'game') mode.value = 'browser';
  }

  onBeforeUnmount(exitGame);

  return {
    serverOk, scene, mode, spawnId,
    loading, loadingStep, loadingPct,
    engine, engRef, hud, toasts, quests, album,
    questPanel, albumPanel, keysPanel, charPanel, mapPanel,
    ic, boot, enterGame, startGame, exitGame, pushToast,
  };
}

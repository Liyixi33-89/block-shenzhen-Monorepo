// 存储层：SQLite 持久化（node:sqlite 内置，无新依赖）
// 设计：写直达（write-through）——所有变更立即落盘，重启后从 DB 恢复内存索引
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Scene } from '@block-sz/schema';

const DB_PATH = process.env.BSZ_DB || join(process.cwd(), 'data', 'block-sz.sqlite');

/** 稳定哈希分桶（同 playerId 永远同桶，灰度体验一致） */
function hashBucket(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 100;
}

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;  // scrypt: salt$hash
  role: 'player' | 'admin';
  createdAt: string;
}

export interface SaveRecord {
  playerId: string;
  payload: unknown;      // PlayerSave
  updatedAt: string;
}

export interface EventRecord {
  id?: number;
  ts: string;            // ISO 时间
  playerId: string;      // 匿名玩家 id（游客 UUID）
  name: string;          // 事件名：visit / photo / quest_done / build_place / economy_spend ...
  sceneVersion: string;  // 内容版本（对比不同版本表现）
  props: Record<string, string | number | boolean>;  // 事件属性
}

class Store {
  users = new Map<string, UserRecord>();       // id -> user
  usernames = new Map<string, string>();       // username -> userId
  saves = new Map<string, SaveRecord>();       // playerId -> save
  scenes = new Map<string, Scene>();           // sceneId -> published scene
  drafts = new Map<string, Scene>();           // sceneId -> draft
  sceneVersions = new Map<string, Scene[]>();  // sceneId -> published versions

  private db!: DatabaseSync;

  /** 初始化：建表 + 从磁盘恢复 */
  init() {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    this.db = new DatabaseSync(DB_PATH);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS saves (
        player_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS scenes (
        scene_id TEXT NOT NULL, kind TEXT NOT NULL, version TEXT NOT NULL,
        payload TEXT NOT NULL,
        PRIMARY KEY (scene_id, kind, version)
      );
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL, player_id TEXT NOT NULL, name TEXT NOT NULL,
        scene_version TEXT NOT NULL, props TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_name_ts ON events(name, ts);
      CREATE INDEX IF NOT EXISTS idx_events_player ON events(player_id);
      CREATE TABLE IF NOT EXISTS rollout (
        scene_id TEXT PRIMARY KEY,
        pinned_version TEXT NOT NULL DEFAULT '',
        gray_percent INTEGER NOT NULL DEFAULT 100,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS creations (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL, player_name TEXT NOT NULL,
        title TEXT NOT NULL, desc TEXT NOT NULL DEFAULT '',
        placements TEXT NOT NULL,
        likes INTEGER NOT NULL DEFAULT 0,
        likers TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_creations_hot ON creations(likes DESC, created_at DESC);
    `);
    this.loadAll();
    this.loadRollout();
    this.loadCreations();
    console.log(`[store] sqlite ready: ${DB_PATH} (users=${this.users.size} saves=${this.saves.size} scenes=${this.scenes.size})`);
  }

  private loadAll() {
    for (const row of this.db.prepare('SELECT id, username, password_hash, role, created_at FROM users').all() as any[]) {
      const u: UserRecord = { id: row.id, username: row.username, passwordHash: row.password_hash, role: row.role, createdAt: row.created_at };
      this.users.set(u.id, u);
      this.usernames.set(u.username, u.id);
    }
    for (const row of this.db.prepare('SELECT player_id, payload, updated_at FROM saves').all() as any[]) {
      this.saves.set(row.player_id, { playerId: row.player_id, payload: JSON.parse(row.payload), updatedAt: row.updated_at });
    }
    // 场景：kind='draft' 取最新一条；kind='published' 全部入版本列表，最后一条为当前
    for (const row of this.db.prepare('SELECT scene_id, kind, version, payload FROM scenes ORDER BY rowid').all() as any[]) {
      const scene = JSON.parse(row.payload) as Scene;
      if (row.kind === 'draft') {
        this.drafts.set(row.scene_id, scene);
      } else {
        const list = this.sceneVersions.get(row.scene_id) ?? [];
        list.push(scene);
        this.sceneVersions.set(row.scene_id, list);
        this.scenes.set(row.scene_id, scene);
      }
    }
  }

  // ---------- users ----------
  addUser(u: UserRecord) {
    this.users.set(u.id, u);
    this.usernames.set(u.username, u.id);
    this.db.prepare('INSERT OR REPLACE INTO users VALUES (?, ?, ?, ?, ?)')
      .run(u.id, u.username, u.passwordHash, u.role, u.createdAt);
  }

  findUserByName(username: string) {
    const id = this.usernames.get(username);
    return id ? this.users.get(id) : undefined;
  }

  // ---------- saves ----------
  putSave(rec: SaveRecord) {
    this.saves.set(rec.playerId, rec);
    this.db.prepare('INSERT OR REPLACE INTO saves VALUES (?, ?, ?)')
      .run(rec.playerId, JSON.stringify(rec.payload), rec.updatedAt);
  }

  deleteSave(playerId: string) {
    this.saves.delete(playerId);
    this.db.prepare('DELETE FROM saves WHERE player_id = ?').run(playerId);
  }

  // ---------- scenes ----------
  putDraft(sceneId: string, scene: Scene) {
    this.drafts.set(sceneId, scene);
    this.db.prepare("INSERT OR REPLACE INTO scenes VALUES (?, 'draft', ?, ?)")
      .run(sceneId, scene.version, JSON.stringify(scene));
  }

  putPublished(sceneId: string, scene: Scene) {
    const list = this.sceneVersions.get(sceneId) ?? [];
    list.push(scene);
    this.sceneVersions.set(sceneId, list);
    this.scenes.set(sceneId, scene);
    this.db.prepare("INSERT INTO scenes VALUES (?, 'published', ?, ?)")
      .run(sceneId, scene.version, JSON.stringify(scene));
  }

  // ---------- creations（作品广场）----------
  creations = new Map<string, any>();   // id -> record（含 placements/likes/likers）

  addCreation(rec: { id: string; playerId: string; playerName: string; title: string; desc: string; placements: any[] }) {
    const row = {
      ...rec, likes: 0, likers: [] as string[], createdAt: new Date().toISOString(),
    };
    this.creations.set(rec.id, row);
    this.db.prepare('INSERT INTO creations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(rec.id, rec.playerId, rec.playerName.slice(0, 16), rec.title.slice(0, 32), rec.desc.slice(0, 120),
        JSON.stringify(rec.placements), 0, '[]', row.createdAt);
  }

  /** 点赞（同玩家同作品去重） */
  likeCreation(id: string, playerId: string): boolean {
    const c = this.creations.get(id);
    if (!c || c.likers.includes(playerId)) return false;
    c.likers.push(playerId);
    c.likes++;
    this.db.prepare('UPDATE creations SET likes = ?, likers = ? WHERE id = ?')
      .run(c.likes, JSON.stringify(c.likers), id);
    return true;
  }

  /** 列表：最新或最热 */
  listCreations(sort: 'new' | 'hot', limit = 30) {
    const all = [...this.creations.values()].map(c => ({
      id: c.id, title: c.title, desc: c.desc, likes: c.likes,
      author: c.playerName, createdAt: c.createdAt,
      count: (c.placements as any[]).length,
    }));
    return (sort === 'hot' ? all.sort((a, b) => b.likes - a.likes) : all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
      .slice(0, limit);
  }

  getCreation(id: string) { return this.creations.get(id); }

  private loadCreations() {
    for (const row of this.db.prepare(
      'SELECT id, player_id, player_name, title, desc, placements, likes, likers, created_at FROM creations'
    ).all() as any[]) {
      this.creations.set(row.id, {
        id: row.id, playerId: row.player_id, playerName: row.player_name,
        title: row.title, desc: row.desc,
        placements: JSON.parse(row.placements),
        likes: row.likes, likers: JSON.parse(row.likers), createdAt: row.created_at,
      });
    }
  }

  // ---------- rollout（灰度发布配置）----------
  rollout = new Map<string, { pinnedVersion: string; grayPercent: number }>();

  private loadRollout() {
    for (const row of this.db.prepare('SELECT scene_id, pinned_version, gray_percent FROM rollout').all() as any[]) {
      this.rollout.set(row.scene_id, { pinnedVersion: row.pinned_version, grayPercent: row.gray_percent });
    }
  }

  setRollout(sceneId: string, pinnedVersion: string, grayPercent: number) {
    this.rollout.set(sceneId, { pinnedVersion: pinnedVersion, grayPercent: grayPercent });
    this.db.prepare('INSERT OR REPLACE INTO rollout VALUES (?, ?, ?, ?)')
      .run(sceneId, pinnedVersion, grayPercent, new Date().toISOString());
  }

  /**
   * 灰度分桶：给 playerId 决定命中哪个版本
   *  - 未配置灰度：全量最新版
   *  - pinnedVersion=''：灰度最新版（grayPercent 内的玩家），其余走上一版
   *  - pinnedVersion='x.y.z'：回滚锁定，全量 x.y.z
   */
  resolveVersion(sceneId: string, playerId: string): { scene: Scene | undefined; version: string; gray: boolean } {
    const cfg = this.rollout.get(sceneId);
    const versions = this.sceneVersions.get(sceneId) ?? [];
    const latest = versions.at(-1);
    if (!cfg || !latest) return { scene: latest, version: latest?.version ?? '', gray: false };
    if (cfg.pinnedVersion) {
      const pinned = versions.find(v => v.version === cfg.pinnedVersion);
      return { scene: pinned, version: cfg.pinnedVersion, gray: false };
    }
    if (cfg.grayPercent >= 100) return { scene: latest, version: latest.version, gray: false };
    // playerId 稳定哈希 → [0, 100)
    const bucket = hashBucket(playerId);
    if (bucket < cfg.grayPercent) return { scene: latest, version: latest.version, gray: true };
    const prev = versions.at(-2);
    return { scene: prev ?? latest, version: prev?.version ?? latest.version, gray: false };
  }

  // ---------- events（数据埋点）----------
  private evStmt: any;

  /** 批量写入埋点事件（服务端时间戳为准） */
  addEvents(events: Array<Omit<EventRecord, 'ts'>>): number {
    if (!this.evStmt) this.evStmt = this.db.prepare(
      'INSERT INTO events (ts, player_id, name, scene_version, props) VALUES (?, ?, ?, ?, ?)');
    const ts = new Date().toISOString();
    for (const e of events) {
      this.evStmt.run(ts, e.playerId, e.name, e.sceneVersion, JSON.stringify(e.props ?? {}));
    }
    return events.length;
  }

  /** 聚合查询：按事件名统计（时间范围 + 可选属性过滤） */
  queryEvents(opts: { names?: string[]; since?: string; days?: number; groupBy?: string }): Array<{
    name: string; total: number; players: number; today: number; samples: Array<{ ts: string; props: any }>
  }> {
    const days = opts.days ?? 7;
    const since = opts.since ?? new Date(Date.now() - days * 86400_000).toISOString();
    const names = opts.names?.length ? opts.names : null;
    const nameList = names ? [...names] : [...new Set(
      (this.db.prepare('SELECT DISTINCT name FROM events WHERE ts >= ? LIMIT 50').all(since) as any[]).map(r => r.name)
    )];
    const out = [];
    for (const name of nameList) {
      const rows = this.db.prepare(
        'SELECT ts, player_id, props FROM events WHERE name = ? AND ts >= ? ORDER BY ts DESC LIMIT 2000'
      ).all(name, since) as any[];
      if (!rows.length) continue;
      const players = new Set(rows.map(r => r.player_id));
      const todayKey = new Date().toISOString().slice(0, 10);
      const today = rows.filter(r => r.ts.slice(0, 10) === todayKey).length;
      out.push({
        name, total: rows.length, players: players.size, today,
        samples: rows.slice(0, 5).map(r => ({ ts: r.ts, props: JSON.parse(r.props) })),
      });
    }
    return out.sort((a, b) => b.total - a.total);
  }

  /** 漏斗查询：事件序列转化（如 visit→photo→quest_done）*/
  funnel(names: string[], days = 14): Array<{ name: string; players: number; rate: number }> {
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const stepSets: Array<Set<string>> = [];
    for (const name of names) {
      const rows = this.db.prepare(
        'SELECT DISTINCT player_id FROM events WHERE name = ? AND ts >= ?'
      ).all(name, since) as any[];
      stepSets.push(new Set(rows.map(r => r.player_id)));
    }
    return names.map((name, i) => ({
      name,
      players: stepSets[i].size,
      rate: i === 0 ? 1 : (stepSets[0].size ? stepSets[i].size / stepSets[0].size : 0),
    }));
  }
}

export const store = new Store();

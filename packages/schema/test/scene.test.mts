// 内容 Schema 冒烟测试：构造最小合法场景并校验（node --test）
import { test } from 'node:test';
import assert from 'node:assert';
import { validateScene, validatePlayerSave } from '../src/index.ts';

const validScene = {
  id: 'shenzhen-main',
  name: '方块鹏城 · 深圳主场景',
  desc: '深圳城市探索',
  version: '0.1.0',
  projection: { origin: { lat: 22.5431, lng: 114.0579 }, unitPerKm: 200, farCompress: 0.35 },
  districts: [
    { id: 'futian', name: '福田区', slogan: '深圳·特区风采', color: 2080424, center: { lat: 22.5431, lng: 114.0579 }, cityRadius: 620, density: 'cbd', sortOrder: 1 },
    { id: 'dapeng', name: '大鹏新区', color: 450286, center: { lat: 22.598, lng: 114.478 }, cityRadius: 0, density: 'none', sortOrder: 9 },
  ],
  elements: [
    { id: 'test-cube', name: '测试方块', geometry: [{ kind: 'boxC', params: { boxC: { cx: 0, cy: 5, cz: 0, w: 10, h: 10, d: 10 } }, material: 'curtain', color: 10405084 }], category: 'building' },
  ],
  landmarks: [
    {
      id: 'pingan', name: '平安金融中心', district: 'futian',
      latlng: { lat: 22.5373, lng: 114.0556 },
      interactRadius: 40,
      desc: '深圳第一高楼 592.5m',
      builder: 'pingan-tower',
      interacts: [{ x: 0, z: 30, r: 20, label: '拍摄平安金融中心', type: 'view', id: 'photo-pingan' }],
      crowds: [{ x: 10, z: 20, rx: 15, rz: 10, count: 12 }],
      photoable: true,
    },
    {
      id: 'dapeng-fort', name: '大鹏所城', district: 'dapeng',
      latlng: { lat: 22.598, lng: 114.478 },
      desc: '明代海防古城',
      geometry: [{ kind: 'hipRoof', params: { hipRoof: { x: 0, z: 0, w: 20, h: 8, d: 14 } }, material: 'greyBrick', color: 5921370 }],
    },
  ],
  quests: [
    { id: 'photo-pingan', title: '拍摄平安金融中心', desc: '用相机拍下深圳第一高楼', cond: { type: 'photo', target: 'pingan' }, reward: { money: 100 } },
    { id: 'daily-walk', title: '步行1000米', cond: { type: 'walk', meters: 1000 }, reward: { money: 30 }, cycle: 'daily' },
  ],
  npcs: [
    {
      id: 'gangzai', name: '阿刚', landmark: 'pingan',
      dialogue: [
        { id: 'start', text: '来福田打工嘅？', choices: [{ text: '是啊', give: { money: 50 } }, { text: '随便逛逛' }] },
      ],
    },
  ],
  traffic: {
    stations: [
      { id: 'st-chegongmiao', name: '车公庙', latlng: { lat: 22.5371, lng: 114.0269 }, transfers: ['line-1', 'line-7'] },
      { id: 'st-luohu', name: '罗湖', latlng: { lat: 22.5315, lng: 114.1173 }, transfers: ['line-1', 'line-2'] },
    ],
    routes: [
      { id: 'line-1', name: '地铁1号线（罗宝线）', kind: 'metro', color: 0x00b140, stations: ['st-chegongmiao', 'st-luohu'], interval: 0.2, fare: 3 },
    ],
  },
  spawnPoints: [
    { id: 'spawn-pingan', name: '平安金融中心', district: 'futian', blurb: 'CBD天际线', latlng: { lat: 22.5373, lng: 114.0556 } },
    { id: 'spawn-dapeng', name: '大鹏所城', district: 'dapeng', blurb: '明代海防古城', latlng: { lat: 22.598, lng: 114.478 } },
  ],
  teleportPoints: [
    { id: 'tp-lotus', name: '莲花山公园', latlng: { lat: 22.5543, lng: 114.0585 }, unlock: { type: 'visited', landmark: 'lotus' }, cooldownSec: 60, cost: 10 },
  ],
  buildRecipes: [
    { id: 'recipe-lamp', name: '路灯', element: 'test-cube', cost: { money: 20 } },
  ],
  ascension: { stages: [
    { id: 'newcomer', name: '鹏城新客', points: 0, unlocks: [] },
    { id: 'builder', name: '城市建造者', points: 100, unlocks: ['build', 'teleport'], requires: ['newcomer'] },
  ] },
};

test('合法场景通过校验', () => {
  const r = validateScene(validScene);
  assert.ok(r.ok, r.ok ? '' : JSON.stringify(r.errors));
});

test('缺 landmarks 被拒绝', () => {
  const { landmarks, ...rest } = validScene;
  const r = validateScene(rest);
  assert.ok(!r.ok);
});

test('地标缺 district 被拒绝', () => {
  const bad = JSON.parse(JSON.stringify(validScene));
  delete bad.landmarks[0].district;
  const r = validateScene(bad);
  assert.ok(!r.ok);
});

test('semver 版本号非法被拒绝', () => {
  const bad = JSON.parse(JSON.stringify(validScene));
  bad.version = 'v1';
  const r = validateScene(bad);
  assert.ok(!r.ok);
});

test('存档往返校验', () => {
  const r = validatePlayerSave({
    playerId: 'u1', name: '测试玩家', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    pos: { x: 0, y: 0, z: 0 },
    visited: ['pingan'], photos: ['pingan'],
    questProgress: { 'photo-pingan': { done: true, progress: 1, doneAt: '2026-10-14T00:00:00Z' } },
    inventory: { 'lighthouse-model': 2 },
  });
  assert.ok(r.ok, r.ok ? '' : JSON.stringify(r.errors));
  assert.strictEqual(r.data.money, 500);
});

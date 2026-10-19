// 投影算法往返测试（node --test）
import { test } from 'node:test';
import assert from 'node:assert';
import { project, unproject, DEFAULT_PROJECTION, proj } from '../src/projection.ts';

test('原点投影为 (0,0)', () => {
  const { x, z } = proj(DEFAULT_PROJECTION.origin.lat, DEFAULT_PROJECTION.origin.lng);
  assert.ok(Math.abs(x) < 1e-9);
  assert.ok(Math.abs(z) < 1e-9);
});

test('市内近点：福田到罗湖约 4-6km → 800-1200 单位', () => {
  // 罗湖东门 (22.5467, 114.1181)
  const { x, z } = proj(22.5467, 114.1181);
  const r = Math.hypot(x, z);
  assert.ok(r > 700 && r < 1400, `实际 ${r}`);
});

test('市内近点不压缩：distance 单调', () => {
  const a = proj(22.5431, 114.0579);
  const b = proj(22.5543, 114.0585); // 北移约 1.2km
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  assert.ok(d > 180 && d < 280, `1.2km → ${d} units`);
});

test('超距压缩生效：37.9km 点被压到约 8 + 29.9*0.35 ≈ 18.5km 当量', () => {
  const { x, z } = proj(22.8, 114.3); // 东北约 37.9km
  const rKm = Math.hypot(x, z) / 200;
  assert.ok(rKm > 16 && rKm < 21, `压缩后当量 ${rKm}km`);
});

test('往返一致：project → unproject 误差 < 1e-6 度', () => {
  const p = DEFAULT_PROJECTION;
  for (const [lat, lng] of [[22.55, 114.06], [22.62, 114.48], [22.48, 113.85]]) {
    const w = project(p, lat, lng);
    const g = unproject(p, w.x, w.z);
    assert.ok(Math.abs(g.lat - lat) < 1e-6 && Math.abs(g.lng - lng) < 1e-6, `${lat},${lng} 往返偏差过大`);
  }
});

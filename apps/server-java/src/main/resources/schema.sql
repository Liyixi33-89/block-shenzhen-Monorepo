-- Block Shenzhen MySQL schema（幂等；索引内联避免 CREATE INDEX 无 IF NOT EXISTS）
-- 表结构对齐原 SQLite 版 + rollout/creations

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(512) NOT NULL,
  role VARCHAR(16) NOT NULL,            -- 'player' | 'admin'
  created_at VARCHAR(32) NOT NULL,
  banned TINYINT NOT NULL DEFAULT 0     -- 1 = 封禁（禁止登录）
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS saves (
  player_id VARCHAR(64) PRIMARY KEY,
  payload MEDIUMTEXT NOT NULL,          -- PlayerSave JSON
  updated_at VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS scenes (
  scene_id VARCHAR(64) NOT NULL,
  kind VARCHAR(16) NOT NULL,            -- 'draft' | 'published'
  version VARCHAR(64) NOT NULL,
  payload MEDIUMTEXT NOT NULL,
  seq INTEGER,                          -- 保持插入序（版本顺序）
  PRIMARY KEY (scene_id, kind, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  ts VARCHAR(32) NOT NULL,
  player_id VARCHAR(64) NOT NULL,
  name VARCHAR(64) NOT NULL,
  scene_version VARCHAR(64) NOT NULL,
  props MEDIUMTEXT NOT NULL,
  INDEX idx_events_name_ts (name, ts),
  INDEX idx_events_player (player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rollout (
  scene_id VARCHAR(64) PRIMARY KEY,
  pinned_version VARCHAR(64) NOT NULL DEFAULT '',
  gray_percent INTEGER NOT NULL DEFAULT 100,
  updated_at VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS creations (
  id VARCHAR(64) PRIMARY KEY,
  player_id VARCHAR(64) NOT NULL,
  player_name VARCHAR(64) NOT NULL,
  title VARCHAR(128) NOT NULL,
  `desc` VARCHAR(512) NOT NULL DEFAULT '',
  placements MEDIUMTEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  likers MEDIUMTEXT NOT NULL,
  created_at VARCHAR(32) NOT NULL,
  INDEX idx_creations_hot (likes DESC, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- P0 内容审核：UGC 举报（玩家举报 → admin 处理）
CREATE TABLE IF NOT EXISTS reports (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  target_kind VARCHAR(16) NOT NULL,        -- 'creation' | 'player'
  target_id VARCHAR(64) NOT NULL,          -- 被举报对象 id
  reporter_id VARCHAR(64) NOT NULL,        -- 举报人 playerId
  reason VARCHAR(512) NOT NULL,            -- 举报理由
  status VARCHAR(16) NOT NULL DEFAULT 'open', -- 'open' | 'resolved' | 'dismissed'
  created_at VARCHAR(32) NOT NULL,
  INDEX idx_reports_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

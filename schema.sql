-- 견적 및 문의 게시판 (Cloudflare D1)
CREATE TABLE IF NOT EXISTS posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  contact      TEXT    NOT NULL DEFAULT '',
  studio       TEXT    NOT NULL DEFAULT 'bangbae',
  desired_date TEXT    NOT NULL DEFAULT '',
  title        TEXT    NOT NULL,
  content      TEXT    NOT NULL,
  pw_hash      TEXT    NOT NULL,   -- base64 PBKDF2-SHA256
  pw_salt      TEXT    NOT NULL,   -- base64 16 bytes
  pw_iter      INTEGER NOT NULL,
  ip_hash      TEXT    NOT NULL DEFAULT '',
  consent_at   INTEGER NOT NULL,   -- unix ms, 개인정보 수집 동의 시각
  created_at   INTEGER NOT NULL,   -- unix ms
  reply        TEXT,
  replied_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);

-- 스팸·무차별 대입 방지용 이벤트 (kind: 'post' | 'fail')
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT    NOT NULL,
  ip_hash    TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_lookup ON events(kind, ip_hash, created_at);

-- 촬영샘플 (유튜브·Vimeo). 원본 HTML은 저장하지 않고 provider + 영상 ID(+Vimeo 비공개 해시)만 저장
CREATE TABLE IF NOT EXISTS videos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  provider    TEXT    NOT NULL CHECK (provider IN ('youtube', 'vimeo')),
  video_id    TEXT    NOT NULL,
  hash        TEXT    NOT NULL DEFAULT '',   -- Vimeo 일부공개(unlisted) 해시 → h=
  title       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  thumb_url   TEXT    NOT NULL DEFAULT '',   -- Vimeo: 추가 시 oEmbed로 받은 i.vimeocdn.com 썸네일
  pinned_at   INTEGER,                       -- 상단 고정 시각 (NULL = 고정 안 함)
  created_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_unique ON videos(provider, video_id);
CREATE INDEX IF NOT EXISTS idx_videos_order ON videos(pinned_at DESC, id DESC);

-- 지점별 장비 리스트 (studio: 'bangbae' = 방배점, 'yeongeon' = 연건점)
CREATE TABLE IF NOT EXISTS equipment (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  studio      TEXT    NOT NULL CHECK (studio IN ('bangbae', 'yeongeon')),
  category    TEXT    NOT NULL DEFAULT '',
  name        TEXT    NOT NULL,
  model       TEXT    NOT NULL DEFAULT '',
  qty         INTEGER,                      -- NULL = 표시 안 함
  note        TEXT    NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_equipment_studio ON equipment(studio, sort_order, id);

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

-- 온라인 예약 (방배점). 비밀번호는 PBKDF2 해시만 저장. version 은 관리자 동시 수정 충돌 방지용
CREATE TABLE IF NOT EXISTS reservations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  reference         TEXT    NOT NULL UNIQUE,          -- 고객에게 보여주는 예약번호 (예: BB261201-7KQ4P)
  request_id        TEXT    NOT NULL UNIQUE,          -- 브라우저가 만든 UUID, 중복 접수 방지
  studio            TEXT    NOT NULL DEFAULT 'bangbae',
  date              TEXT    NOT NULL,                 -- YYYY-MM-DD (KST)
  start_time        TEXT    NOT NULL,                 -- HH:00
  duration          INTEGER NOT NULL,                 -- 시간
  people            INTEGER NOT NULL,
  shoot_type        TEXT    NOT NULL DEFAULT 'other', -- ppt | board | chromakey | other
  assist            INTEGER NOT NULL DEFAULT 0,       -- 촬영대행 요청 0/1
  name              TEXT    NOT NULL,
  contact           TEXT    NOT NULL,
  notes             TEXT    NOT NULL DEFAULT '',
  pw_hash           TEXT    NOT NULL,
  pw_salt           TEXT    NOT NULL,
  pw_iter           INTEGER NOT NULL,
  ip_hash           TEXT    NOT NULL DEFAULT '',
  consent_at        INTEGER NOT NULL,
  status            TEXT    NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'completed', 'cancelled')),
  admin_note        TEXT    NOT NULL DEFAULT '',
  estimate_subtotal INTEGER NOT NULL DEFAULT 0,
  estimate_vat      INTEGER NOT NULL DEFAULT 0,
  estimate_total    INTEGER NOT NULL DEFAULT 0,
  version           INTEGER NOT NULL DEFAULT 1,
  notified_at       INTEGER,                          -- 관리자 알림 메일 발송 시각
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reservations_day ON reservations(studio, date, status);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status, date, start_time);

-- 단순 카운터 (name='site-visits' = 총 방문자 수, functions/api/visits.js)
CREATE TABLE IF NOT EXISTS counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

// 견적 및 문의 게시판 공용 유틸 (functions/ 에서 import, 정적 배포 대상 아님)
export const PAGE_SIZE = 20;
export const PBKDF2_ITER = 100000; // Workers WebCrypto 상한
export const POST_LIMIT = { count: 5, windowMs: 10 * 60 * 1000 };
export const FAIL_LIMIT = { count: 10, windowMs: 10 * 60 * 1000 };
export const STUDIOS = { bangbae: "방배", yeongeondong: "연건동(준비중)", etc: "기타" };

const enc = new TextEncoder();

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-Robots-Tag": "noindex",
      ...extra,
    },
  });
}
export const err = (message, status = 400) => json({ error: message }, status);

function b64(buf) {
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function unb64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function constantTimeEqual(a, b) {
  const x = a instanceof Uint8Array ? a : new Uint8Array(a);
  const y = b instanceof Uint8Array ? b : new Uint8Array(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

async function pbkdf2(password, salt, iter) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(password, salt, PBKDF2_ITER);
  return { pw_hash: b64(bits), pw_salt: b64(salt), pw_iter: PBKDF2_ITER };
}

export async function verifyPassword(password, row) {
  if (typeof password !== "string" || !password) return false;
  const bits = await pbkdf2(password, unb64(row.pw_salt), row.pw_iter);
  return constantTimeEqual(new Uint8Array(bits), unb64(row.pw_hash));
}

async function sha256(str) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(str)));
}

// 관리자 비밀번호: 양쪽을 SHA-256 으로 같은 길이로 만든 뒤 상수 시간 비교
export async function isAdmin(request, env) {
  const given = request.headers.get("X-Admin-Password") || "";
  const real = env.ADMIN_PASSWORD || "";
  if (!given || !real) return false;
  return constantTimeEqual(await sha256(given), await sha256(real));
}

export async function ipHash(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const h = await sha256("mbm-board:" + (env.ADMIN_PASSWORD || "") + ":" + ip);
  return b64(h).slice(0, 32);
}

export async function tooMany(env, kind, ip, limit) {
  const since = Date.now() - limit.windowMs;
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM events WHERE kind = ? AND ip_hash = ? AND created_at > ?"
  ).bind(kind, ip, since).first();
  return (row?.n || 0) >= limit.count;
}

export async function logEvent(env, kind, ip) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO events (kind, ip_hash, created_at) VALUES (?, ?, ?)").bind(kind, ip, now),
    // 오래된 기록 정리 (1일)
    env.DB.prepare("DELETE FROM events WHERE created_at < ?").bind(now - 86400000),
  ]);
}

export function maskName(name) {
  const chars = Array.from(String(name || "").trim());
  if (chars.length <= 1) return "*";
  if (chars.length === 2) return chars[0] + "*";
  return chars[0] + "*".repeat(chars.length - 2) + chars[chars.length - 1];
}

export async function readJson(request) {
  const ct = request.headers.get("Content-Type") || "";
  if (!ct.includes("application/json")) return null;
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > 32 * 1024) return null;
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

export const clean = (v, max) =>
  typeof v === "string" ? v.replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max) : "";

export function parseId(params) {
  const id = Number(params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function fullPost(row) {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact,
    studio: row.studio,
    studioLabel: STUDIOS[row.studio] || row.studio,
    desired_date: row.desired_date,
    title: row.title,
    content: row.content,
    created_at: row.created_at,
    reply: row.reply || null,
    replied_at: row.replied_at || null,
  };
}

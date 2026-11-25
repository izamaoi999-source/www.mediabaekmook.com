// 온라인 예약 공용 로직 (functions/api/bookings/* 에서 import, 정적 배포 대상 아님)
// 요금은 js/config.js 의 표시 요금과 같아야 합니다. (npm test 가 검증)
import { clean, constantTimeEqual } from "./board.js";

export const BOOKING_STUDIO = Object.freeze({
  id: "bangbae",
  name: "방배점",
  openHour: 9,
  closeHour: 20,
  minHours: 2,
  maxPeople: 2,
  weekdayRate: 40000,
  weekendRate: 46000,
  assistRate: 50000,
});
export const STUDIO_LABELS = { bangbae: "방배점" };
export const SHOOT_TYPES = { ppt: "PPT·화면 설명", board: "칠판·전자칠판", chromakey: "크로마키", other: "기타 촬영" };
export const STATUSES = { requested: "접수 대기", confirmed: "예약 확정", completed: "이용 완료", cancelled: "취소" };
// 고객 화면에서 '예약 있음'으로 막는 상태
export const BLOCKING_STATUSES = ["confirmed", "completed"];
export const ADMIN_PAGE_SIZE = 20;
export const MAX_DAYS_AHEAD = 180;
export const BOOKING_LIMIT = { count: 5, windowMs: 10 * 60 * 1000 };
export const DEFAULT_NOTIFY_EMAILS = ["izamaoi@naver.com", "izamaoi999@gmail.com"];
export const DEFAULT_NOTIFY_FROM = "미디어백묵 예약알림 <noreply@mediabaekmook.com>";

const DAY_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
const TIME_FMT = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function kstToday(now = new Date()) {
  const p = Object.fromEntries(DAY_FMT.formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function kstNowTime(now = new Date()) {
  return TIME_FMT.format(now);
}
export function addDays(day, n) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function isValidDate(day) {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const d = new Date(day + "T12:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === day;
}
export function isWeekend(day) {
  const n = new Date(day + "T12:00:00Z").getUTCDay();
  return n === 0 || n === 6;
}
export function startHour(time) {
  const m = /^([01]\d|2[0-3]):00$/.exec(time || "");
  return m ? Number(m[1]) : null;
}
export function hourLabel(h) {
  return String(h).padStart(2, "0") + ":00";
}
export function overlaps(aStart, aDuration, bStart, bDuration) {
  return aStart < bStart + bDuration && aStart + aDuration > bStart;
}

export function estimate(date, duration, assist, cfg = BOOKING_STUDIO) {
  const rate = isWeekend(date) ? cfg.weekendRate : cfg.weekdayRate;
  const subtotal = rate * duration + (assist ? cfg.assistRate * duration : 0);
  const vat = Math.round(subtotal * 0.1);
  return { rate, subtotal, vat, total: subtotal + vat };
}

export function validContact(contact) {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return true;
  return /^\+?[\d ()-]{7,30}$/.test(contact) && contact.replace(/\D/g, "").length >= 7;
}
export function isEmail(contact) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(contact || ""));
}

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 혼동 문자(0,O,1,I) 제외
export function makeReference(date) {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  let tail = "";
  for (const b of bytes) tail += REF_ALPHABET[b % REF_ALPHABET.length];
  return "BB" + date.slice(2).replace(/-/g, "") + "-" + tail;
}

/**
 * 일정 검증. opts.today / opts.nowTime 으로 과거 시간 검사, opts.force 면 영업시간 검사를 건너뜀.
 * 반환: { error } 또는 { start }
 */
export function checkSchedule({ date, start_time, duration, people }, opts = {}) {
  const cfg = BOOKING_STUDIO;
  if (!isValidDate(date)) return { error: "촬영 날짜 형식이 올바르지 않습니다." };
  const start = startHour(start_time);
  if (start === null) return { error: "시작 시간 형식이 올바르지 않습니다." };
  if (!Number.isInteger(duration) || duration < 1 || start + duration > 24) return { error: "이용 시간이 올바르지 않습니다." };
  if (!Number.isInteger(people) || people < 1 || people > 20) return { error: "방문 인원이 올바르지 않습니다." };
  if (!opts.force) {
    if (duration < cfg.minHours) return { error: `최소 ${cfg.minHours}시간부터 예약할 수 있습니다.` };
    if (start < cfg.openHour || start + duration > cfg.closeHour) return { error: `영업시간(${hourLabel(cfg.openHour)}~${hourLabel(cfg.closeHour)}) 안에서 선택해 주세요.` };
    if (people > cfg.maxPeople) return { error: `방문 인원은 최대 ${cfg.maxPeople}명입니다.` };
  }
  if (opts.today) {
    if (date < opts.today) return { error: "지난 날짜는 예약할 수 없습니다." };
    if (date > addDays(opts.today, MAX_DAYS_AHEAD)) return { error: `오늘부터 ${MAX_DAYS_AHEAD}일 이내 날짜만 예약할 수 있습니다.` };
    if (date === opts.today && opts.nowTime && start_time <= opts.nowTime) return { error: "이미 지난 시간입니다. 다른 시작 시간을 선택해 주세요." };
  }
  return { start };
}

/** 같은 날짜의 확정 예약과 겹치는지 확인. 겹치는 예약 row 또는 null */
export async function findConflict(env, { studio, date, start, duration, excludeId = 0 }) {
  const placeholders = BLOCKING_STATUSES.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT id, reference, name, start_time, duration FROM reservations
     WHERE studio = ? AND date = ? AND id != ? AND status IN (${placeholders})`
  ).bind(studio, date, excludeId, ...BLOCKING_STATUSES).all();
  return results.find((r) => overlaps(start, duration, startHour(r.start_time), r.duration)) || null;
}

/** 고객 화면용 (비밀번호·내부메모·IP 제외) */
export function publicBooking(row) {
  return {
    reference: row.reference,
    name: row.name,
    contact: row.contact,
    studio: row.studio,
    date: row.date,
    start_time: row.start_time,
    duration: row.duration,
    people: row.people,
    shoot_type: row.shoot_type,
    assist: !!row.assist,
    notes: row.notes || "",
    status: row.status,
    estimate: { subtotal: row.estimate_subtotal, vat: row.estimate_vat, total: row.estimate_total },
    created_at: row.created_at,
  };
}
/** 관리자 화면용 */
export function adminBooking(row) {
  return {
    ...publicBooking(row),
    id: row.id,
    admin_note: row.admin_note || "",
    version: row.version,
    updated_at: row.updated_at,
    notified_at: row.notified_at || null,
  };
}

/** 고객 접수 입력 정리 */
export function readRequest(body) {
  return {
    name: clean(body.name, 30),
    contact: clean(body.contact, 100),
    studio: body.studio,
    date: clean(body.date, 10),
    start_time: clean(body.start_time, 5),
    duration: Number(body.duration),
    people: Number(body.people),
    shoot_type: Object.prototype.hasOwnProperty.call(SHOOT_TYPES, body.shoot_type) ? body.shoot_type : "other",
    assist: body.assist === true,
    notes: clean(body.notes, 2000),
    password: typeof body.password === "string" ? body.password : "",
    request_id: typeof body.request_id === "string" && /^[0-9a-f-]{36}$/i.test(body.request_id) ? body.request_id.toLowerCase() : "",
  };
}

export const referenceEquals = (a, b) => {
  const enc = new TextEncoder();
  return constantTimeEqual(enc.encode(String(a)), enc.encode(String(b)));
};

// ───────────── 관리자 알림 메일 (Resend) ─────────────

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const won = (n) => (typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("ko-KR") + "원" : "-");
function weekdayLabel(day) {
  return ["일", "월", "화", "수", "목", "금", "토"][new Date(day + "T12:00:00Z").getUTCDay()];
}
export function timeRange(row) {
  const s = startHour(row.start_time);
  return s === null ? row.start_time : `${hourLabel(s)}~${hourLabel(s + row.duration)} (${row.duration}시간)`;
}

export function notificationRows(row) {
  return [
    ["예약번호", row.reference],
    ["상태", STATUSES[row.status] || row.status],
    ["예약자", row.name],
    ["연락처", row.contact],
    ["지점", STUDIO_LABELS[row.studio] || row.studio],
    ["촬영 날짜", `${row.date} (${weekdayLabel(row.date)})${isWeekend(row.date) ? " · 주말 요금" : ""}`],
    ["촬영 시간", timeRange(row)],
    ["촬영 유형", SHOOT_TYPES[row.shoot_type] || "기타 촬영"],
    ["방문 인원", `${row.people}명`],
    ["촬영대행", row.assist ? "요청함" : "요청하지 않음"],
    ["예상 금액", `${won(row.estimate_total)} (공급가 ${won(row.estimate_subtotal)} + VAT ${won(row.estimate_vat)})`],
    ["요청사항", row.notes || "없음"],
    ["접수 시각", new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(new Date(row.created_at))],
  ];
}

export function buildNotification(row, siteUrl) {
  const adminUrl = `${siteUrl}/booking-admin`;
  const rows = notificationRows(row);
  const subject = `[예약 요청] ${row.date} ${hourLabel(startHour(row.start_time) ?? 0)} ${row.name} 님 (${row.reference})`;
  const text = [
    "새 예약 요청이 접수되었습니다.",
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    `관리자 페이지: ${adminUrl}`,
    "기존 예약표와 대조한 뒤 관리자 페이지에서 확정해 주세요.",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f4;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#1c1917">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e7e5e4">
<p style="margin:0 0 4px;font-size:13px;color:#78716c">스튜디오 미디어백묵 · 온라인 예약</p>
<h1 style="margin:0 0 16px;font-size:20px">새 예약 요청이 접수되었습니다</h1>
<table style="width:100%;border-collapse:collapse;font-size:14px">${rows
    .map(([k, v]) => `<tr><th style="text-align:left;vertical-align:top;padding:8px 12px 8px 0;color:#57534e;font-weight:600;white-space:nowrap;border-top:1px solid #f0efee">${escapeHtml(k)}</th><td style="padding:8px 0;border-top:1px solid #f0efee;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`)
    .join("")}</table>
<p style="margin:20px 0 0"><a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:#1c1917;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">관리자 페이지에서 확인</a></p>
<p style="margin:12px 0 0;font-size:12px;color:#78716c">기존 예약표와 대조한 뒤 관리자 페이지에서 확정해 주세요. 이 메일은 자동 발송되었습니다.</p>
</div></body></html>`;
  return { subject, text, html };
}

export function notifyRecipients(env) {
  const list = String(env.NOTIFY_EMAILS || "").split(",").map((s) => s.trim()).filter(isEmail);
  return list.length ? list : DEFAULT_NOTIFY_EMAILS;
}

/** Resend 로 관리자 알림 발송. 실패해도 예외를 던지지 않고 { ok, error } 반환 */
export async function sendNotification(env, row, siteUrl = "https://mediabaekmook.com") {
  if (!env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY 가 없어 예약 알림 메일을 보내지 않았습니다.", row.reference);
    return { ok: false, error: "RESEND_API_KEY missing" };
  }
  const { subject, text, html } = buildNotification(row, siteUrl);
  const payload = { from: env.NOTIFY_FROM || DEFAULT_NOTIFY_FROM, to: notifyRecipients(env), subject, text, html };
  if (isEmail(row.contact)) payload.reply_to = row.contact;
  try {
    const res = await fetch(env.RESEND_API_URL || "https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `booking-${row.reference}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      console.error("예약 알림 메일 발송 실패", res.status, detail, row.reference);
      return { ok: false, error: `Resend ${res.status}` };
    }
    await env.DB.prepare("UPDATE reservations SET notified_at = ? WHERE id = ?").bind(Date.now(), row.id).run();
    return { ok: true };
  } catch (e) {
    console.error("예약 알림 메일 발송 오류", e, row.reference);
    return { ok: false, error: String(e) };
  }
}

// ───────────── 관리자 ─────────────

/** 관리자 인증 (게시판과 같은 ADMIN_PASSWORD, 실패 횟수 제한). 통과 시 null, 실패 시 Response */
export async function adminGuard(request, env, { err, isAdmin, ipHash, tooMany, logEvent, FAIL_LIMIT }) {
  const ip = await ipHash(request, env);
  if (await tooMany(env, "fail", ip, FAIL_LIMIT)) return err("비밀번호 오류가 너무 많습니다. 10분 후 다시 시도해 주세요.", 429);
  if (!env.ADMIN_PASSWORD) return err("관리자 비밀번호가 설정되지 않았습니다.", 503);
  if (!(await isAdmin(request, env))) {
    await logEvent(env, "fail", ip);
    return err("관리자만 할 수 있습니다.", 403);
  }
  return null;
}

/**
 * 관리자 직권 수정 내용 계산. 반환: { error, status? } 또는 { changes: {col: value}, merged, scheduleChanged }
 * body 에 들어온 필드만 변경합니다.
 */
export function adminChanges(row, body) {
  const changes = {};
  if ("name" in body) { const v = clean(body.name, 30); if (!v) return { error: "예약자 이름을 입력해 주세요." }; changes.name = v; }
  if ("contact" in body) { const v = clean(body.contact, 100); if (!v) return { error: "연락처를 입력해 주세요." }; changes.contact = v; }
  if ("date" in body) changes.date = clean(body.date, 10);
  if ("start_time" in body) changes.start_time = clean(body.start_time, 5);
  if ("duration" in body) changes.duration = Number(body.duration);
  if ("people" in body) changes.people = Number(body.people);
  if ("shoot_type" in body) {
    if (!Object.prototype.hasOwnProperty.call(SHOOT_TYPES, body.shoot_type)) return { error: "촬영 유형이 올바르지 않습니다." };
    changes.shoot_type = body.shoot_type;
  }
  if ("assist" in body) changes.assist = body.assist === true ? 1 : 0;
  if ("notes" in body) changes.notes = clean(body.notes, 2000);
  if ("admin_note" in body) changes.admin_note = clean(body.admin_note, 2000);
  if ("status" in body) {
    if (!Object.prototype.hasOwnProperty.call(STATUSES, body.status)) return { error: "예약 상태가 올바르지 않습니다." };
    changes.status = body.status;
  }
  for (const k of Object.keys(changes)) if (changes[k] === row[k]) delete changes[k];
  const merged = { ...row, ...changes };
  const scheduleChanged = ["date", "start_time", "duration", "people"].some((k) => k in changes);
  if ("date" in changes || "duration" in changes || "assist" in changes) {
    const est = estimate(merged.date, merged.duration, !!merged.assist);
    Object.assign(changes, { estimate_subtotal: est.subtotal, estimate_vat: est.vat, estimate_total: est.total });
    Object.assign(merged, { estimate_subtotal: est.subtotal, estimate_vat: est.vat, estimate_total: est.total });
  }
  return { changes, merged, scheduleChanged };
}

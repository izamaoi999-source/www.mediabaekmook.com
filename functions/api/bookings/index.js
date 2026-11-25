import { json, err, readJson, hashPassword, verifyPassword, ipHash, tooMany, logEvent } from "../../../lib/board.js";
import {
  BOOKING_STUDIO, BOOKING_LIMIT, readRequest, validContact, checkSchedule, findConflict, estimate,
  makeReference, publicBooking, sendNotification, kstToday, kstNowTime,
} from "../../../lib/booking.js";

// POST /api/bookings → 고객 예약 요청 접수 + 관리자 알림 메일
export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await readJson(request);
  if (!body) return err("요청 형식이 올바르지 않습니다.");
  const input = readRequest(body);

  // 허니팟: 저장하지 않고 성공처럼 응답
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return json({ booking: { ...input, password: undefined, reference: "BB000000-00000", status: "requested", estimate: {} } }, 201);
  }

  if (input.studio !== BOOKING_STUDIO.id) return err("예약할 수 없는 지점입니다.");
  if (!input.name) return err("예약자 이름을 입력해 주세요.");
  if (!validContact(input.contact)) return err("연락받을 전화번호 또는 이메일을 입력해 주세요.");
  if (input.password.length < 4 || input.password.length > 64) return err("비밀번호는 4자 이상 64자 이하로 입력해 주세요.");
  if (body.consent !== true) return err("개인정보 수집·이용에 동의해 주세요.");
  if (!input.request_id) return err("요청 정보가 올바르지 않습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.");

  // 같은 요청 재전송(네트워크 오류 후 재시도) → 기존 접수 결과 반환
  const existing = await env.DB.prepare("SELECT * FROM reservations WHERE request_id = ?").bind(input.request_id).first();
  if (existing) {
    if (await verifyPassword(input.password, existing)) return json({ booking: publicBooking(existing), duplicate: true }, 200);
    return err("이미 처리된 요청입니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.", 409);
  }

  const now = new Date();
  const checked = checkSchedule(input, { today: kstToday(now), nowTime: kstNowTime(now) });
  if (checked.error) return err(checked.error);

  const ip = await ipHash(request, env);
  if (await tooMany(env, "booking", ip, BOOKING_LIMIT)) return err("짧은 시간에 예약 요청이 너무 많습니다. 10분 후 다시 시도하거나 전화로 문의해 주세요.", 429);

  const conflict = await findConflict(env, { studio: input.studio, date: input.date, start: checked.start, duration: input.duration });
  if (conflict) return err("선택한 시간에 이미 확정된 예약이 있습니다. 다른 시간을 선택해 주세요.", 409);

  const pw = await hashPassword(input.password);
  const est = estimate(input.date, input.duration, input.assist);
  const ts = now.getTime();
  let row = null;
  for (let attempt = 0; attempt < 4 && !row; attempt++) {
    const reference = makeReference(input.date);
    try {
      row = await env.DB.prepare(
        `INSERT INTO reservations (reference, request_id, studio, date, start_time, duration, people, shoot_type, assist, name, contact, notes,
           pw_hash, pw_salt, pw_iter, ip_hash, consent_at, status, estimate_subtotal, estimate_vat, estimate_total, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?, ?, 1, ?, ?) RETURNING *`
      ).bind(
        reference, input.request_id, input.studio, input.date, input.start_time, input.duration, input.people, input.shoot_type,
        input.assist ? 1 : 0, input.name, input.contact, input.notes, pw.pw_hash, pw.pw_salt, pw.pw_iter, ip, ts,
        est.subtotal, est.vat, est.total, ts, ts
      ).first();
    } catch (e) {
      const msg = String(e && e.message);
      if (msg.includes("request_id")) {
        // 동시에 같은 요청이 들어온 경우
        const again = await env.DB.prepare("SELECT * FROM reservations WHERE request_id = ?").bind(input.request_id).first();
        if (again) return json({ booking: publicBooking(again), duplicate: true }, 200);
      }
      if (!msg.includes("UNIQUE")) throw e; // 예약번호 충돌이면 다시 시도
    }
  }
  if (!row) return err("예약번호를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.", 500);
  await logEvent(env, "booking", ip);

  // 관리자 알림 메일은 응답을 늦추지 않도록 백그라운드에서 발송
  const mail = sendNotification(env, row, new URL(request.url).origin);
  if (typeof context.waitUntil === "function") context.waitUntil(mail);
  else await mail;

  return json({ booking: publicBooking(row) }, 201);
}

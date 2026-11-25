import { json, err, readJson, verifyPassword, ipHash, tooMany, logEvent, FAIL_LIMIT } from "../../../lib/board.js";
import { publicBooking } from "../../../lib/booking.js";

// POST /api/bookings/lookup {reference, password} → 고객 예약 조회
export async function onRequestPost({ request, env }) {
  const ip = await ipHash(request, env);
  if (await tooMany(env, "fail", ip, FAIL_LIMIT)) return err("조회 실패가 너무 많습니다. 10분 후 다시 시도해 주세요.", 429);
  const body = await readJson(request);
  if (!body) return err("요청 형식이 올바르지 않습니다.");
  const reference = typeof body.reference === "string" ? body.reference.trim().toUpperCase().slice(0, 80) : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!reference || !password) return err("예약번호와 비밀번호를 입력해 주세요.");
  const row = await env.DB.prepare("SELECT * FROM reservations WHERE reference = ?").bind(reference).first();
  if (!row || !(await verifyPassword(password, row))) {
    await logEvent(env, "fail", ip);
    return err("예약번호 또는 비밀번호가 올바르지 않습니다.", 403);
  }
  return json({ booking: publicBooking(row) });
}

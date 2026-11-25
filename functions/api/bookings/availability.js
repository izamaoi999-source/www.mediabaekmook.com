import { json, err } from "../../../lib/board.js";
import { BOOKING_STUDIO, BLOCKING_STATUSES, isValidDate } from "../../../lib/booking.js";

// GET /api/bookings/availability?studio=bangbae&date=YYYY-MM-DD → 확정된 시간대 (개인정보 제외)
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const studio = url.searchParams.get("studio");
  const date = url.searchParams.get("date") || "";
  if (studio !== BOOKING_STUDIO.id) return err("예약할 수 없는 지점입니다.", 404);
  if (!isValidDate(date)) return err("날짜 형식이 올바르지 않습니다.");
  const placeholders = BLOCKING_STATUSES.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT start_time, duration FROM reservations WHERE studio = ? AND date = ? AND status IN (${placeholders}) ORDER BY start_time`
  ).bind(studio, date, ...BLOCKING_STATUSES).all();
  return json({ date, busy: results.map((r) => ({ start_time: r.start_time, duration: r.duration })) });
}

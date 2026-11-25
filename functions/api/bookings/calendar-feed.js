import { json } from "../../../lib/board.js";
import { calendarFeed } from "../../../lib/calendar.js";

// GET /api/bookings/calendar-feed → 확정·이용완료 예약 목록 (구글 캘린더 자동 반영용, 개인정보 제외·이름 가림)
export async function onRequestGet({ env }) {
  return json(await calendarFeed(env));
}

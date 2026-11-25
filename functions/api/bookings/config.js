import { json } from "../../../lib/board.js";
import { BOOKING_STUDIO, MAX_DAYS_AHEAD } from "../../../lib/booking.js";

// GET /api/bookings/config → 예약 화면 설정 (영업시간·요금)
export async function onRequestGet() {
  const { name, ...studio } = BOOKING_STUDIO;
  return json({ studio: { ...studio, name }, maxDaysAhead: MAX_DAYS_AHEAD });
}

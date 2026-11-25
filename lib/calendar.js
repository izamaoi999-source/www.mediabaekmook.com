// 확정 예약 → 구글 캘린더(감평사스튜디오공유캘린더) 자동 반영용 피드
// 캘린더 주인 계정의 Google Apps Script(google-apps-script/calendar-sync.gs)가 10분마다 이 피드를 읽어
// 일정을 만들고·고치고·지웁니다. 공개 주소이므로 연락처·요청사항 같은 개인정보는 넣지 않고 이름은 가립니다.
import { BLOCKING_STATUSES, kstToday, addDays } from "./booking.js";

/** 피드에 실을 기간: 어제부터 (지난 일정은 캘린더에 그대로 둡니다) */
export const FEED_PAST_DAYS = 1;

/** 이름 가리기: 홍길동 → 홍*동, 김철 → 김*, 한 글자는 그대로 */
export function maskName(name) {
  const chars = Array.from(String(name || "").trim());
  if (chars.length <= 1) return chars.join("") || "고객";
  if (chars.length === 2) return chars[0] + "*";
  return chars[0] + "*".repeat(chars.length - 2) + chars[chars.length - 1];
}

/** DB 행 → 피드 항목 */
export function feedItem(row) {
  return {
    reference: row.reference,
    date: row.date,
    start_time: row.start_time,
    duration: row.duration,
    status: row.status,
    name: maskName(row.name),
  };
}

/** 확정·이용완료 예약 피드 (어제 이후) */
export async function calendarFeed(env, now = new Date()) {
  const from = addDays(kstToday(now), -FEED_PAST_DAYS);
  const placeholders = BLOCKING_STATUSES.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT reference, date, start_time, duration, status, name FROM reservations
     WHERE date >= ? AND status IN (${placeholders}) ORDER BY date, start_time`
  ).bind(from, ...BLOCKING_STATUSES).all();
  return { from, bookings: results.map(feedItem) };
}

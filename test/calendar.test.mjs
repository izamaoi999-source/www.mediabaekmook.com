import { test } from "node:test";
import assert from "node:assert/strict";
import { maskName, feedItem, calendarFeed } from "../lib/calendar.js";

test("이름 가리기", () => {
  assert.equal(maskName("홍길동"), "홍*동");
  assert.equal(maskName("남궁민수"), "남**수");
  assert.equal(maskName("김철"), "김*");
  assert.equal(maskName("이"), "이");
  assert.equal(maskName("  "), "고객");
  assert.equal(maskName("John Smith"), "J********h");
});

test("피드 항목에는 연락처·요청사항이 없다", () => {
  const item = feedItem({
    reference: "BB261210-ABCDE", date: "2026-12-10", start_time: "10:00", duration: 2, status: "confirmed",
    name: "홍길동", contact: "010-1234-5678", notes: "비밀 메모", admin_note: "x", pw_hash: "h",
  });
  assert.deepEqual(item, { reference: "BB261210-ABCDE", date: "2026-12-10", start_time: "10:00", duration: 2, status: "confirmed", name: "홍*동" });
});

test("피드는 어제(KST) 이후 확정·이용완료 예약만 조회", async () => {
  let sql = "", args = [];
  const env = { DB: { prepare(q) { sql = q; return { bind(...a) { args = a; return { all: async () => ({ results: [{ reference: "R1", date: "2026-12-01", start_time: "09:00", duration: 2, status: "confirmed", name: "김희은" }] }) }; } }; } } };
  const feed = await calendarFeed(env, new Date("2026-12-01T15:30:00Z")); // KST 12/2 00:30
  assert.equal(feed.from, "2026-12-01");
  assert.deepEqual(args, ["2026-12-01", "confirmed", "completed"]);
  assert.match(sql, /status IN \(\?,\?\)/);
  assert.equal(feed.bookings[0].name, "김*은");
});

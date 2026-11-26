import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  BOOKING_STUDIO, estimate, checkSchedule, overlaps, makeReference, buildNotification, notifyRecipients,
  adminChanges, DEFAULT_NOTIFY_EMAILS, kstToday, addDays,
} from "../lib/booking.js";

function siteConfig() {
  const ctx = { window: {} };
  vm.runInNewContext(readFileSync(new URL("../js/config.js", import.meta.url), "utf8"), ctx);
  return ctx.window.SITE;
}

test("표시 요금(js/config.js)과 예약 서버 요금이 같다", () => {
  const site = siteConfig();
  const b = site.studios.bangbae;
  assert.equal(b.pricePerHour, BOOKING_STUDIO.weekdayRate);
  assert.equal(b.pricePerHourWeekend, BOOKING_STUDIO.weekendRate);
  assert.equal(b.minHours, BOOKING_STUDIO.minHours);
  assert.equal(b.maxPeople, BOOKING_STUDIO.maxPeople);
  assert.equal(site.addons.producerAssist.pricePerHour, BOOKING_STUDIO.assistRate);
});

test("견적: 평일/주말/촬영대행 + VAT", () => {
  assert.deepEqual(estimate("2026-12-02", 2, false), { rate: 40000, subtotal: 80000, vat: 8000, total: 88000 }); // 수
  assert.deepEqual(estimate("2026-12-05", 3, true), { rate: 46000, subtotal: 288000, vat: 28800, total: 316800 }); // 토
});

test("일정 검증", () => {
  const base = { date: "2026-12-02", start_time: "10:00", duration: 2, people: 1 };
  assert.ok(!checkSchedule(base).error);
  assert.match(checkSchedule({ ...base, duration: 1 }).error, /최소/);
  assert.match(checkSchedule({ ...base, start_time: "22:00" }).error, /영업시간/);
  assert.match(checkSchedule({ ...base, people: 3 }).error, /최대/);
  assert.ok(!checkSchedule({ ...base, start_time: "19:00", duration: 1, people: 3 }, { force: true }).error, "관리자 force");
  assert.match(checkSchedule({ ...base, date: "2026-02-30" }).error, /날짜/);
  assert.match(checkSchedule(base, { today: "2026-12-03" }).error, /지난 날짜/);
  assert.match(checkSchedule(base, { today: "2026-12-02", nowTime: "10:30" }).error, /지난 시간/);
  assert.match(checkSchedule(base, { today: addDays("2026-12-02", -181) }).error, /180일/);
});

test("시간 겹침", () => {
  assert.equal(overlaps(10, 2, 12, 2), false);
  assert.equal(overlaps(10, 3, 12, 2), true);
  assert.equal(overlaps(13, 1, 12, 2), true);
});

test("예약번호 형식", () => {
  assert.match(makeReference("2026-12-02"), /^BB261202-[A-HJ-NP-Z2-9]{5}$/);
});

test("KST 날짜", () => {
  assert.equal(kstToday(new Date("2026-11-30T15:30:00Z")), "2026-12-01");
});

test("관리자 알림 메일: 받는 사람 기본값과 내용", () => {
  assert.deepEqual(notifyRecipients({}), DEFAULT_NOTIFY_EMAILS);
  assert.deepEqual(DEFAULT_NOTIFY_EMAILS, ["izamaoi@naver.com", "izamaoi999@gmail.com"]);
  assert.deepEqual(notifyRecipients({ NOTIFY_EMAILS: "a@b.co, bad" }), ["a@b.co"]);
  const row = {
    reference: "BB261202-ABCDE", status: "requested", name: "<홍길동>", contact: "010-1234-5678", studio: "bangbae",
    date: "2026-12-02", start_time: "10:00", duration: 2, shoot_type: "board", people: 1, assist: 1, notes: "칠판 사용",
    estimate_subtotal: 180000, estimate_vat: 18000, estimate_total: 198000, created_at: Date.UTC(2026, 10, 25, 3),
  };
  const mail = buildNotification(row, "https://mediabaekmook.com");
  assert.match(mail.subject, /2026-12-02 10:00 <홍길동> 님 \(BB261202-ABCDE\)/);
  for (const s of ["010-1234-5678", "10:00~12:00 (2시간)", "칠판·전자칠판", "요청함", "198,000원", "칠판 사용", "https://mediabaekmook.com/booking-admin"]) {
    assert.ok(mail.text.includes(s), s);
  }
  assert.ok(mail.html.includes("&lt;홍길동&gt;") && !mail.html.includes("<홍길동>"), "HTML 이스케이프");
});

test("관리자 직권 수정: 변경분만, 견적 재계산", () => {
  const row = { name: "A", contact: "010", date: "2026-12-02", start_time: "10:00", duration: 2, people: 1, shoot_type: "ppt", assist: 0, notes: "", status: "requested", admin_note: "", studio: "bangbae" };
  const r = adminChanges(row, { name: "A", date: "2026-12-05", duration: 3, status: "confirmed" });
  assert.deepEqual(Object.keys(r.changes).sort(), ["date", "duration", "estimate_subtotal", "estimate_total", "estimate_vat", "status"]);
  assert.equal(r.changes.estimate_total, 151800);
  assert.equal(r.scheduleChanged, true);
  assert.match(adminChanges(row, { status: "nope" }).error, /상태/);
  assert.match(adminChanges(row, { name: " " }).error, /이름/);
});

/**
 * 미디어백묵 예약 ↔ 구글 캘린더 (Google Apps Script)
 *
 * 솔비원 계정에서 실행합니다. 스튜디오 캘린더는 izamaoi999 계정의 "방배 스튜디오 예약현황"이며,
 * 솔비원 계정에 '변경' 권한으로 공유돼 있습니다(STUDIO_CALENDAR_ID). 10분마다 두 가지를 합니다.
 *
 * 1) 사이트 확정 예약 → 방배 스튜디오 예약현황
 *    사이트의 확정 예약 피드(/api/bookings/calendar-feed)를 읽어
 *    새로 확정된 예약은 일정을 만들고, 날짜·시간이 바뀌면 고치고, 취소·대기·삭제(오늘 이후)면 지웁니다.
 *    예약번호 ↔ 일정 ID 는 스크립트 속성(ev:, sig:)에 저장하고, 이 스크립트가 만든 일정만 건드립니다.
 *
 * 2) 방배 스튜디오 예약현황 → 공개용 캘린더(사이트 표시용)
 *    방배 스튜디오 예약현황의 모든 일정을 공개용 캘린더 "미디어백묵 예약 현황(공개용)"에 복사합니다.
 *    제목은 앞 2글자만 남기고 나머지 글자를 * 로 가리며(공백 유지), 장소·설명은 복사하지 않습니다.
 *    공개용 캘린더는 이 스크립트만 관리합니다. 직접 일정을 넣어도 다음 실행 때 지워집니다.
 *
 * 설치: 이 코드를 붙여넣고 저장한 뒤 installTrigger 를 한 번 실행하고 권한을 허용합니다.
 */

var FEED_URL = 'https://mediabaekmook.com/api/bookings/calendar-feed';
var ADMIN_URL = 'https://mediabaekmook.com/booking-admin';
var STUDIO_CALENDAR_ID = 'f7ab92ffc2a3f1401d1e7751ffc5dae980da665964cb72e97b3171c518cb8b93@group.calendar.google.com'; // 방배 스튜디오 예약현황
var PUBLIC_CALENDAR_NAME = '미디어백묵 예약 현황(공개용)';
var MIRROR_PAST_DAYS = 31;     // 공개용 캘린더에 복사할 기간: 지난 31일 ~
var MIRROR_FUTURE_DAYS = 400;  //                             앞으로 400일
var KEEP_CHARS = 2;            // 제목에서 보여 줄 앞 글자 수

function pad_(n) { return (n < 10 ? '0' : '') + n; }

function times_(b) {
  var h = Number(String(b.start_time).slice(0, 2));
  var start = new Date(b.date + 'T' + pad_(h) + ':00:00+09:00');
  var end = new Date(start.getTime() + Number(b.duration) * 3600 * 1000);
  return { start: start, end: end };
}

function title_(b) {
  return '[온라인예약] ' + b.name + ' ' + b.duration + '시간 (' + b.reference + ')';
}

function description_(b) {
  return '예약번호: ' + b.reference + '\n상태: ' + (b.status === 'completed' ? '이용 완료' : '예약 확정') +
    '\n\n연락처·요청사항은 관리자 페이지에서 확인하세요: ' + ADMIN_URL +
    '\n※ 사이트에서 자동 반영된 일정입니다. 수정·취소는 관리자 페이지에서 해 주세요(10분 안에 반영).';
}

/** 제목 가리기: 앞 KEEP_CHARS 글자(공백 제외)만 남기고 나머지 글자는 *, 공백은 그대로 */
function mask_(title) {
  var chars = Array.from(String(title || '').trim());
  if (!chars.length) return '일정';
  var kept = 0;
  return chars.map(function (ch) {
    if (/\s/.test(ch)) return ch;
    if (kept < KEEP_CHARS) { kept++; return ch; }
    return '*';
  }).join('');
}

/** 방배 스튜디오 예약현황 (공유받은 캘린더라 목록에 없으면 구독) */
function studioCalendar_() {
  var cal = CalendarApp.getCalendarById(STUDIO_CALENDAR_ID);
  if (!cal) cal = CalendarApp.subscribeToCalendar(STUDIO_CALENDAR_ID);
  if (!cal) throw new Error('방배 스튜디오 예약현황 캘린더에 접근할 수 없습니다. 공유 설정을 확인하세요.');
  return cal;
}

/** 10분마다 실행 */
function sync() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  var feedError = null;
  try {
    try { syncFeed_(); } catch (e) { feedError = e; Logger.log('예약 피드 동기화 실패: ' + e); }
    mirror_();
  } finally {
    lock.releaseLock();
  }
  if (feedError) throw feedError;
}

/** 1) 사이트 확정 예약 → 방배 스튜디오 예약현황 */
function syncFeed_() {
  var res = UrlFetchApp.fetch(FEED_URL, { muteHttpExceptions: true, headers: { 'Cache-Control': 'no-cache' } });
  if (res.getResponseCode() !== 200) throw new Error('피드 응답 ' + res.getResponseCode());
  var feed = JSON.parse(res.getContentText());
  if (!feed || !feed.bookings || !feed.from) throw new Error('피드 형식 오류');

  var cal = studioCalendar_();
  var props = PropertiesService.getScriptProperties();
  var saved = props.getProperties();
  var seen = {};

  feed.bookings.forEach(function (b) {
    if (!/^[A-Z0-9-]{6,40}$/.test(String(b.reference))) return;
    seen[b.reference] = true;
    var t = times_(b);
    if (isNaN(t.start.getTime())) return;
    var sig = [b.date, b.start_time, b.duration, b.status, b.name].join('|');
    var id = saved['ev:' + b.reference];
    var ev = id ? cal.getEventById(id) : null;
    if (ev && saved['sig:' + b.reference] === sig) return;
    if (ev) {
      ev.setTitle(title_(b));
      ev.setTime(t.start, t.end);
      ev.setDescription(description_(b));
    } else {
      ev = cal.createEvent(title_(b), t.start, t.end, { description: description_(b) });
      props.setProperty('ev:' + b.reference, ev.getId());
    }
    props.setProperty('sig:' + b.reference, sig);
  });

  // 피드에서 빠진 예약: 피드 기간(어제 이후) 안이면 취소·삭제된 것 → 일정 삭제. 그보다 지난 일정은 기록만 정리
  var fromTime = new Date(feed.from + 'T00:00:00+09:00').getTime();
  Object.keys(saved).forEach(function (key) {
    if (key.indexOf('ev:') !== 0) return;
    var ref = key.slice(3);
    if (seen[ref]) return;
    var ev = cal.getEventById(saved[key]);
    if (ev && ev.getStartTime().getTime() >= fromTime) ev.deleteEvent();
    props.deleteProperty(key);
    props.deleteProperty('sig:' + ref);
  });
}

/** 공개용 캘린더 (없으면 만듦) */
function publicCalendar_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('PUBLIC_CALENDAR_ID');
  var cal = id ? CalendarApp.getCalendarById(id) : null;
  if (!cal) {
    cal = CalendarApp.createCalendar(PUBLIC_CALENDAR_NAME, {
      summary: '스튜디오 미디어백묵 방배점 예약 현황 (사이트 표시용, 자동 생성 — 직접 수정하지 마세요)',
      timeZone: 'Asia/Seoul',
    });
    props.setProperty('PUBLIC_CALENDAR_ID', cal.getId());
  }
  return cal;
}

/** 2) 방배 스튜디오 예약현황 → 공개용 캘린더 (제목 가림) */
function mirror_() {
  var src = studioCalendar_();
  var dst = publicCalendar_();
  var now = new Date();
  var from = new Date(now.getTime() - MIRROR_PAST_DAYS * 86400000);
  var to = new Date(now.getTime() + MIRROR_FUTURE_DAYS * 86400000);

  // 원본 일정 → 복사본 내용. 반복 일정은 회차마다 시작 시각으로 구분
  var want = {};
  src.getEvents(from, to).forEach(function (ev) {
    var allDay = ev.isAllDayEvent();
    var start = allDay ? ev.getAllDayStartDate() : ev.getStartTime();
    var end = allDay ? ev.getAllDayEndDate() : ev.getEndTime();
    var key = ev.getId() + '@' + start.getTime();
    want[key] = { title: mask_(ev.getTitle()), allDay: allDay, start: start, end: end };
  });

  // 기존 복사본과 비교해 고칠 것만 고치고, 원본이 없어진 것은 지움
  dst.getEvents(from, to).forEach(function (copy) {
    var key = copy.getTag('src');
    var w = key ? want[key] : null;
    if (!w) { copy.deleteEvent(); return; }
    var same = copy.getTitle() === w.title && copy.isAllDayEvent() === w.allDay &&
      (w.allDay
        ? copy.getAllDayStartDate().getTime() === w.start.getTime() && copy.getAllDayEndDate().getTime() === w.end.getTime()
        : copy.getStartTime().getTime() === w.start.getTime() && copy.getEndTime().getTime() === w.end.getTime());
    if (same) { delete want[key]; return; }
    copy.deleteEvent(); // 바뀐 것은 지우고 아래에서 새로 만듦
  });

  Object.keys(want).forEach(function (key) {
    var w = want[key];
    var copy = w.allDay ? dst.createAllDayEvent(w.title, w.start, w.end) : dst.createEvent(w.title, w.start, w.end);
    copy.setTag('src', key);
  });
}

/** 공개용 캘린더 ID 확인용 (사이트 삽입 코드에 씀) */
function showPublicCalendarId() {
  Logger.log('공개용 캘린더: ' + publicCalendar_().getName() + ' / ID: ' + publicCalendar_().getId());
}

/** 처음 한 번 실행: 10분마다 sync 를 돌리는 트리거를 만들고 바로 한 번 동기화합니다. */
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sync') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sync').timeBased().everyMinutes(10).create();
  sync();
  Logger.log('설치 완료: 캘린더 "' + studioCalendar_().getName() + '" 에 10분마다 반영합니다.');
  showPublicCalendarId();
}

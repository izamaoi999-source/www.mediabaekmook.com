/**
 * 미디어백묵 예약 → 구글 캘린더 자동 반영 (Google Apps Script)
 *
 * 캘린더 주인 계정(감평사스튜디오공유캘린더 = 그 계정의 기본 캘린더)에서 실행합니다.
 * 10분마다 사이트의 확정 예약 피드(/api/bookings/calendar-feed)를 읽어
 *  - 새로 확정된 예약은 일정을 만들고,
 *  - 날짜·시간이 바뀐 예약은 일정을 고치고,
 *  - 취소·대기로 바뀌거나 삭제된 예약(오늘 이후)은 일정을 지웁니다.
 * 예약번호 ↔ 일정 ID 는 스크립트 속성에 저장합니다. 이 스크립트가 만든 일정만 건드립니다.
 *
 * 설치: 이 코드를 붙여넣고 저장한 뒤 installTrigger 를 한 번 실행하고 권한을 허용합니다.
 */

var FEED_URL = 'https://mediabaekmook.com/api/bookings/calendar-feed';
var ADMIN_URL = 'https://mediabaekmook.com/booking-admin';

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

/** 10분마다 실행되는 동기화 */
function sync() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var res = UrlFetchApp.fetch(FEED_URL, { muteHttpExceptions: true, headers: { 'Cache-Control': 'no-cache' } });
    if (res.getResponseCode() !== 200) throw new Error('피드 응답 ' + res.getResponseCode());
    var feed = JSON.parse(res.getContentText());
    if (!feed || !feed.bookings || !feed.from) throw new Error('피드 형식 오류');

    var cal = CalendarApp.getDefaultCalendar();
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
  } finally {
    lock.releaseLock();
  }
}

/** 처음 한 번 실행: 10분마다 sync 를 돌리는 트리거를 만들고 바로 한 번 동기화합니다. */
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sync') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sync').timeBased().everyMinutes(10).create();
  sync();
  Logger.log('설치 완료: 캘린더 "' + CalendarApp.getDefaultCalendar().getName() + '" 에 10분마다 반영합니다.');
}

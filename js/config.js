/**
 * 사이트 표시 설정 — 상호·도메인·연락처·요금·예약/결제 링크.
 * 온라인 예약 서버 요금은 lib/booking.js의 BOOKING_STUDIO도 함께 변경해야 합니다.
 * npm test가 표시 요금과 예약 서버 요금의 일치를 검증합니다.
 * 배포 전 SITE_URL 을 실제 도메인으로 바꾸면 sitemap·robots·OG·JSON-LD에 반영됩니다.
 *
 * 촬영샘플은 /gallery 의 관리자 화면(?admin)에서 유튜브·Vimeo 링크로 추가합니다 (D1 저장).
 */
window.SITE = {
  brandName: "스튜디오 미디어백묵",
  brandTag: "강의 전문", // 화면 표시용 작은 글씨 (제목·메타에는 붙이지 않음)
  tagline: "강의 촬영 스튜디오 대여",
  slogan: "교안만 가지고 몸만 오시면 촬영이 가능합니다",
  siteUrl: "https://mediabaekmook.com",
  telephone: "010-2928-6068",
  email: "izamaoi@naver.com",
  // 현재 예약 가능한 지점(방배점) 기본 요금
  pricePerHour: 40000,
  pricePerHourWeekend: 46000, // 토·일·공휴일 (평일 대비 15% 할증)
  minHours: 2,
  businessHours: "오전 9시 ~ 오후 8시 · 점심시간 없음",
  addons: {
    producerAssist: {
      name: "프로듀서 어시스트(촬영대행)",
      pricePerHour: 50000,
      studios: ["bangbae"],
      note: "스튜디오 대여료와 별도이며, 예약 시 사전 요청이 필요합니다."
    }
  },
  // 사업자번호·사업장 주소는 사이트에 표시하지 않음 (푸터 TODO)
  studios: {
    bangbae: {
      id: "bangbae",
      name: "방배점",
      shortName: "방배",
      comingSoon: false,
      area: "약 5평",
      maxPeople: 2,
      pricePerHour: 40000,
      pricePerHourWeekend: 46000,
      minHours: 2,
      address: "서울시 서초구 방배로 52 감정평가사협회 건물 지하1층",
      addressShort: "서울시 서초구 방배로 52",
      parking: "예약시간 내 주차 1대 무료",
      naverMapUrl: "https://map.naver.com/p/search/%EC%84%9C%EC%9A%B8%EC%8B%9C%20%EC%84%9C%EC%B4%88%EA%B5%AC%20%EB%B0%A9%EB%B0%B0%EB%A1%9C%2052",
      bookingUrl: "/booking", // 담당자가 일정을 확인한 뒤 확정하는 온라인 예약 요청
      latpeedUrl: "", // 래피드 결제 링크 (생기면 입력)
      geo: { lat: "37.47935", lng: "126.99943" },
      images: [
        "/img/bangbae-main.jpg",
        "/img/bangbae-display.jpg",
        "/img/bangbae-chalkboard.jpg",
        "/img/bangbae-camera.jpg",
        "/img/bangbae-chromakey.jpg"
      ]
    },
    yeongeondong: {
      id: "yeongeondong",
      name: "연건동점",
      shortName: "연건동",
      comingSoon: true,
      area: null,
      maxPeople: null,
      address: "서울 종로구 연건동 (오픈 예정)",
      addressShort: "서울 종로구 연건동",
      parking: "",
      naverMapUrl: "https://map.naver.com/p/search/%EC%84%9C%EC%9A%B8%20%EC%A2%85%EB%A1%9C%EA%B5%AC%20%EC%97%B0%EA%B1%B4%EB%8F%99",
      bookingUrl: "",
      latpeedUrl: "",
      geo: null,
      images: []
    }
  }
};

// /api/* 공통: 예외 처리 + 캐시 금지
export async function onRequest(context) {
  let res;
  try {
    if (!context.env.DB) {
      res = new Response(JSON.stringify({ error: "게시판 저장소(DB)가 연결되지 않았습니다." }), { status: 503 });
    } else {
      res = await context.next();
    }
  } catch (e) {
    console.error(e);
    res = new Response(JSON.stringify({ error: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." }), { status: 500 });
  }
  res = new Response(res.body, res);
  res.headers.set("Cache-Control", "no-store, private");
  res.headers.set("X-Robots-Tag", "noindex");
  if (!res.headers.get("Content-Type")) res.headers.set("Content-Type", "application/json; charset=utf-8");
  return res;
}

// www.mediabaekmook.com → mediabaekmook.com 301 (검색엔진 중복 주소 방지)
const CANONICAL_HOST = "mediabaekmook.com";

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (url.hostname === "www." + CANONICAL_HOST) {
    url.hostname = CANONICAL_HOST;
    return Response.redirect(url.toString(), 301);
  }
  return next();
}

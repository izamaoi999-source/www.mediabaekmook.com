// 촬영샘플 공용 로직: URL → {provider, id, hash}, oEmbed 조회
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{5,12}$/;
const VIMEO_HASH = /^[0-9a-f]{6,20}$/i;

export function parseVideoUrl(input) {
  if (typeof input !== "string") return null;
  let raw = input.trim();
  if (!raw || raw.length > 500) return null;
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\.|^music\./, "");
  const seg = u.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    return YT_ID.test(seg[0] || "") ? { provider: "youtube", id: seg[0], hash: "" } : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    let id = "";
    if (seg[0] === "watch") id = u.searchParams.get("v") || "";
    else if (["shorts", "embed", "live", "v", "e"].includes(seg[0])) id = seg[1] || "";
    return YT_ID.test(id) ? { provider: "youtube", id, hash: "" } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    let id = "", hash = "";
    if (host === "player.vimeo.com") {
      if (seg[0] !== "video") return null;
      id = seg[1] || "";
      hash = u.searchParams.get("h") || "";
    } else {
      // vimeo.com/ID, /ID/HASH, /channels/x/ID, /groups/x/videos/ID, /showcase/x/video/ID, /album/x/video/ID
      // 마지막 숫자 구간이 영상 ID (showcase/album 번호보다 뒤에 옴)
      let idx = -1;
      seg.forEach((s, i) => { if (VIMEO_ID.test(s)) idx = i; });
      const kw = seg.findIndex((s) => s === "video" || s === "videos");
      if (kw >= 0 && VIMEO_ID.test(seg[kw + 1] || "")) idx = kw + 1;
      if (idx < 0) return null;
      id = seg[idx];
      const next = seg[idx + 1] || "";
      if (VIMEO_HASH.test(next) && !VIMEO_ID.test(next)) hash = next;
      else if (u.searchParams.get("h")) hash = u.searchParams.get("h");
    }
    if (!VIMEO_ID.test(id)) return null;
    if (hash && !VIMEO_HASH.test(hash)) hash = "";
    return { provider: "vimeo", id, hash: hash.toLowerCase() };
  }
  return null;
}

export function canonicalUrl(v) {
  if (v.provider === "youtube") return `https://www.youtube.com/watch?v=${v.id}`;
  return `https://vimeo.com/${v.id}${v.hash ? "/" + v.hash : ""}`;
}

export function thumbFor(row) {
  if (row.provider === "youtube") return `https://i.ytimg.com/vi/${row.video_id}/hqdefault.jpg`;
  return row.thumb_url || "";
}

export function embedFor(row) {
  if (row.provider === "youtube") return `https://www.youtube-nocookie.com/embed/${row.video_id}?autoplay=1&rel=0&playsinline=1`;
  return `https://player.vimeo.com/video/${row.video_id}?autoplay=1${row.hash ? "&h=" + row.hash : ""}&dnt=1`;
}

function safeVimeoThumb(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)vimeocdn\.com$/.test(u.hostname) ? u.toString() : "";
  } catch { return ""; }
}

// oEmbed: {status:'ok', title, thumb} | {status:'unavailable'} | {status:'error'}
export async function fetchOembed(v) {
  const target = encodeURIComponent(canonicalUrl(v));
  const endpoint = v.provider === "youtube"
    ? `https://www.youtube.com/oembed?format=json&url=${target}`
    : `https://vimeo.com/api/oembed.json?width=640&url=${target}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(endpoint, { signal: ctrl.signal, headers: { "User-Agent": "mediabaekmook-gallery/1.0", Accept: "application/json" } });
    if ([401, 403, 404].includes(res.status)) return { status: "unavailable" };
    if (!res.ok) return { status: "error" };
    const data = await res.json();
    const title = typeof data.title === "string" ? data.title : "";
    const thumb = v.provider === "vimeo" && typeof data.thumbnail_url === "string" ? safeVimeoThumb(data.thumbnail_url) : "";
    return { status: "ok", title, thumb };
  } catch {
    return { status: "error" };
  } finally {
    clearTimeout(timer);
  }
}

export function publicVideo(row) {
  return {
    id: row.id,
    provider: row.provider,
    title: row.title,
    description: row.description,
    thumb: thumbFor(row),
    embed: embedFor(row),
    pinned: !!row.pinned_at,
    created_at: row.created_at,
  };
}

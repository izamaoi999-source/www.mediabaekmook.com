// IndexNow: sitemap.xml 의 주소를 네이버·Bing(IndexNow 공유 엔드포인트)에 바로 알립니다.
// 사용: npm run indexnow  (배포 후 실행. 키 파일은 사이트 루트의 <KEY>.txt 로 공개돼 있어야 함)
import { readFileSync } from "node:fs";

const HOST = "mediabaekmook.com";
const KEY = "c0c7a38479e918408879759846e43488";
const ENDPOINTS = [
  "https://searchadvisor.naver.com/indexnow", // 네이버
  "https://api.indexnow.org/indexnow",        // Bing·Yandex·Seznam 등 공유
];

const sitemap = readFileSync(new URL("../sitemap.xml", import.meta.url), "utf8");
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => m[1].trim())
  .filter((u) => u.startsWith(`https://${HOST}/`) && !/\.(jpe?g|png|webp)$/i.test(u));

const body = JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList });
console.log(`IndexNow: ${urlList.length}개 주소 전송`);
let failed = false;
for (const endpoint of ENDPOINTS) {
  try {
    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body });
    const text = (await res.text()).slice(0, 200);
    console.log(`${endpoint} → ${res.status}${text ? " " + text : ""}`);
    if (res.status >= 400) failed = true;
  } catch (e) {
    console.log(`${endpoint} → 오류 ${e.message}`);
    failed = true;
  }
}
process.exitCode = failed ? 1 : 0;

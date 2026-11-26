// 환한길 서비스 워커: 한 번 받은 화면과 지도 데이터를 기기에 보관해 다음부터 빠르게 열고,
// 신호가 약한 골목에서도 경로 계산이 되게 합니다.
//
// 보관하지 않는 것
// - /api/* (카카오 장소 검색 결과: 카카오 정책상 저장 금지, 항상 실시간)
// - 다른 사이트의 요청 (지도 타일 등)

const VERSION = "v3";
const CACHE = `hwanhangil-${VERSION}`;
// 처음 여는 지역(전주) 데이터만 미리 받아 두고, 다른 지역은 열었을 때 캐시합니다
const PRECACHE = ["/", "/about", "/data/jeonju/facilities.json", "/data/jeonju/graph.json", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {}) // 미리 받기가 실패해도 설치는 계속
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("hwanhangil-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** 보관본을 바로 주고, 뒤에서 새것을 받아 보관본을 갱신 (데이터가 바뀌면 다음 접속부터 반영) */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => undefined);
  return cached || (await network) || Response.error();
}

/** 화면(HTML)은 최신을 먼저, 인터넷이 안 되면 보관본 */
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match(request)) || (await cache.match("/")) || Response.error();
  }
}

// 첫 방문에는 서비스 워커가 화면을 아직 관리하지 않아 이미 받은 스크립트·스타일이 보관되지 않습니다.
// 그래서 화면이 "내가 받은 파일 목록"을 보내 주면 그 파일들을 보관합니다 (같은 사이트의 정적 파일만).
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "cache-urls" || !Array.isArray(data.urls)) return;
  const urls = data.urls
    .filter((u) => typeof u === "string")
    .map((u) => new URL(u, self.location.origin))
    .filter((u) => u.origin === self.location.origin && (u.pathname.startsWith("/_next/static/") || u.pathname.startsWith("/data/")))
    .map((u) => u.pathname + u.search)
    .slice(0, 200);
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(urls.map((u) => cache.match(u).then((hit) => hit || cache.add(u).catch(() => {}))))
    )
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }
  if (url.pathname.startsWith("/data/") || url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(staleWhileRevalidate(req));
  }
});

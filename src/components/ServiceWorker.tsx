"use client";

import { useEffect } from "react";

/** 배포된 사이트에서만 서비스 워커를 등록합니다 (개발 중에는 보관본 때문에 수정이 안 보이는 일을 막으려고 끔) */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // 이 화면이 이미 받은 스크립트·스타일·글꼴을 알려줘서 다음엔 인터넷 없이도 열리게 함
        const urls = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((u) => u.startsWith(window.location.origin + "/_next/static/"));
        reg.active?.postMessage({ type: "cache-urls", urls });
      })
      .catch(() => {});
  }, []);
  return null;
}

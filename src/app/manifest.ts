import type { MetadataRoute } from "next";

// 휴대폰 홈 화면에 "앱"으로 추가할 때 쓰는 정보 (/manifest.webmanifest 로 제공됨)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "환한길 · 밤길 안심 경로",
    short_name: "환한길",
    description: "CCTV·보안등 공공데이터로 더 밝고 안전한 귀갓길을 찾아 주는 서비스",
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b1020",
    theme_color: "#0b1020",
    categories: ["navigation", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

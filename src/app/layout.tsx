import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import ServiceWorker from "@/components/ServiceWorker";

const notoKr = Noto_Sans_KR({
  variable: "--font-noto-kr",
  weight: ["400", "500", "700"],
  preload: false,
  display: "swap",
});

export const metadata: Metadata = {
  title: "환한길 · 밤길 안심 경로",
  description:
    "CCTV, 보안등, 가로등, 안전비상벨 공공데이터로 길마다 안전 점수를 매겨, 늦은 밤 대학가에서 더 안전한 귀갓길을 추천합니다.",
  applicationName: "환한길",
  // 아이폰에서 홈 화면에 추가했을 때 앱처럼 보이게
  appleWebApp: { capable: true, title: "환한길", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1020",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${notoKr.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}

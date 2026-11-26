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
  // 공유 링크 미리보기(카카오톡·문자·SNS): 그림은 app/opengraph-image.png (scripts/make-og.mjs 로 만듦)
  metadataBase: new URL("https://hwanhangil.vercel.app"),
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "환한길",
    title: "환한길 · 밤길 안심 경로",
    description: "빠른 길 말고, 환하고 안전한 길로. CCTV·보안등·안전비상벨 공공데이터로 대학가 밤길 귀갓길을 안내해요.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "환한길 · 밤길 안심 경로",
    description: "빠른 길 말고, 환하고 안전한 길로. 공공데이터로 찾는 밤길 안심 경로.",
  },
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

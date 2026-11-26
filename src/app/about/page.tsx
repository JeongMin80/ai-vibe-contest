import type { Metadata } from "next";
import Link from "next/link";
import { REGIONS } from "@/lib/regions";

export const metadata: Metadata = {
  title: "데이터 안내 · 환한길",
  description: "환한길이 사용하는 공공데이터의 출처, 기준일, 안전 점수 계산 방식과 한계를 설명합니다.",
};

const SOURCES = [
  {
    name: "CCTV",
    source: "행정안전부_CCTV정보 조회서비스",
    via: "공공데이터포털 (data.go.kr)",
    use: "길에서 50m 안의 CCTV 수와 카메라 수를 안전 점수에 반영합니다.",
  },
  {
    name: "안전비상벨",
    source: "행정안전부_안전비상벨위치정보 조회서비스",
    via: "공공데이터포털 (data.go.kr)",
    use: "가까운 비상벨 안내에 쓰고, 경로 점수에는 가산점으로 반영합니다.",
  },
  {
    name: "보안등",
    source: "행정안전부_전국보안등정보표준데이터 (전주시·군산시·제주시 기관 코드로 받음)",
    via: "공공데이터포털 (data.go.kr)",
    use: "길에서 30m 안에 보안등이 얼마나 이어지는지를 조명 점수에 반영합니다.",
  },
  {
    name: "가로등 (추정)",
    source: "OpenStreetMap 도로 종류로 추정 (차도가 있는 큰길과 그 옆 보도)",
    via: "openstreetmap.org",
    use: "큰길에는 가로등이 설치되어 밝다고 보고 조명 점수에 반영합니다. 가로등 위치 데이터는 시청마다 따로 공개하고(전주시는 자체 인증키 필요) 아직 쓰지 못해서, 실제 위치가 아닌 추정입니다.",
  },
  {
    name: "도로망·배경 지도",
    source: "OpenStreetMap 기여자 (ODbL)",
    via: "openstreetmap.org",
    use: "걸을 수 있는 길과 교차점으로 경로를 계산합니다.",
  },
];

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 pb-16">
      <Link href="/" className="text-sm text-muted underline underline-offset-2">
        ← 지도로 돌아가기
      </Link>
      <h1 className="mt-4 text-2xl font-bold">데이터 안내</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        환한길은 공공기관이 공개한 안전시설 위치 데이터로 길마다 안전 점수를 매깁니다. 어떤 데이터를 어떻게
        쓰는지, 그리고 무엇을 알 수 없는지 투명하게 밝힙니다.
      </p>

      <h2 className="mt-8 text-lg font-bold">서비스 지역</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        대학가 주변 원룸촌을 중심으로, 지도 위쪽에서 지역을 고를 수 있습니다. 지역마다 안전시설·도로 데이터를 따로
        만들고, 경로는 같은 지역 안에서만 찾습니다.
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {REGIONS.map((r) => (
          <li key={r.id} className="rounded-2xl border border-line bg-panel p-3 text-sm">
            <b>{r.name}</b> <span className="text-muted">· {r.places.map((p) => p.name).join(", ")} 주변</span>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-lg font-bold">사용하는 데이터</h2>
      <ul className="mt-3 space-y-3">
        {SOURCES.map((s) => (
          <li key={s.name} className="rounded-2xl border border-line bg-panel p-4">
            <p className="font-bold">{s.name}</p>
            <p className="mt-1 text-sm">{s.source}</p>
            <p className="text-xs text-muted">{s.via}</p>
            <p className="mt-2 text-sm text-muted">{s.use}</p>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-lg font-bold">알아 두세요</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
        <li>
          <b className="text-text">안전 점수는 참고 지표입니다.</b> 공공 안전시설이 얼마나 가까이 있는지를
          나타낼 뿐, 그 길이 반드시 안전하다는 뜻은 아닙니다. 위급할 때는 바로 112에 신고하세요.
        </li>
        <li>
          <b className="text-text">대학 캠퍼스 안의 CCTV는 포함되지 않습니다.</b> 대학이 자체 관리하는 CCTV는
          공공데이터에 공개되지 않습니다. 캠퍼스 안 길의 점수가 낮게 보일 수 있습니다.
        </li>
        <li>
          <b className="text-text">제주는 공개된 CCTV가 적습니다.</b> 행정안전부 CCTV 데이터에 제주시 대학가 주변은 약
          200곳만 올라와 있어(전주는 약 1,500곳), 제주 지역 점수는 실제보다 낮게 나올 수 있습니다.
        </li>
        <li>
          <b className="text-text">범죄 통계는 쓰지 않습니다.</b> 특정 동네를 &lsquo;위험 지역&rsquo;으로
          낙인찍지 않도록, 안전시설이 있는 곳을 기준으로만 점수를 매깁니다.
        </li>
        <li>
          <b className="text-text">안전 점수 계산</b>: 50m 안 CCTV 40% · 조명(보안등, 큰길 가로등 추정) 35% · 길
          종류 20% · 100m 안 비상벨 5%. 경로는 &lsquo;길이 × (1 + 안전 우선 정도 × (1 − 점수/100))&rsquo;가 가장
          작은 길을 찾습니다.
        </li>
        <li>데이터는 기관이 갱신한 시점 기준이라 실제 현장과 다를 수 있습니다.</li>
      </ul>

      <p className="mt-10 text-xs text-muted">
        2026학년도 AI 활용 역량강화 프로그램 · AI 바이브 코딩 챌린지 출품작
      </p>
    </main>
  );
}

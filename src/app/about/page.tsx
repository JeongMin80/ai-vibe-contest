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
      <Link href="/" className="inline-block py-1 text-sm text-muted underline underline-offset-2">
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
        <li>
          <b className="text-text">위치 정보</b>: 안심 경로는 내 휴대폰 안에서 계산해 출발·도착 위치를 서버로 보내지 않습니다.
          &lsquo;주변 안전한 곳&rsquo;과 장소 검색만 서버를 거쳐 카카오에 물어보고, 결과는 저장하지 않습니다. 시민 제보를 보낼 때만
          그 위치가 저장되어 14일 동안 지도에 보입니다. 가족 알림은 내 휴대폰의 공유창으로 직접 보냅니다.
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-bold">이렇게 만들었어요</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        AI 코딩 도구(Claude Code)와 함께 &lsquo;바이브 코딩&rsquo;으로 만들었습니다. 사람이 방향과 규칙을 정하고, AI가 구현한 뒤
        <b className="text-text"> 자동 점검 → 실제 화면 확인 → 배포 → 기록</b>을 한 바퀴로 20번 넘게 반복했습니다.
      </p>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
        <li className="rounded-xl border border-line bg-panel px-3 py-2.5">
          <b className="text-text">데이터 먼저 확인</b> — 아이디어보다 공공데이터를 실제로 받아 보고 주제를 정했습니다(대학가 월세 진단은
          데이터가 부족해 접음).
        </li>
        <li className="rounded-xl border border-line bg-panel px-3 py-2.5">
          <b className="text-text">직접 써 보고 고치기</b> — &ldquo;차도 쪽은 가로등이 있어 밝다&rdquo;는 생활 경험을 반영해 큰길 조명 추정을
          더했습니다.
        </li>
        <li className="rounded-xl border border-line bg-panel px-3 py-2.5">
          <b className="text-text">검증 전에는 배포하지 않기</b> — 기능 점검 8종을 통과해야 배포하고, 배포 뒤에는 실제 사이트를 휴대폰 크기로
          자동 조작하는 17단계 점검으로 다시 확인합니다.
        </li>
      </ul>
      <p className="mt-3 text-sm">
        <a
          href="https://github.com/JeongMin80/ai-vibe-contest/blob/main/개발기록.md"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block py-1 text-accent underline underline-offset-2"
        >
          개발 과정 기록 보기 (GitHub) ↗
        </a>
      </p>

      <p className="mt-10 text-xs text-muted">
        2026학년도 AI 활용 역량강화 프로그램 · AI 바이브 코딩 챌린지 출품작
      </p>
    </main>
  );
}

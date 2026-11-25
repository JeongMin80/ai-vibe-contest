# 환한길 · 밤길 안심 경로

> 빠른 길 말고, 환하고 안전한 길로.

공공데이터(CCTV, 보안등, 가로등, 안전비상벨)로 길마다 안전 점수를 매겨, 늦은 밤 대학가에서 **조금 돌아가더라도 더 안전한 귀갓길**을 추천하는 웹서비스입니다.

2026학년도 AI 활용 역량강화 프로그램 · AI 바이브 코딩 챌린지 출품작

- 기능 정의: [기능정의서.md](기능정의서.md)
- 개발 과정: [개발기록.md](개발기록.md)

## 사용 데이터

| 데이터 | 출처 |
|---|---|
| CCTV 위치 | 행정안전부_CCTV정보 조회서비스 (공공데이터포털) |
| 안전비상벨 위치 | 행정안전부_안전비상벨위치정보 조회서비스 (공공데이터포털) |
| 보안등 위치 | 전북특별자치도 전주시_보안등 정보 서비스 (공공데이터포털) |
| 가로등 위치 | 전북특별자치도 전주시_가로등 정보 서비스 (공공데이터포털) |
| 도로망·배경 지도 | © OpenStreetMap 기여자 (ODbL) |

## 개발 환경에서 실행하기

```bash
npm install
cp .env.example .env.local   # 값 채우기
npm run dev                  # http://localhost:3000
```

## 데이터 다시 받기

```bash
node scripts/fetch-mois.mjs cctv 전주시     # CCTV (공공데이터포털 인증키 필요)
node scripts/fetch-mois.mjs bell 전주시     # 안전비상벨
node scripts/build-facilities.mjs           # 웹용 파일(public/data/facilities.json) 만들기
```

## 기술 구성

Next.js 16 · TypeScript · Tailwind CSS · Leaflet · Supabase · Vercel

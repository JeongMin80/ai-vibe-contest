# 환한길 · 밤길 안심 경로

> 빠른 길 말고, 환하고 안전한 길로.

공공데이터(CCTV, 보안등, 가로등, 안전비상벨)로 길마다 안전 점수를 매겨, 늦은 밤 대학가에서 **조금 돌아가더라도 더 안전한 귀갓길**을 추천하는 웹서비스입니다.

2026학년도 AI 활용 역량강화 프로그램 · AI 바이브 코딩 챌린지 출품작

- 기능 정의: [기능정의서.md](기능정의서.md)
- 개발 과정: [개발기록.md](개발기록.md) · 루프별 요약: [작업일지.md](작업일지.md)
- 공모전 제출 정리(심사 기준별·시연 순서): [제출정리.md](제출정리.md)
- 서비스 주소: https://hwanhangil.vercel.app
- 서비스 지역: 전주(전북대·전주교대), 군산(국립군산대), 제주(제주대) 주변

## 사용 데이터

| 데이터 | 출처 |
|---|---|
| CCTV 위치 | 행정안전부_CCTV정보 조회서비스 (공공데이터포털) |
| 안전비상벨 위치 | 행정안전부_안전비상벨위치정보 조회서비스 (공공데이터포털) |
| 보안등 위치 | 행정안전부_전국보안등정보표준데이터 (공공데이터포털, 시 기관코드로 거름) |
| 큰길 가로등 (추정) | OpenStreetMap 도로 종류로 추정 (실제 위치 데이터는 전주시 자체 키 필요) |
| 편의점·지구대, 장소 검색 | 카카오 로컬 API (실시간 조회, 저장하지 않음) |
| 도로망·배경 지도 | © OpenStreetMap 기여자 (ODbL) |

## 개발 환경에서 실행하기

```bash
npm install
cp .env.example .env.local   # 값 채우기
npm run dev                  # http://localhost:3000
```

## 데이터 다시 받기

```bash
# 지역: 전주시 | 군산시 | 제주시
node scripts/fetch-mois.mjs cctv 군산시     # CCTV (공공데이터포털 인증키 필요)
node scripts/fetch-mois.mjs bell 군산시     # 안전비상벨
node scripts/fetch-lamps.mjs 군산시         # 보안등 (전국 표준데이터)
node scripts/fetch-osm.mjs 군산시           # 도로망 (OpenStreetMap)
node scripts/build-graph.mjs 군산시         # 경로용 도로 데이터 → public/data/gunsan/graph.json
node scripts/build-facilities.mjs 군산시    # 지도용 시설 데이터 → public/data/gunsan/facilities.json
node scripts/make-og.mjs                    # 공유 미리보기 그림 (Windows Edge 필요)
```

## 기술 구성

Next.js 16 · TypeScript · Tailwind CSS · Leaflet · Supabase · Vercel · PWA(서비스 워커)

## 점검

```bash
npm test        # 자동 점검 8종 (경로·내 장소·길 안내·공유·밤·제보·지역·음성)
npm run lint
npm run build
```

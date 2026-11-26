-- 환한길 · 시민 제보 테이블
-- Supabase 대시보드 → SQL Editor → New query 에 전체를 붙여넣고 Run 을 한 번 누르세요.
-- 로그인 없이 누구나 제보를 올리고 최근 14일 제보를 볼 수 있습니다. 수정·삭제는 막혀 있습니다.

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- light_out: 가로등 고장 / very_dark: 매우 어두움 / construction: 공사 중 / unsafe: 불안한 곳 / other: 기타
  kind text not null check (kind in ('light_out', 'very_dark', 'construction', 'unsafe', 'other')),
  -- 서비스 지역 주변 좌표만 허용
  lat double precision not null check (lat between 33.0 and 38.7),
  lng double precision not null check (lng between 124.5 and 131.0),
  note text check (note is null or char_length(note) <= 100)
);

create index if not exists reports_created_at_idx on public.reports (created_at desc);

alter table public.reports enable row level security;

-- 읽기: 최근 14일 제보만
drop policy if exists "read recent reports" on public.reports;
create policy "read recent reports" on public.reports
  for select to anon, authenticated
  using (created_at > now() - interval '14 days');

-- 쓰기: 누구나 추가만 가능 (작성 시각은 서버 시각과 1분 이상 다르면 거부)
drop policy if exists "add report" on public.reports;
create policy "add report" on public.reports
  for insert to anon, authenticated
  with check (created_at between now() - interval '1 minute' and now() + interval '1 minute');

grant select, insert on public.reports to anon, authenticated;

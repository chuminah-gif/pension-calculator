-- 연금랩 Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에서 이 스크립트 전체를 한 번 실행하세요.
-- (publishable/anon 키는 DDL 권한이 없으므로 이 작업은 반드시 대시보드에서 직접 실행해야 합니다.)

-- 1) 문의하기 폼 저장 테이블
create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text,
  email text not null,
  message text not null
);

alter table public.inquiries enable row level security;

-- 누구나(익명 방문자) 문의를 "등록"할 수는 있지만, 등록된 문의를 조회/수정/삭제할 수는 없도록 제한합니다.
-- (운영자는 Supabase 대시보드에서 service_role 권한으로 열람합니다.)
drop policy if exists "public can insert inquiries" on public.inquiries;
create policy "public can insert inquiries"
  on public.inquiries
  for insert
  to anon
  with check (true);

-- 2) 계산기 사용 통계 테이블 (개인 식별 정보 없이, 어떤 계산기가 쓰였는지만 기록)
create table if not exists public.calc_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  pension_type text not null check (
    pension_type in ('national', 'civil_servant', 'military', 'private_school')
  )
);

alter table public.calc_usage enable row level security;

drop policy if exists "public can insert usage" on public.calc_usage;
create policy "public can insert usage"
  on public.calc_usage
  for insert
  to anon
  with check (true);

-- 참고: 두 테이블 모두 SELECT/UPDATE/DELETE에 대한 정책을 만들지 않았으므로
-- publishable key로는 등록(INSERT)만 가능하고 조회는 불가능합니다.
-- 운영자 본인이 데이터를 조회하려면 Supabase 대시보드의 Table Editor를 이용하세요.

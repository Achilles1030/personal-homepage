create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  nickname text,
  email text,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint feedback_nickname_length check (nickname is null or char_length(nickname) between 1 and 40),
  constraint feedback_email_length check (email is null or char_length(email) between 3 and 254),
  constraint feedback_email_format check (email is null or email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
  constraint feedback_message_length check (char_length(message) between 1 and 2000)
);

create table if not exists public.feedback_rate_limits (
  id bigint generated always as identity primary key,
  identifier_hash text not null,
  created_at timestamptz not null default now(),
  constraint feedback_rate_identifier_length check (char_length(identifier_hash) = 64)
);

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);
create index if not exists feedback_unread_created_at_idx on public.feedback (created_at desc) where is_read = false;
create index if not exists feedback_rate_limits_identifier_created_at_idx on public.feedback_rate_limits (identifier_hash, created_at desc);

alter table public.feedback enable row level security;
alter table public.feedback_rate_limits enable row level security;

revoke all on table public.feedback from anon, authenticated;
revoke all on table public.feedback_rate_limits from anon, authenticated;
revoke all on sequence public.feedback_rate_limits_id_seq from anon, authenticated;

grant select, update, delete on table public.feedback to authenticated;
grant select, insert, update, delete on table public.feedback to service_role;
grant select, insert, update, delete on table public.feedback_rate_limits to service_role;
grant usage, select on sequence public.feedback_rate_limits_id_seq to service_role;

create policy "no client access to feedback rate limits" on public.feedback_rate_limits
for all to anon, authenticated using (false) with check (false);

create policy "admin can read feedback" on public.feedback for select to authenticated
using (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'ADMIN_EMAIL@example.com');

create policy "admin can update feedback" on public.feedback for update to authenticated
using (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'ADMIN_EMAIL@example.com')
with check (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'ADMIN_EMAIL@example.com');

create policy "admin can delete feedback" on public.feedback for delete to authenticated
using (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'ADMIN_EMAIL@example.com');

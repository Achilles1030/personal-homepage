-- Run this once in the Supabase SQL Editor before deploying chat-achilles.
create table if not exists public.chat_rate_limits (
  id bigint generated always as identity primary key,
  identifier_hash text not null,
  created_at timestamptz not null default now(),
  constraint chat_rate_identifier_length check (char_length(identifier_hash) = 64)
);

create index if not exists chat_rate_limits_identifier_created_at_idx
  on public.chat_rate_limits (identifier_hash, created_at desc);

alter table public.chat_rate_limits enable row level security;
revoke all on table public.chat_rate_limits from anon, authenticated;
revoke all on sequence public.chat_rate_limits_id_seq from anon, authenticated;
grant select, insert, update, delete on table public.chat_rate_limits to service_role;
grant usage, select on sequence public.chat_rate_limits_id_seq to service_role;

create policy "no client access to chat rate limits"
  on public.chat_rate_limits
  for all to anon, authenticated
  using (false)
  with check (false);

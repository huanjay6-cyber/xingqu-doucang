create table if not exists public.user_app_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_app_data_updated_at on public.user_app_data;
create trigger set_user_app_data_updated_at
before update on public.user_app_data
for each row
execute function public.set_updated_at();

alter table public.user_app_data enable row level security;

drop policy if exists "Users can read own app data" on public.user_app_data;
create policy "Users can read own app data"
on public.user_app_data
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own app data" on public.user_app_data;
create policy "Users can insert own app data"
on public.user_app_data
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own app data" on public.user_app_data;
create policy "Users can update own app data"
on public.user_app_data
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own app data" on public.user_app_data;
create policy "Users can delete own app data"
on public.user_app_data
for delete
to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pattern-images',
  'pattern-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read own pattern images" on storage.objects;
create policy "Users can read own pattern images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'pattern-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can upload own pattern images" on storage.objects;
create policy "Users can upload own pattern images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'pattern-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can update own pattern images" on storage.objects;
create policy "Users can update own pattern images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'pattern-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'pattern-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can delete own pattern images" on storage.objects;
create policy "Users can delete own pattern images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'pattern-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

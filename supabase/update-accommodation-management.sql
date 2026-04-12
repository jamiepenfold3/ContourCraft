alter table if exists public.place_categories
  drop constraint if exists place_categories_key_check;

alter table if exists public.place_categories
  add constraint place_categories_key_check
  check (key in ('campsite', 'accommodation', 'trails', 'food', 'wineries', 'swim', 'strava'));

alter table if exists public.place_categories
  alter column heading_photo_name drop not null,
  alter column heading_photo_url drop not null;

alter table if exists public.places
  add column if not exists contact_email text;

create table if not exists public.place_favourites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

alter table public.place_favourites enable row level security;

drop policy if exists "users can view own favourites" on public.place_favourites;
create policy "users can view own favourites"
on public.place_favourites for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can insert own favourites" on public.place_favourites;
create policy "users can insert own favourites"
on public.place_favourites for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users can delete own favourites" on public.place_favourites;
create policy "users can delete own favourites"
on public.place_favourites for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "creators can update own places" on public.places;
create policy "creators can update own places"
on public.places for update
to authenticated
using (
  created_by = auth.uid()
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'creator'
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'creator'
  )
);

drop policy if exists "creators can delete own places" on public.places;
create policy "creators can delete own places"
on public.places for delete
to authenticated
using (
  created_by = auth.uid()
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'creator'
  )
);

drop policy if exists "creators can delete categories for own places" on public.place_categories;
create policy "creators can delete categories for own places"
on public.place_categories for delete
to authenticated
using (
  exists (
    select 1
    from public.places
    join public.profiles on profiles.id = auth.uid()
    where places.id = place_categories.place_id
      and places.created_by = auth.uid()
      and profiles.role = 'creator'
  )
);

drop policy if exists "public can view categories for visible places" on public.place_categories;
drop policy if exists "public can view categories" on public.place_categories;
create policy "public can view categories"
on public.place_categories for select
using (true);

drop policy if exists "public can view comments" on public.place_comments;
create policy "public can view comments"
on public.place_comments for select
using (true);

create index if not exists place_categories_place_id_idx
on public.place_categories(place_id);

create index if not exists place_comments_place_id_idx
on public.place_comments(place_id);

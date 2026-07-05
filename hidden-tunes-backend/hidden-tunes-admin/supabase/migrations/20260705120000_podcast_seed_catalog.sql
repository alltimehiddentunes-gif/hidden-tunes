-- Podcast seed catalog support: taxonomy gaps, episode GUID dedupe, feed URL uniqueness.

insert into public.podcast_categories (name, slug, sort_order)
values
  ('Science', 'science', 45),
  ('History', 'history', 55),
  ('Faith & Spirituality', 'faith', 65),
  ('Society', 'society', 72)
on conflict (slug) do nothing;

alter table public.podcast_episodes
  add column if not exists episode_guid text;

create unique index if not exists podcast_episodes_show_guid_unique
  on public.podcast_episodes (show_id, episode_guid)
  where episode_guid is not null;

create unique index if not exists podcast_shows_feed_url_unique
  on public.podcast_shows (feed_url)
  where feed_url is not null;

create index if not exists podcast_episodes_show_title_published_idx
  on public.podcast_episodes (show_id, title, published_at);

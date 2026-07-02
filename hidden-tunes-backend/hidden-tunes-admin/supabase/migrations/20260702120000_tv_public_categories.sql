-- Public TV browse categories (collection rails) + motivation subcategories.

insert into public.tv_categories (name, slug, type, sort_order)
values
  ('News', 'news', 'collection', 100),
  ('Sports', 'sports', 'collection', 110),
  ('Movies', 'movies', 'collection', 120),
  ('Entertainment', 'entertainment', 'collection', 130),
  ('Kids', 'kids', 'collection', 140),
  ('Documentary', 'documentary', 'collection', 150),
  ('Music TV', 'music-tv', 'collection', 160),
  ('Faith & Worship', 'faith-and-worship', 'collection', 170),
  ('Education', 'education', 'collection', 180),
  ('Lifestyle', 'lifestyle', 'collection', 190),
  ('Government', 'government', 'collection', 200),
  ('Africa', 'africa', 'collection', 210),
  ('Europe', 'europe', 'collection', 220),
  ('Americas', 'americas', 'collection', 230),
  ('Asia', 'asia', 'collection', 240),
  ('Local TV', 'local-tv', 'collection', 250),
  ('Motivation', 'motivation', 'collection', 260),
  ('Emotional Worlds', 'emotional-worlds', 'collection', 270),
  ('Motivational speeches', 'motivational-speeches', 'collection', 280),
  ('Self-improvement', 'self-improvement', 'collection', 290),
  ('Business motivation', 'business-motivation', 'collection', 300),
  ('Gym motivation', 'gym-motivation', 'collection', 310),
  ('Study motivation', 'study-motivation', 'collection', 320),
  ('Faith motivation', 'faith-motivation', 'collection', 330),
  ('Success stories', 'success-stories', 'collection', 340),
  ('Mindset', 'mindset', 'collection', 350),
  ('Discipline', 'discipline', 'collection', 360),
  ('Focus', 'focus', 'collection', 370)
on conflict (slug) do nothing;

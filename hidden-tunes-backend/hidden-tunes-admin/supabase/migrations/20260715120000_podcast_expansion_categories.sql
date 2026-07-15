-- Podcast mass expansion category taxonomy expansion.

insert into public.podcast_categories (name, slug, sort_order)
values
  ('Politics', 'politics', 18),
  ('Arts', 'arts', 28),
  ('Books', 'books', 38),
  ('Parenting', 'parenting', 48),
  ('Relationships', 'relationships', 58),
  ('Finance', 'finance', 68),
  ('Culture', 'culture', 78),
  ('Language Learning', 'language-learning', 88),
  ('Motivation', 'motivation', 98),
  ('Fitness', 'fitness', 108),
  ('Gaming', 'gaming', 118),
  ('Religion', 'religion', 128)
on conflict (slug) do nothing;

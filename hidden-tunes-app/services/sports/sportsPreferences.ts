/**
 * Local Sports preferences — isolated from Music/TV favorites.
 * Uses AsyncStorage until backend follow/favorites APIs are enabled.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  SportsFavorite,
  SportsFollowEntity,
  SportsFollowEntityType,
  SportsReminder,
} from "../../types/sports";
const FOLLOW_KEY = "hidden_tunes_sports_follows_v1";
const FAVORITES_KEY = "hidden_tunes_sports_favorites_v1";
const REMINDERS_KEY = "hidden_tunes_sports_reminders_v1";
const RECENT_SEARCH_KEY = "hidden_tunes_sports_recent_searches_v1";
const WATCH_LATER_KEY = "hidden_tunes_sports_watch_later_v1";
const MAX = 100;
async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed as T;
  } catch {
    return fallback;
  }
}
async function writeJson(key: string, value: unknown) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}
export async function getSportsFollows(): Promise<SportsFollowEntity[]> {
  const items = await readJson<SportsFollowEntity[]>(FOLLOW_KEY, []);
  return Array.isArray(items) ? items : [];
}
export async function isSportsFollowed(
  type: SportsFollowEntityType,
  id: string
): Promise<boolean> {
  const items = await getSportsFollows();
  return items.some((i) => i.type === type && i.id === id);
}
export async function followSportsEntity(
  entity: SportsFollowEntity
): Promise<SportsFollowEntity[]> {
  const items = await getSportsFollows();
  const filtered = items.filter(
    (i) => !(i.type === entity.type && i.id === entity.id)
  );
  filtered.unshift(entity);
  const next = filtered.slice(0, MAX);
  await writeJson(FOLLOW_KEY, next);
  return next;
}
export async function unfollowSportsEntity(
  type: SportsFollowEntityType,
  id: string
): Promise<SportsFollowEntity[]> {
  const items = await getSportsFollows();
  const next = items.filter((i) => !(i.type === type && i.id === id));
  await writeJson(FOLLOW_KEY, next);
  return next;
}
export async function getSportsFavorites(): Promise<SportsFavorite[]> {
  const items = await readJson<SportsFavorite[]>(FAVORITES_KEY, []);
  return Array.isArray(items) ? items : [];
}
export async function saveSportsFavorite(
  favorite: Omit<SportsFavorite, "savedAt">
): Promise<SportsFavorite[]> {
  const items = await getSportsFavorites();
  const nextItem: SportsFavorite = {
    ...favorite,
    savedAt: new Date().toISOString(),
  };
  const filtered = items.filter(
    (i) => !(i.kind === favorite.kind && i.id === favorite.id)
  );
  filtered.unshift(nextItem);
  const next = filtered.slice(0, MAX);
  await writeJson(FAVORITES_KEY, next);
  return next;
}
export async function removeSportsFavorite(
  kind: SportsFavorite["kind"],
  id: string
): Promise<SportsFavorite[]> {
  const items = await getSportsFavorites();
  const next = items.filter((i) => !(i.kind === kind && i.id === id));
  await writeJson(FAVORITES_KEY, next);
  return next;
}
export async function getSportsReminders(): Promise<SportsReminder[]> {
  const items = await readJson<SportsReminder[]>(REMINDERS_KEY, []);
  return Array.isArray(items) ? items : [];
}
export async function setSportsReminder(
  reminder: Omit<SportsReminder, "createdAt">
): Promise<SportsReminder[]> {
  const items = await getSportsReminders();
  const nextItem: SportsReminder = {
    ...reminder,
    createdAt: new Date().toISOString(),
  };
  const filtered = items.filter((i) => i.fixtureId !== reminder.fixtureId);
  filtered.unshift(nextItem);
  const next = filtered.slice(0, MAX);
  await writeJson(REMINDERS_KEY, next);
  return next;
}
export async function clearSportsReminder(
  fixtureId: string
): Promise<SportsReminder[]> {
  const items = await getSportsReminders();
  const next = items.filter((i) => i.fixtureId !== fixtureId);
  await writeJson(REMINDERS_KEY, next);
  return next;
}
export async function getSportsWatchLater(): Promise<SportsFavorite[]> {
  const items = await readJson<SportsFavorite[]>(WATCH_LATER_KEY, []);
  return Array.isArray(items) ? items : [];
}
export async function addSportsWatchLater(
  item: Omit<SportsFavorite, "savedAt">
): Promise<SportsFavorite[]> {
  const items = await getSportsWatchLater();
  const nextItem: SportsFavorite = {
    ...item,
    savedAt: new Date().toISOString(),
  };
  const filtered = items.filter(
    (i) => !(i.kind === item.kind && i.id === item.id)
  );
  filtered.unshift(nextItem);
  const next = filtered.slice(0, MAX);
  await writeJson(WATCH_LATER_KEY, next);
  return next;
}
export async function removeSportsWatchLater(
  kind: SportsFavorite["kind"],
  id: string
): Promise<SportsFavorite[]> {
  const items = await getSportsWatchLater();
  const next = items.filter((i) => !(i.kind === kind && i.id === id));
  await writeJson(WATCH_LATER_KEY, next);
  return next;
}
export async function getSportsRecentSearches(): Promise<string[]> {
  const items = await readJson<string[]>(RECENT_SEARCH_KEY, []);
  return Array.isArray(items) ? items.filter((s) => typeof s === "string") : [];
}
export async function pushSportsRecentSearch(query: string): Promise<string[]> {
  const q = query.trim();
  if (!q) return getSportsRecentSearches();
  const items = await getSportsRecentSearches();
  const next = [q, ...items.filter((i) => i.toLowerCase() !== q.toLowerCase())].slice(
    0,
    12
  );
  await writeJson(RECENT_SEARCH_KEY, next);
  return next;
}

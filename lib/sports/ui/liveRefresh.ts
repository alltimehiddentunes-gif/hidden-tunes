import type { SportsHomeSection, SportsMatchCard } from "../../../types/sports";

function renderedCardSignature(card: SportsMatchCard): string {
  const timing = card.timing
    ? { ...card.timing, providerUpdatedAt: undefined }
    : card.timing;
  return JSON.stringify({ ...card, timing });
}

function reuseUnchangedCards(
  current: SportsMatchCard[],
  incoming: SportsMatchCard[]
): SportsMatchCard[] {
  const currentById = new Map(current.map((card) => [card.id, card]));
  return incoming.map((next) => {
    const previous = currentById.get(next.id);
    if (!previous) return next;
    return renderedCardSignature(previous) === renderedCardSignature(next)
      ? previous
      : next;
  });
}

function sameItemIdentities(a: unknown[], b: unknown[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * Reconcile only lifecycle-sensitive fixture shelves. Unchanged card objects are
 * retained so memoized cards do not rerender merely because provider freshness
 * advanced without a score/minute/status change.
 */
export function mergeSportsLiveState(
  sections: SportsHomeSection[],
  live: SportsMatchCard[],
  finished: SportsMatchCard[]
): SportsHomeSection[] {
  const liveIds = new Set(live.map((card) => card.id));
  const finishedIds = new Set(finished.map((card) => card.id));
  let sawLive = false;
  let sawFinished = false;
  const next = sections.map((section) => {
    if (section.id === "live_now") {
      sawLive = true;
      const items = reuseUnchangedCards(
        (section.items || []) as SportsMatchCard[],
        live
      );
      return sameItemIdentities(section.items || [], items)
        ? section
        : { ...section, items };
    }
    if (section.id === "recently_finished") {
      sawFinished = true;
      const items = reuseUnchangedCards(
        (section.items || []) as SportsMatchCard[],
        finished
      );
      return sameItemIdentities(section.items || [], items)
        ? section
        : { ...section, items };
    }
    if (section.type !== "fixtures" && section.type !== "live") return section;
    const items = (section.items || []).filter((item) => {
      const id = String((item as SportsMatchCard)?.id || "");
      return !liveIds.has(id) && !finishedIds.has(id);
    });
    return items.length === (section.items || []).length
      ? section
      : { ...section, items };
  });

  if (!sawLive) {
    next.push({
      id: "live_now",
      type: "live",
      title: "Live Now",
      subtitle: live.length ? undefined : "No confirmed live events right now",
      rank: 10,
      items: live,
    });
  }
  if (!sawFinished && finished.length) {
    next.push({
      id: "recently_finished",
      type: "fixtures",
      title: "Recently Finished",
      rank: 110,
      items: finished,
    });
  }
  return next.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
}

import type { DistributionSummary } from "./types";

type Gap = { from: string; to: string; note: string };
type Window = { from: number; to: number };
const DAY = 86_400_000;
function timestamp(value: string): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))
    throw new Error("Collection coverage requires valid UTC timestamps.");
  const result = Date.parse(value);
  if (!Number.isFinite(result) || new Date(result).toISOString().slice(0, 19) !== value.slice(0, 19))
    throw new Error("Collection coverage requires valid UTC timestamps.");
  return result;
}
function window(value: { from: string; to: string }, allowEmpty = false): Window {
  const from = timestamp(value.from), to = timestamp(value.to);
  if (to < from || (!allowEmpty && to === from)) throw new Error("Collection coverage requires a nonempty increasing interval.");
  return { from, to };
}
function overlaps(left: Window, right: Window): boolean {
  return left.from < left.to && right.from < right.to && left.from < right.to && right.from < left.to;
}
function websiteMetric(value: string): boolean {
  return value === "page_view" || value === "cta_click" || value === "command_copy"
    || value === "install_link_open" || value.startsWith("share_");
}
function append(note: string, additions: string[]): string {
  return additions.reduce((result, text) => result.includes(text) ? result : [result, text].filter(Boolean).join(" "), note);
}

/** Known collection outages remove false zeroes/comparisons; positive observations remain.
 * Static metadata is validated before returning anything, so invalid gaps fail closed.
 * Artifact/provider evidence and all input objects remain unchanged.
 */
export function applyCollectionCoverage(summary: DistributionSummary, gaps: Gap[]): DistributionSummary {
  const intervals = gaps.map(gap => {
    if (typeof gap.note !== "string" || !gap.note.trim()) throw new Error("Collection coverage gaps require an explanatory note.");
    return { ...window(gap), note: "Collection gap (" + gap.from + " to " + gap.to + ", exclusive): " + gap.note.trim() };
  });
  const current = window(summary.range, true);
  const prior = summary.previous ? window(summary.previous, true) : null;
  const currentGaps = intervals.filter(gap => overlaps(current, gap));
  const priorGaps = prior ? intervals.filter(gap => overlaps(prior, gap)) : [];
  const result = structuredClone(summary);
  if (!currentGaps.length && !priorGaps.length) return result;

  const totals = result.totals as Record<string, number | null>;
  const changes = result.changes as Record<string, number | null>;
  const coverage = result.metricCoverage as Record<string, { complete: boolean; note: string }>;
  const currentNotes = currentGaps.map(gap => gap.note);
  const priorNotes = priorGaps.map(gap => "Previous comparable period: " + gap.note);
  const keys = new Set([...Object.keys(totals), ...Object.keys(coverage), ...Object.keys(changes)]);
  for (const metric of keys) {
    if (!websiteMetric(metric)) continue;
    changes[metric] = null;
    if (currentGaps.length) {
      if (totals[metric] === 0) totals[metric] = null;
      const existing = coverage[metric] || { complete: false, note: "" };
      coverage[metric] = { complete: false, note: append(existing.note, [...currentNotes, ...priorNotes]) };
    } else if (coverage[metric]) {
      coverage[metric].note = append(coverage[metric].note, priorNotes);
    }
  }
  if (currentGaps.length) {
    for (const point of result.trend) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(point.date)) throw new Error("Collection coverage received an invalid trend date.");
      const start = timestamp(point.date + "T00:00:00Z");
      const day = { from: Math.max(start, current.from), to: Math.min(start + DAY, current.to) };
      if (!currentGaps.some(gap => overlaps(day, gap))) continue;
      const values = point as unknown as Record<string, unknown>;
      for (const metric of Object.keys(values)) if (websiteMetric(metric) && values[metric] === 0) values[metric] = null;
    }
  }
  for (const source of result.sources) {
    if (source.id === "website" || source.id === "website_sharing")
      source.note = append(source.note, [...currentNotes, ...priorNotes]);
  }
  return result;
}

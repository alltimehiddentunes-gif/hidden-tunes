import type { RadioExpansionQuery } from "@/lib/radioExpansion25k/sourceQueries";
import type { AfricanCountry } from "@/lib/radioAfricaExpansion/africanCountries";

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "");
}

/**
 * Deep Radio Browser query pack for one African country.
 * Exhaust countrycode walks first, then state/city/tag/language recall.
 */
export function buildAfricaCountryQueries(country: AfricanCountry): RadioExpansionQuery[] {
  const queries: RadioExpansionQuery[] = [];
  const code = country.code.toUpperCase();

  queries.push(
    {
      key: `africa:${code}:country:votes`,
      kind: "country",
      value: code,
      categorySlug: "global",
      priority: 1,
    },
    {
      key: `africa:${code}:country:votes_asc`,
      kind: "country_votes_asc",
      value: code,
      categorySlug: "global",
      priority: 1,
    },
    {
      key: `africa:${code}:country:clicks`,
      kind: "country_clicks",
      value: code,
      categorySlug: "global",
      priority: 1,
    },
    {
      key: `africa:${code}:country:lastcheck`,
      kind: "country_lastcheck",
      value: code,
      categorySlug: "global",
      priority: 1,
    },
    {
      key: `africa:${code}:country:include_broken`,
      kind: "country_include_broken",
      value: code,
      categorySlug: "global",
      priority: 2,
    }
  );

  queries.push({
    key: `africa:${code}:country_name:${slug(country.name)}`,
    kind: "country_name",
    value: country.name,
    categorySlug: "global",
    priority: 1,
  });

  for (const alias of country.aliases || []) {
    queries.push({
      key: `africa:${code}:country_name:${slug(alias)}`,
      kind: "country_name",
      value: alias,
      categorySlug: "global",
      priority: 2,
    });
  }

  for (const state of country.states || []) {
    queries.push({
      key: `africa:${code}:state:${slug(state)}`,
      kind: "state",
      value: `${code}|${state}`,
      categorySlug: "global",
      priority: 1,
    });
  }

  for (const city of country.cities || []) {
    queries.push(
      {
        key: `africa:${code}:name:${slug(city)}`,
        kind: "name",
        value: city,
        categorySlug: "local",
        priority: 1,
      },
      {
        key: `africa:${code}:combo:city-${slug(city)}`,
        kind: "combo",
        value: `${code}|${city}`,
        categorySlug: "local",
        priority: 2,
      }
    );
  }

  for (const tag of country.tags || []) {
    queries.push({
      key: `africa:${code}:combo:tag-${slug(tag)}`,
      kind: "combo",
      value: `${code}|${tag}`,
      categorySlug: tag.toLowerCase().includes("gospel")
        ? "gospel"
        : tag.toLowerCase().includes("news")
          ? "news"
          : "global",
      priority: 1,
    });
  }

  for (const language of country.languages || []) {
    // Bound language recall with countrycode via combo-style search is not a
    // first-class kind; use country_name + language tag through name terms instead.
    queries.push({
      key: `africa:${code}:name-lang:${slug(language)}`,
      kind: "name",
      value: language,
      categorySlug: "global",
      priority: 3,
    });
  }

  // Broadcaster / format recall by name within country branding.
  for (const term of [
    country.name,
    `${country.name} FM`,
    `${country.name} Radio`,
    "community radio",
    "campus radio",
    "university radio",
    "gospel radio",
    "islamic radio",
    "news radio",
  ]) {
    queries.push({
      key: `africa:${code}:name-term:${slug(term)}`,
      kind: "name",
      value: term,
      categorySlug: "global",
      priority: 3,
    });
  }

  return queries;
}

import type { RadioExpansionQuery } from "@/lib/radioExpansion25k/sourceQueries";
import type { WorldwideRadioCountry } from "@/lib/radioWorldwideExpansion/types";

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "");
}

/**
 * Deep Radio Browser query pack for one worldwide country.
 * Same pattern as Africa, but keys are prefixed with the continent id.
 */
export function buildContinentCountryQueries(
  continent: string,
  country: WorldwideRadioCountry
): RadioExpansionQuery[] {
  const queries: RadioExpansionQuery[] = [];
  const code = country.code.toUpperCase();
  const prefix = continent.trim().toLowerCase() || country.continent;

  queries.push(
    {
      key: `${prefix}:${code}:country:votes`,
      kind: "country",
      value: code,
      categorySlug: "global",
      priority: 1,
    },
    {
      key: `${prefix}:${code}:country:votes_asc`,
      kind: "country_votes_asc",
      value: code,
      categorySlug: "global",
      priority: 1,
    },
    {
      key: `${prefix}:${code}:country:clicks`,
      kind: "country_clicks",
      value: code,
      categorySlug: "global",
      priority: 1,
    },
    {
      key: `${prefix}:${code}:country:lastcheck`,
      kind: "country_lastcheck",
      value: code,
      categorySlug: "global",
      priority: 1,
    },
    {
      key: `${prefix}:${code}:country:include_broken`,
      kind: "country_include_broken",
      value: code,
      categorySlug: "global",
      priority: 2,
    }
  );

  queries.push({
    key: `${prefix}:${code}:country_name:${slug(country.name)}`,
    kind: "country_name",
    value: country.name,
    categorySlug: "global",
    priority: 1,
  });

  for (const alias of country.aliases || []) {
    queries.push({
      key: `${prefix}:${code}:country_name:${slug(alias)}`,
      kind: "country_name",
      value: alias,
      categorySlug: "global",
      priority: 2,
    });
  }

  for (const state of country.states || []) {
    queries.push({
      key: `${prefix}:${code}:state:${slug(state)}`,
      kind: "state",
      value: `${code}|${state}`,
      categorySlug: "global",
      priority: 1,
    });
  }

  for (const city of country.cities || []) {
    queries.push(
      {
        key: `${prefix}:${code}:name:${slug(city)}`,
        kind: "name",
        value: city,
        categorySlug: "local",
        priority: 1,
      },
      {
        key: `${prefix}:${code}:combo:city-${slug(city)}`,
        kind: "combo",
        value: `${code}|${city}`,
        categorySlug: "local",
        priority: 2,
      }
    );
  }

  for (const tag of country.tags || []) {
    queries.push({
      key: `${prefix}:${code}:combo:tag-${slug(tag)}`,
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
    queries.push({
      key: `${prefix}:${code}:name-lang:${slug(language)}`,
      kind: "name",
      value: language,
      categorySlug: "global",
      priority: 3,
    });
  }

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
      key: `${prefix}:${code}:name-term:${slug(term)}`,
      kind: "name",
      value: term,
      categorySlug: "global",
      priority: 3,
    });
  }

  return queries;
}

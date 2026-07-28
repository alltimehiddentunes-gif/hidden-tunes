import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  applyPublicRadioFilters,
  buildRadioTextSearchOrFilter,
  softenRadioSearchQuery,
} from "../lib/radioPublicCatalog";
import { buildAfricaCountryQueries } from "../lib/radioAfricaExpansion/countryQueries";
import {
  AFRICA_RADIO_QUEUE,
  getAfricanCountry,
} from "../lib/radioAfricaExpansion/africanCountries";
import {
  africaQueuePath,
  loadAfricaRadioQueue,
  saveAfricaRadioQueue,
} from "../lib/radioAfricaExpansion/queue";

type FakeQuery = {
  eqs: Array<[string, unknown]>;
  ors: string[];
  eq(column: string, value: unknown): FakeQuery;
  is(column: string, value: unknown): FakeQuery;
  gte(column: string, value: unknown): FakeQuery;
  or(filters: string): FakeQuery;
  ilike(column: string, pattern: string): FakeQuery;
};

function fakeQuery(): FakeQuery {
  const q: FakeQuery = {
    eqs: [],
    ors: [],
    eq(column, value) {
      this.eqs.push([column, value]);
      return this;
    },
    is() {
      return this;
    },
    gte() {
      return this;
    },
    or(filters) {
      this.ors.push(filters);
      return this;
    },
    ilike() {
      return this;
    },
  };
  return q;
}

function main() {
  // ISO alpha-2 must use exact country_code equality (no %GH% pollution).
  const iso = fakeQuery();
  applyPublicRadioFilters(iso, { country: "GH" });
  assert.ok(iso.eqs.some(([col, val]) => col === "country_code" && val === "GH"));
  assert.equal(iso.ors.filter((o) => o.includes("country.ilike.%GH%")).length, 0);

  const ng = fakeQuery();
  applyPublicRadioFilters(ng, { country: "ng" });
  assert.ok(ng.eqs.some(([col, val]) => col === "country_code" && val === "NG"));

  // Full country names still use name/code OR filter.
  const named = fakeQuery();
  applyPublicRadioFilters(named, { country: "Ghana" });
  assert.ok(named.ors.some((o) => o.includes("country.ilike.%Ghana%")));
  assert.equal(named.eqs.filter(([col]) => col === "country_code").length, 0);

  assert.equal(softenRadioSearchQuery("Sex Sounds"), "Sex Sound");
  assert.ok(buildRadioTextSearchOrFilter("oyerepa"));

  assert.equal(AFRICA_RADIO_QUEUE[0].code, "GH");
  assert.equal(AFRICA_RADIO_QUEUE[1].code, "NG");
  assert.ok(AFRICA_RADIO_QUEUE.length >= 50);
  assert.ok(getAfricanCountry("GH"));
  assert.ok(getAfricanCountry("NG"));

  const ghQueries = buildAfricaCountryQueries(getAfricanCountry("GH")!);
  assert.ok(ghQueries.some((q) => q.kind === "country" && q.value === "GH"));
  assert.ok(ghQueries.some((q) => q.kind === "name" && q.value === "Accra"));
  assert.ok(ghQueries.some((q) => q.kind === "state" && String(q.value).includes("Ashanti")));

  const ngQueries = buildAfricaCountryQueries(getAfricanCountry("NG")!);
  assert.ok(ngQueries.some((q) => q.kind === "state" && String(q.value).includes("Lagos")));
  assert.ok(ngQueries.filter((q) => q.kind === "state").length >= 20);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ht-africa-queue-"));
  const state = loadAfricaRadioQueue(tmp);
  assert.equal(state.countries.length, AFRICA_RADIO_QUEUE.length);
  saveAfricaRadioQueue(tmp, state);
  assert.ok(fs.existsSync(africaQueuePath(tmp)));

  console.log("test-radio-africa-country-filter: ok");
}

main();

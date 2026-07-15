import assert from "node:assert/strict";

import {
  isKnownCountryCode,
  normalizeWave4CountryCode,
} from "../lib/tvExpansion25k/worldwide/countryCodes";

function testValidIsoCode() {
  assert.equal(normalizeWave4CountryCode("us"), "US");
  assert.equal(normalizeWave4CountryCode("gb"), "GB");
  assert.ok(isKnownCountryCode("FR"));
}

function testLowercaseNormalization() {
  assert.equal(normalizeWave4CountryCode("de"), "DE");
  assert.equal(normalizeWave4CountryCode("  fr  "), "FR");
}

function testUnknownCountry() {
  assert.equal(normalizeWave4CountryCode("ZZ"), null);
  assert.equal(normalizeWave4CountryCode(""), null);
}

function testInvalidCountryCode() {
  assert.equal(normalizeWave4CountryCode("United States"), null);
  assert.equal(normalizeWave4CountryCode("123"), null);
}

function testTerritoryCode() {
  assert.equal(normalizeWave4CountryCode("PR"), "PR");
  assert.equal(normalizeWave4CountryCode("xk"), "XK");
}

function testMissingCountryWithFallback() {
  assert.equal(normalizeWave4CountryCode(null, "ca"), "CA");
  assert.equal(normalizeWave4CountryCode(undefined, "au"), "AU");
}

testValidIsoCode();
testLowercaseNormalization();
testUnknownCountry();
testInvalidCountryCode();
testTerritoryCode();
testMissingCountryWithFallback();

console.log(JSON.stringify({ ok: true, tests: 6 }, null, 2));

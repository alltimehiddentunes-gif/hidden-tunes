export const RADIO_EXPANSION_BATCH3_NAME = "radio-general-batch3";
export const RADIO_EXPANSION_BATCH4_NAME = "radio-general-batch4";
export const RADIO_EXPANSION_BATCH5_NAME = "radio-general-batch5";
export const RADIO_EXPANSION_BATCH6_NAME = "radio-general-batch6";
export const RADIO_EXPANSION_BATCH7_NAME = "radio-general-batch7";
/** Wave 1 — geographic coverage repair toward 40k public eligible. */
export const RADIO_EXPANSION_BATCH8_NAME = "radio-general-batch8";
/** Wave 2 — regional / secondary-city depth. */
export const RADIO_EXPANSION_BATCH9_NAME = "radio-general-batch9";
/** Wave 3 — language / community / university depth. */
export const RADIO_EXPANSION_BATCH10_NAME = "radio-general-batch10";
/** Wave 4 — gap closure. */
export const RADIO_EXPANSION_BATCH11_NAME = "radio-general-batch11";
/** Wave 5 — worldwide city / capital depth. */
export const RADIO_EXPANSION_BATCH12_NAME = "radio-general-batch12";
/** Wave 6 — regional name + country×tag depth. */
export const RADIO_EXPANSION_BATCH13_NAME = "radio-general-batch13";
/** Wave 7 — codec/bitrate/language gap closure. */
export const RADIO_EXPANSION_BATCH14_NAME = "radio-general-batch14";
/** Wave 8 — deep global pagination. */
export const RADIO_EXPANSION_BATCH15_NAME = "radio-general-batch15";
/** Wave 9 — country long-tail orderings + state depth. */
export const RADIO_EXPANSION_BATCH16_NAME = "radio-general-batch16";
/** Wave 10 — include RB hidebroken=false long tail. */
export const RADIO_EXPANSION_BATCH17_NAME = "radio-general-batch17";
/** Wave 11 — deep worldwide country include-broken + obscure orderings. */
export const RADIO_EXPANSION_BATCH18_NAME = "radio-general-batch18";
/** Wave 12 — country clicks/lastcheck + tag/language include-broken depth. */
export const RADIO_EXPANSION_BATCH19_NAME = "radio-general-batch19";

export function radioExpansionBatchPaths(adminRoot: string, batchName: string) {
  return {
    candidates: `${adminRoot}/data/${batchName}-candidates.json`,
    result: `${adminRoot}/data/${batchName}-result.json`,
    verificationCheckpoint: `${adminRoot}/data/${batchName}-verification-checkpoint.json`,
    verificationResult: `${adminRoot}/data/${batchName}-verification-result.json`,
    resumeResult: `${adminRoot}/data/${batchName}-resume-result.json`,
  };
}

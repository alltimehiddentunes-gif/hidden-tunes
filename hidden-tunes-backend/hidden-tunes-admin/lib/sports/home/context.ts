/**
 * Sports home request context — Phase 2C.
 */

import type { SportsPreferenceProfile } from "../personalization/types";
import type { SportsHomeLimits } from "./limits";

export type SportsHomeContext = {
  userId?: string | null;
  timezone: string;
  locale?: string;
  preferenceProfile?: SportsPreferenceProfile | null;
  personalizationEnabled: boolean;
  country?: string;
  platform?: string;
  limits?: SportsHomeLimits;
};

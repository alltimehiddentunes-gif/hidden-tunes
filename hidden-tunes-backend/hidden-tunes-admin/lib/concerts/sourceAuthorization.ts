import {
  CONCERT_AUTHORIZATION_BASES,
  CONCERT_EMBED_POLICIES,
  CONCERT_ENABLEABLE_AUTHORIZATION,
  CONCERT_IMPORTABLE_EMBED_POLICIES,
  type ConcertAuthorizationBasis,
  type ConcertEmbedPolicy,
  type ConcertSourceSeed,
} from "./types";

export function isConcertAuthorizationBasis(
  value: string
): value is ConcertAuthorizationBasis {
  return (CONCERT_AUTHORIZATION_BASES as readonly string[]).includes(value);
}

export function isConcertEmbedPolicy(value: string): value is ConcertEmbedPolicy {
  return (CONCERT_EMBED_POLICIES as readonly string[]).includes(value);
}

export function isEnableableConcertAuthorization(
  value: ConcertAuthorizationBasis
): boolean {
  return (CONCERT_ENABLEABLE_AUTHORIZATION as readonly string[]).includes(value);
}

export function isImportableConcertEmbedPolicy(value: ConcertEmbedPolicy): boolean {
  return (CONCERT_IMPORTABLE_EMBED_POLICIES as readonly string[]).includes(value);
}

/**
 * Ownership ≠ public availability ≠ embed permission ≠ in-app playback.
 */
export function evaluateConcertSourceAuthorization(source: {
  authorizationBasis: ConcertAuthorizationBasis;
  embedPolicy: ConcertEmbedPolicy;
  enabled: boolean;
  importEnabled: boolean;
}) {
  const canEnable = isEnableableConcertAuthorization(source.authorizationBasis);
  const canImport =
    canEnable &&
    source.enabled &&
    isImportableConcertEmbedPolicy(source.embedPolicy);

  const inAppPlaybackPermitted =
    canImport &&
    (source.embedPolicy === "official_embed_allowed" ||
      source.embedPolicy === "provider_player_required");

  const externalLinkOnly = source.embedPolicy === "external_link_only";
  const blocked =
    source.authorizationBasis === "unclear" ||
    source.authorizationBasis === "denied" ||
    source.embedPolicy === "unknown" ||
    source.embedPolicy === "prohibited";

  return {
    canEnable,
    canImport,
    inAppPlaybackPermitted,
    externalLinkOnly,
    blocked,
    enabledAllowed: canEnable && !blocked,
    importAllowed: canImport && !externalLinkOnly && !blocked,
    requestedEnabledOk: !source.enabled || (canEnable && !blocked),
    requestedImportOk:
      !source.importEnabled ||
      (canImport && !externalLinkOnly && source.embedPolicy !== "unknown"),
  };
}

export function assertConcertSourceAuthorizationFlags(source: ConcertSourceSeed): string[] {
  const errors: string[] = [];
  const evaluation = evaluateConcertSourceAuthorization(source);

  if (source.enabled && !evaluation.requestedEnabledOk) {
    errors.push(
      `Source ${source.stableKey} cannot be enabled with authorization=${source.authorizationBasis} embed=${source.embedPolicy}`
    );
  }
  if (source.importEnabled && !evaluation.requestedImportOk) {
    errors.push(
      `Source ${source.stableKey} cannot be import-enabled with authorization=${source.authorizationBasis} embed=${source.embedPolicy}`
    );
  }
  if (source.embedPolicy === "external_link_only" && source.importEnabled) {
    errors.push(
      `Source ${source.stableKey}: external_link_only must not be import-enabled for playable content`
    );
  }
  if (
    (source.embedPolicy === "unknown" || source.embedPolicy === "prohibited") &&
    (source.enabled || source.importEnabled)
  ) {
    errors.push(
      `Source ${source.stableKey}: unknown/prohibited embed policy must remain disabled and non-importable`
    );
  }
  if (
    (source.authorizationBasis === "unclear" || source.authorizationBasis === "denied") &&
    source.enabled
  ) {
    errors.push(
      `Source ${source.stableKey}: unclear/denied authorization must always remain disabled`
    );
  }

  return errors;
}

/**
 * Pure layout/session contracts for the expanded TV player UI.
 * Visual success still requires device review; these guards prevent regressions.
 */

export type TvPresentationLayoutMode = "fullPlayer" | "floating" | "closed";

export function isExpandedTvPlayerMode(
  mode: TvPresentationLayoutMode
): boolean {
  return mode === "fullPlayer";
}

export function isBottomFloatingTvPlayerMode(
  mode: TvPresentationLayoutMode
): boolean {
  return mode === "floating";
}

export function resolveTvBackVersusCloseActions() {
  return {
    back: "leave_expanded_preserve_session" as const,
    close: "stop_or_clear_tv_session" as const,
    distinct: true as const,
    backClearsSession: false as const,
  };
}

/** Portrait expanded player: bounded 16:9 stage, not flex-fill. */
export function resolveExpandedTvVideoLayoutPolicy() {
  return {
    widthMode: "available_width" as const,
    heightMode: "bounded_sixteen_by_nine" as const,
    contentFit: "contain" as const,
    usesFixedDeviceScreenDimensions: false as const,
    usesFixedSixteenByNineBand: true as const,
    usesFlexFillVideoStage: false as const,
    fakePipSideArrow: false as const,
    standalonePipFooter: false as const,
    integratedPipInTransportRow: true as const,
  };
}

export function assertExclusiveTvSurfaces(input: {
  nativeMounted: boolean;
  webViewMounted: boolean;
}): "exclusive" | "conflict" {
  if (input.nativeMounted && input.webViewMounted) return "conflict";
  return "exclusive";
}

export function resolveTvPipWiringContract() {
  return {
    manualStartMethod: "startPictureInPicture" as const,
    automaticProp: "startsPictureInPictureAutomatically" as const,
    samePlayerOwner: true as const,
  };
}

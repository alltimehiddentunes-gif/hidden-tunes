import {
  AUDIOBOOK_MATURE_MILESTONE_TARGET,
} from "@/lib/audiobookExpansionConstants";
import {
  runAudiobookExpansionBatch,
  runAudiobookExpansionLoop,
  type AudiobookExpansionBatchReport,
  type AudiobookExpansionRunOptions,
} from "@/lib/audiobookExpansionRunner";

export type MatureAudiobookExpansionOptions = Omit<
  AudiobookExpansionRunOptions,
  "lane" | "target"
> & {
  target?: number;
};

export async function runMatureAudiobookExpansionBatch(
  options: MatureAudiobookExpansionOptions = {}
): Promise<AudiobookExpansionBatchReport> {
  return runAudiobookExpansionBatch({
    ...options,
    lane: "mature",
    target: options.target || AUDIOBOOK_MATURE_MILESTONE_TARGET,
  });
}

export async function runMatureAudiobookExpansionLoop(
  options: MatureAudiobookExpansionOptions = {}
) {
  return runAudiobookExpansionLoop({
    ...options,
    lane: "mature",
    target: options.target || AUDIOBOOK_MATURE_MILESTONE_TARGET,
  });
}

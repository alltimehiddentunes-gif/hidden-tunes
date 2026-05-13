export async function PlaybackService() {
  console.log("TrackPlayer PlaybackService disabled in Expo Go.");
}

export async function setupTrackPlayer() {
  console.log("TrackPlayer setup skipped. Using expo-av for now.");
}

export async function resetTrackPlayer() {
  console.log("TrackPlayer reset skipped.");
}

export async function addTrackToPlayer(_track: any) {
  console.log("TrackPlayer add skipped.");
}

export async function playTrackPlayer() {
  console.log("TrackPlayer play skipped.");
}

export async function pauseTrackPlayer() {
  console.log("TrackPlayer pause skipped.");
}

export async function stopTrackPlayer() {
  console.log("TrackPlayer stop skipped.");
}

export default {
  PlaybackService,
  setupTrackPlayer,
  resetTrackPlayer,
  addTrackToPlayer,
  playTrackPlayer,
  pauseTrackPlayer,
  stopTrackPlayer,
};
/**
 * Hidden Tunes entry - Android & iOS
 *
 * DAILY ANDROID TESTING (standalone APK, no Metro):
 *   npm run build:preview:android
 *
 * NATIVE / INSTANT RELOAD (dev client + Metro):
 *   npm run start:dev-client:tunnel
 *   npm run build:dev-client:android  (first time / native changes)
 *
 * EXPO GO (either platform):
 *   Native modules are unavailable in Expo Go.
 *   Use only for quick UI checks, not playback QA.
 */

require("react-native-gesture-handler");

require("expo-router/entry");

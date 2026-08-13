import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const authScreen = read("app/auth.tsx");
const resetPasswordScreen = read("app/reset-password.tsx");
const authCallbackScreen = read("app/auth-callback.tsx");
const artistProfile = read("app/artist/[id].tsx");
const creatorScreen = read("app/artist-submissions.tsx");
const authService = read("services/mobileSupabaseAuth.ts");
const followService = read("services/artistProfileApi.ts");

assert.match(authScreen, /signInWithPassword/);
assert.match(authScreen, /signUpWithPassword/);
assert.match(authScreen, /Forgot password\?/);
assert.match(authScreen, /requestPasswordReset/);
assert.match(authScreen, /requestMagicLink/);
assert.match(authScreen, /Send me a sign-in link/);
assert.doesNotMatch(authScreen, /Continue with Google|Continue with Apple/);
assert.doesNotMatch(authScreen, /router\.replace\("\/music-feed"\)/);
assert.match(authService, /let cachedClient: SupabaseClient \| null = null/);
assert.equal((authService.match(/createClient\(/g) || []).length, 1);
assert.match(authService, /persistSession:\s*true/);
assert.match(authService, /autoRefreshToken:\s*true/);
assert.match(authService, /clearCachedArtistFollowStates\(\)/);
assert.match(authService, /resetPasswordForEmail\(email\.trim\(\)/);
assert.match(authService, /redirectTo:\s*"hiddentunes:\/\/reset-password"/);
assert.match(authService, /exchangeCodeForSession\(code\)/);
assert.match(authService, /params\.get\("type"\) !== "recovery"/);
assert.match(authService, /supabase\.auth\.updateUser\(\{ password \}\)/);
assert.match(authService, /signInWithOtp/);
assert.match(authService, /emailRedirectTo:\s*"hiddentunes:\/\/auth-callback"/);
assert.equal((authService.match(/onAuthStateChange\(/g) || []).length, 1);
assert.match(authService, /PENDING_AUTH_RETURN_KEY/);
assert.match(authService, /path\.startsWith\("\/"\) && !path\.startsWith\("\/\/"\)/);
assert.doesNotMatch(authService, /service[_-]?role/i);
assert.match(resetPasswordScreen, /establishPasswordRecoverySession/);
assert.match(resetPasswordScreen, /password\.length < 8/);
assert.match(resetPasswordScreen, /password !== confirmation/);
assert.doesNotMatch(resetPasswordScreen, /AsyncStorage|console\.(?:log|debug|info)/);
assert.match(authCallbackScreen, /establishAuthCallbackSession/);
assert.match(authCallbackScreen, /consumePendingAuthReturn/);
assert.doesNotMatch(authCallbackScreen, /console\.(?:log|debug|info)|access_token|refresh_token/);

assert.match(artistProfile, /pathname:\s*"\/auth"/);
assert.doesNotMatch(artistProfile, /onPress:\s*\(\) => router\.push\("\/artist-submissions"/);
assert.match(artistProfile, /followArtistProfile\(artistUuid/);
assert.match(followService, /clearCachedArtistFollowStates/);

assert.doesNotMatch(creatorScreen, /signInWithPassword|signInArtistWithPassword/);
assert.doesNotMatch(creatorScreen, /secureTextEntry/);
assert.match(creatorScreen, /Sign in to Hidden Tunes/);
assert.match(creatorScreen, /Artist claiming and publishing remain disabled/);

console.log("Mobile canonical auth boundary contracts passed.");

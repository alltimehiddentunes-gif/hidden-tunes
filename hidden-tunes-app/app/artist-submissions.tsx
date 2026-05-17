import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import { COLORS, GRADIENTS } from "../constants/theme";
import {
  getCurrentSupabaseAccessToken,
  getCurrentSupabaseSessionSummary,
  signInArtistWithPassword,
  signOutArtistSession,
} from "../services/mobileSupabaseAuth";

type IconName = keyof typeof Ionicons.glyphMap;

type ArtistSubmissionStatus =
  | "draft"
  | "pending_review"
  | "needs_changes"
  | "approved"
  | "rejected";

type ArtistSubmission = {
  id: string;
  title: string;
  artist_name: string;
  status: ArtistSubmissionStatus | string;
  admin_notes?: string | null;
  submitted_at: string | null;
  reviewed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type SubmissionState = {
  title: string;
  description: string;
  countLabel: string;
  icon: IconName;
  accent: string;
};

const SUBMISSION_STATES: SubmissionState[] = [
  {
    title: "Drafts",
    description: "Prepare songs, artwork, credits, and release notes before review.",
    countLabel: "0 drafts",
    icon: "create",
    accent: COLORS.primary,
  },
  {
    title: "Pending Review",
    description: "Submissions waiting for the Hidden Tunes review team.",
    countLabel: "0 pending",
    icon: "hourglass",
    accent: "#f59e0b",
  },
  {
    title: "Needs Changes",
    description: "Review feedback will appear here so artists can edit and resubmit.",
    countLabel: "0 updates",
    icon: "construct",
    accent: "#22d3ee",
  },
  {
    title: "Approved Releases",
    description: "Approved music will move here before any publishing workflow expands.",
    countLabel: "0 approved",
    icon: "checkmark-done",
    accent: "#22c55e",
  },
  {
    title: "Rejected",
    description: "Declined submissions remain visible with review context in a later phase.",
    countLabel: "0 rejected",
    icon: "close-circle",
    accent: "#ef4444",
  },
];

const ARTIST_SUBMISSIONS_API_URL =
  "https://admin.hiddentunes.com/api/artist-submissions";

const STATUS_COPY: Record<
  ArtistSubmissionStatus,
  { label: string; description: string; accent: string }
> = {
  draft: {
    label: "Draft",
    description: "Saved for later. Submit when the release details are ready.",
    accent: COLORS.textMuted,
  },
  pending_review: {
    label: "Pending Review",
    description: "Hidden Tunes is reviewing this submission.",
    accent: "#f59e0b",
  },
  needs_changes: {
    label: "Needs Changes",
    description: "Review feedback is available. Editing opens in a later phase.",
    accent: "#22d3ee",
  },
  approved: {
    label: "Approved",
    description: "Approved for a future admin-controlled publishing workflow.",
    accent: "#22c55e",
  },
  rejected: {
    label: "Rejected",
    description: "This submission was declined by review.",
    accent: "#ef4444",
  },
};

function getSubmissionStatusCopy(status: string) {
  return (
    STATUS_COPY[status as ArtistSubmissionStatus] || {
      label: status.replace("_", " ") || "Unknown",
      description: "Status details will appear here when review updates.",
      accent: COLORS.textMuted,
    }
  );
}

export default function ArtistSubmissionsScreen() {
  const [title, setTitle] = useState("");
  const [artistName, setArtistName] = useState("");
  const [creatorEmail, setCreatorEmail] = useState("");
  const [creatorPassword, setCreatorPassword] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authTone, setAuthTone] = useState<"neutral" | "success" | "error">(
    "neutral"
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const [submissionsError, setSubmissionsError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState<"neutral" | "success" | "error">(
    "neutral"
  );
  const [submissions, setSubmissions] = useState<ArtistSubmission[]>([]);

  const summary = useMemo(
    () => ({
      total: SUBMISSION_STATES.length,
      active: submissions.length,
      ready: sessionEmail ? "Signed in" : "Signed out",
    }),
    [submissions.length, sessionEmail]
  );

  const loadArtistSubmissions = useCallback(async (accessToken?: string) => {
    setIsLoadingSubmissions(true);
    setSubmissionsError("");

    try {
      const tokenResult = accessToken
        ? { accessToken, error: null }
        : await getCurrentSupabaseAccessToken();

      if (!tokenResult.accessToken) {
        throw new Error(
          tokenResult.error || "Sign in as an artist to submit music for review."
        );
      }

      const response = await fetch(ARTIST_SUBMISSIONS_API_URL, {
        headers: {
          Authorization: `Bearer ${tokenResult.accessToken}`,
        },
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Could not load artist submissions.");
      }

      setSubmissions((payload.submissions || []) as ArtistSubmission[]);
    } catch (error) {
      setSubmissionsError(
        error instanceof Error
          ? error.message
          : "Could not load artist submissions."
      );
    } finally {
      setIsLoadingSubmissions(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadSession() {
      const session = await getCurrentSupabaseSessionSummary();

      if (ignore) return;

      setSessionEmail(session.email);
      setAuthTone(session.isSignedIn ? "success" : "neutral");
      setAuthMessage(
        session.isSignedIn
          ? "Creator session ready. Publishing still requires admin approval."
          : ""
      );
      setIsCheckingSession(false);

      if (session.isSignedIn) {
        loadArtistSubmissions();
      }
    }

    loadSession();

    return () => {
      ignore = true;
    };
  }, [loadArtistSubmissions]);

  async function handleCreatorSignIn() {
    const cleanEmail = creatorEmail.trim();

    if (!cleanEmail || !creatorPassword) {
      setAuthTone("error");
      setAuthMessage("Enter your creator email and password to continue.");
      return;
    }

    setIsSigningIn(true);
    setAuthTone("neutral");
    setAuthMessage("Opening secure creator session...");

    try {
      const result = await signInArtistWithPassword(cleanEmail, creatorPassword);

      if (result.error || !result.email) {
        throw new Error(result.error || "Could not sign in.");
      }

      setSessionEmail(result.email);
      setCreatorPassword("");
      setAuthTone("success");
      setAuthMessage(
        "Signed in. You can now send submissions for review."
      );
      loadArtistSubmissions();
    } catch (error) {
      setSessionEmail(null);
      setAuthTone("error");
      setAuthMessage(
        error instanceof Error ? error.message : "Could not sign in."
      );
    } finally {
      setIsSigningIn(false);
    }
  }

  async function handleCreatorSignOut() {
    setIsSigningOut(true);
    setAuthTone("neutral");
    setAuthMessage("Signing out of Creator Access...");

    try {
      const result = await signOutArtistSession();

      if (result.error) {
        throw new Error(result.error);
      }

      setSessionEmail(null);
      setCreatorPassword("");
      setSubmissions([]);
      setSubmissionsError("");
      setAuthTone("neutral");
      setAuthMessage("Signed out.");
    } catch (error) {
      setAuthTone("error");
      setAuthMessage(
        error instanceof Error ? error.message : "Could not sign out."
      );
    } finally {
      setIsSigningOut(false);
    }
  }

  async function handleSubmit() {
    const cleanTitle = title.trim();
    const cleanArtistName = artistName.trim();

    if (!cleanTitle || !cleanArtistName) {
      setStatusTone("error");
      setStatusMessage("Add both a title and artist name before submitting.");
      return;
    }

    setIsSubmitting(true);
    setStatusTone("neutral");
    setStatusMessage("Submitting to Hidden Tunes review...");

    try {
      const { accessToken, error: tokenError } =
        await getCurrentSupabaseAccessToken();

      if (!accessToken) {
        throw new Error(
          tokenError || "Sign in as an artist to submit music for review."
        );
      }

      const response = await fetch(ARTIST_SUBMISSIONS_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: cleanTitle,
          artist_name: cleanArtistName,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.success) {
        throw new Error(
          payload?.error ||
            "Submission could not be created. Sign-in may not be ready on mobile yet."
        );
      }

      setSubmissions((current) => [
        payload.submission as ArtistSubmission,
        ...current,
      ]);
      setTitle("");
      setArtistName("");
      setStatusTone("success");
      setStatusMessage("Submission created and sent for review.");
      loadArtistSubmissions(accessToken);
    } catch (error) {
      setStatusTone("error");
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Submission could not be created."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <LinearGradient colors={GRADIENTS.main} style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </TouchableOpacity>

          <Text style={styles.kicker}>ARTIST WORKSPACE</Text>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.glow} />

          <View style={styles.heroIcon}>
            <Ionicons name="musical-notes" size={34} color={COLORS.primary} />
          </View>

          <Text style={styles.heroTitle}>Artist Submissions</Text>
          <Text style={styles.heroSubtitle}>
            A safe foundation for future artist uploads, review feedback, and
            resubmissions. Nothing publishes directly from this screen.
          </Text>

          <View style={styles.heroPills}>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillNumber}>{summary.total}</Text>
              <Text style={styles.heroPillLabel}>States</Text>
            </View>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillNumber}>{summary.active}</Text>
              <Text style={styles.heroPillLabel}>Live items</Text>
            </View>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillNumber}>{summary.ready}</Text>
              <Text style={styles.heroPillLabel}>Mode</Text>
            </View>
          </View>
        </View>

        <View style={styles.copyCard}>
          <Text style={styles.copyTitle}>Built for review-first releases</Text>
          <Text style={styles.copyText}>
            Artists will be able to submit music, edit drafts, respond to review
            feedback, and resubmit when changes are requested. Publishing remains
            controlled by secure backend/admin workflows in a later phase.
          </Text>
        </View>

        <View style={styles.creatorAccessCard}>
          <View style={styles.creatorAccessGlow} />
          <View style={styles.creatorHeader}>
            <View style={styles.creatorIcon}>
              <Ionicons name="key" size={22} color={COLORS.primary} />
            </View>
            <View style={styles.creatorHeaderText}>
              <Text style={styles.creatorEyebrow}>Creator Access</Text>
              <Text style={styles.creatorTitle}>
                Sign in to manage submissions, review feedback, and prepare
                releases for approval.
              </Text>
            </View>
          </View>

          <View style={styles.sessionRow}>
            <View>
              <Text style={styles.sessionLabel}>Session status</Text>
              <Text style={styles.sessionValue}>
                {isCheckingSession
                  ? "Checking session..."
                  : sessionEmail
                    ? `Signed in as ${sessionEmail}`
                    : "Signed out"}
              </Text>
            </View>
            <View
              style={[
                styles.sessionDot,
                sessionEmail ? styles.sessionDotActive : null,
              ]}
            />
          </View>

          {!sessionEmail ? (
            <View style={styles.creatorForm}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                value={creatorEmail}
                onChangeText={setCreatorEmail}
                placeholder="artist@example.com"
                placeholderTextColor="rgba(255,255,255,0.34)"
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!isSigningIn && !isCheckingSession}
              />

              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                value={creatorPassword}
                onChangeText={setCreatorPassword}
                placeholder="Password"
                placeholderTextColor="rgba(255,255,255,0.34)"
                style={styles.input}
                secureTextEntry
                editable={!isSigningIn && !isCheckingSession}
              />

              <TouchableOpacity
                activeOpacity={0.88}
                style={[
                  styles.creatorButton,
                  isSigningIn || isCheckingSession
                    ? styles.submitButtonDisabled
                    : null,
                ]}
                onPress={handleCreatorSignIn}
                disabled={isSigningIn || isCheckingSession}
              >
                {isSigningIn ? (
                  <ActivityIndicator color="#050508" />
                ) : (
                  <Text style={styles.submitButtonText}>Sign In</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              activeOpacity={0.88}
              style={[
                styles.signOutButton,
                isSigningOut ? styles.submitButtonDisabled : null,
              ]}
              onPress={handleCreatorSignOut}
              disabled={isSigningOut}
            >
              {isSigningOut ? (
                <ActivityIndicator color={COLORS.text} />
              ) : (
                <Text style={styles.signOutButtonText}>Sign Out</Text>
              )}
            </TouchableOpacity>
          )}

          {authMessage ? (
            <View style={[styles.statusBox, styles[`${authTone}Status`]]}>
              <Text style={styles.statusText}>{authMessage}</Text>
            </View>
          ) : null}

          <View style={styles.trustRow}>
            <Ionicons name="shield-checkmark" size={16} color={COLORS.primary} />
            <Text style={styles.trustText}>
              Publishing still requires admin approval.
            </Text>
          </View>
        </View>

        {sessionEmail ? (
          <View style={styles.formCard}>
          <Text style={styles.formTitle}>Start a Submission</Text>
          <Text style={styles.formDescription}>
            Send only basic release details for review. Audio and artwork upload
            are intentionally disabled in this phase.
          </Text>

          <Text style={styles.inputLabel}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Song or release title"
            placeholderTextColor="rgba(255,255,255,0.34)"
            style={styles.input}
            maxLength={140}
            editable={!isSubmitting}
          />

          <Text style={styles.inputLabel}>Artist name</Text>
          <TextInput
            value={artistName}
            onChangeText={setArtistName}
            placeholder="Artist or group name"
            placeholderTextColor="rgba(255,255,255,0.34)"
            style={styles.input}
            maxLength={140}
            editable={!isSubmitting}
          />

          {statusMessage ? (
            <View style={[styles.statusBox, styles[`${statusTone}Status`]]}>
              <Text style={styles.statusText}>{statusMessage}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.88}
            style={[
              styles.submitButton,
              isSubmitting ? styles.submitButtonDisabled : null,
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#050508" />
            ) : (
              <Text style={styles.submitButtonText}>Submit for Review</Text>
            )}
          </TouchableOpacity>
          </View>
        ) : null}

        {sessionEmail ? (
          <View style={styles.submissionsPanel}>
            <View style={styles.submissionsHeader}>
              <View>
                <Text style={styles.createdTitle}>My Submissions</Text>
                <Text style={styles.submissionsSubtitle}>
                  Synced from the Hidden Tunes review queue.
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.86}
                style={styles.refreshButton}
                onPress={() => loadArtistSubmissions()}
                disabled={isLoadingSubmissions}
              >
                {isLoadingSubmissions ? (
                  <ActivityIndicator size="small" color={COLORS.text} />
                ) : (
                  <Ionicons name="refresh" size={17} color={COLORS.text} />
                )}
              </TouchableOpacity>
            </View>

            {submissionsError ? (
              <View style={[styles.statusBox, styles.errorStatus]}>
                <Text style={styles.statusText}>{submissionsError}</Text>
              </View>
            ) : null}

            {isLoadingSubmissions && submissions.length === 0 ? (
              <View style={styles.emptySubmissionsCard}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.emptySubmissionsText}>
                  Loading your submissions...
                </Text>
              </View>
            ) : submissions.length > 0 ? (
              <View style={styles.submissionList}>
                {submissions.map((submission) => (
                  <SubmissionCard key={submission.id} submission={submission} />
                ))}
              </View>
            ) : (
              <View style={styles.emptySubmissionsCard}>
                <Ionicons
                  name="albums-outline"
                  size={24}
                  color={COLORS.primary}
                />
                <Text style={styles.emptySubmissionsTitle}>
                  No submissions yet
                </Text>
                <Text style={styles.emptySubmissionsText}>
                  Start with basic release details. Audio, artwork, edits, and
                  resubmission tools come later.
                </Text>
              </View>
            )}
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Submission Pipeline</Text>
          <Text style={styles.sectionSubtitle}>Review-first workflow</Text>
        </View>

        <View style={styles.stateList}>
          {SUBMISSION_STATES.map((state) => (
            <SubmissionStateCard key={state.title} state={state} />
          ))}
        </View>

        <View style={styles.safetyCard}>
          <Ionicons name="shield-checkmark" size={22} color={COLORS.primary} />
          <View style={styles.safetyTextWrap}>
            <Text style={styles.safetyTitle}>Safe foundation phase</Text>
            <Text style={styles.safetyText}>
              This screen does not upload files, change catalog data, or publish
              music. The server must approve the signed-in artist profile before
              a submission record can be created.
            </Text>
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

function SubmissionStateCard({ state }: { state: SubmissionState }) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      style={styles.stateCard}
      onPress={() => undefined}
    >
      <View
        style={[
          styles.stateIcon,
          {
            backgroundColor: `${state.accent}24`,
            borderColor: `${state.accent}55`,
          },
        ]}
      >
        <Ionicons name={state.icon} size={22} color={state.accent} />
      </View>

      <View style={styles.stateTextWrap}>
        <Text style={styles.stateTitle}>{state.title}</Text>
        <Text style={styles.stateDescription}>{state.description}</Text>
      </View>

      <View style={styles.countBadge}>
        <Text style={styles.countText}>{state.countLabel}</Text>
      </View>
    </TouchableOpacity>
  );
}

function SubmissionCard({ submission }: { submission: ArtistSubmission }) {
  const status = getSubmissionStatusCopy(String(submission.status || ""));
  const submittedAt = submission.submitted_at
    ? new Date(submission.submitted_at).toLocaleDateString()
    : "Not submitted";

  return (
    <View style={styles.submissionCard}>
      <View style={styles.submissionCardTop}>
        <View style={styles.submissionTitleWrap}>
          <Text style={styles.createdSubmissionTitle}>{submission.title}</Text>
          <Text style={styles.createdSubmissionArtist}>
            {submission.artist_name}
          </Text>
        </View>

        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: `${status.accent}22`,
              borderColor: `${status.accent}44`,
            },
          ]}
        >
          <Text style={[styles.statusBadgeText, { color: status.accent }]}>
            {status.label}
          </Text>
        </View>
      </View>

      <Text style={styles.submissionDescription}>{status.description}</Text>

      {submission.admin_notes ? (
        <View style={styles.adminNotesBox}>
          <Text style={styles.adminNotesLabel}>Review notes</Text>
          <Text style={styles.adminNotesText}>{submission.admin_notes}</Text>
        </View>
      ) : null}

      <View style={styles.submissionFooter}>
        <Text style={styles.submissionDate}>Submitted {submittedAt}</Text>
        <View style={styles.disabledActionPill}>
          <Text style={styles.disabledActionText}>Edit later</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 150,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  kicker: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
  },
  heroCard: {
    marginTop: 24,
    borderRadius: 34,
    padding: 24,
    minHeight: 330,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(168,85,247,0.2)",
    top: -90,
    right: -90,
  },
  heroIcon: {
    width: 70,
    height: 70,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(34,197,94,0.12)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.26)",
  },
  heroTitle: {
    color: COLORS.text,
    fontSize: 36,
    fontWeight: "900",
    marginTop: 22,
    letterSpacing: -1.1,
  },
  heroSubtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 12,
  },
  heroPills: {
    flexDirection: "row",
    gap: 10,
    marginTop: 24,
  },
  heroPill: {
    flex: 1,
    borderRadius: 20,
    padding: 13,
    backgroundColor: "rgba(0,0,0,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  heroPillNumber: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },
  heroPillLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 5,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  copyCard: {
    marginTop: 18,
    borderRadius: 28,
    padding: 20,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  copyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
  },
  copyText: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 21,
    marginTop: 8,
  },
  creatorAccessCard: {
    marginTop: 18,
    borderRadius: 32,
    padding: 20,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(250,204,21,0.16)",
    overflow: "hidden",
  },
  creatorAccessGlow: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(250,204,21,0.12)",
    right: -90,
    top: -90,
  },
  creatorHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  creatorIcon: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(250,204,21,0.12)",
    borderWidth: 1,
    borderColor: "rgba(250,204,21,0.22)",
    marginRight: 14,
  },
  creatorHeaderText: {
    flex: 1,
  },
  creatorEyebrow: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  creatorTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 25,
    marginTop: 7,
    letterSpacing: -0.25,
  },
  sessionRow: {
    marginTop: 18,
    borderRadius: 22,
    padding: 15,
    backgroundColor: "rgba(0,0,0,0.24)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sessionLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  sessionValue: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 5,
  },
  sessionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.24)",
  },
  sessionDotActive: {
    backgroundColor: "#22c55e",
  },
  creatorForm: {
    marginTop: 4,
  },
  creatorButton: {
    minHeight: 54,
    marginTop: 16,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  signOutButton: {
    minHeight: 52,
    marginTop: 16,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  signOutButtonText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  trustRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  trustText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 8,
  },
  formCard: {
    marginTop: 18,
    borderRadius: 30,
    padding: 20,
    backgroundColor: "rgba(255,255,255,0.065)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  formTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  formDescription: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7,
    marginBottom: 18,
  },
  inputLabel: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 8,
    marginTop: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  input: {
    minHeight: 54,
    borderRadius: 18,
    paddingHorizontal: 16,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
    backgroundColor: "rgba(0,0,0,0.24)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  statusBox: {
    marginTop: 16,
    borderRadius: 18,
    padding: 13,
    borderWidth: 1,
  },
  neutralStatus: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.12)",
  },
  successStatus: {
    backgroundColor: "rgba(34,197,94,0.1)",
    borderColor: "rgba(34,197,94,0.22)",
  },
  errorStatus: {
    backgroundColor: "rgba(239,68,68,0.1)",
    borderColor: "rgba(239,68,68,0.22)",
  },
  statusText: {
    color: COLORS.text,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "800",
  },
  submitButton: {
    minHeight: 54,
    marginTop: 16,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  submitButtonDisabled: {
    opacity: 0.64,
  },
  submitButtonText: {
    color: "#050508",
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  submissionsPanel: {
    marginTop: 20,
    borderRadius: 30,
    padding: 18,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  submissionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  submissionsSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  submissionList: {
    marginTop: 14,
    gap: 10,
  },
  createdTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
  },
  submissionCard: {
    borderRadius: 24,
    padding: 16,
    backgroundColor: "rgba(0,0,0,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  submissionCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  submissionTitleWrap: {
    flex: 1,
  },
  createdSubmissionTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },
  createdSubmissionArtist: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  submissionDescription: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 11,
  },
  adminNotesBox: {
    marginTop: 12,
    borderRadius: 18,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  adminNotesLabel: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  adminNotesText: {
    color: COLORS.text,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  submissionFooter: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  submissionDate: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "800",
  },
  disabledActionPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    opacity: 0.65,
  },
  disabledActionText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  emptySubmissionsCard: {
    marginTop: 14,
    borderRadius: 24,
    padding: 18,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  emptySubmissionsTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 10,
  },
  emptySubmissionsText: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    textAlign: "center",
  },
  sectionHeader: {
    marginTop: 28,
    marginBottom: 14,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
  },
  sectionSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 5,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  stateList: {
    gap: 12,
  },
  stateCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 26,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  stateIcon: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginRight: 14,
  },
  stateTextWrap: {
    flex: 1,
  },
  stateTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },
  stateDescription: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  countBadge: {
    marginLeft: 10,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  countText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  safetyCard: {
    marginTop: 20,
    flexDirection: "row",
    borderRadius: 26,
    padding: 18,
    backgroundColor: "rgba(34,197,94,0.08)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.18)",
  },
  safetyTextWrap: {
    flex: 1,
    marginLeft: 12,
  },
  safetyTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },
  safetyText: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
});

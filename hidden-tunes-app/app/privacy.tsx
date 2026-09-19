import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";

export default function PrivacyPolicyScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Privacy Policy" }} />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.updated}>Last updated: August 21, 2026</Text>

        <Section title="1. About Hidden Tunes">
          Hidden Tunes is a music discovery and streaming app. You can browse supported catalogs, search, play music, manage favorites and playlists, and use other available discovery features.
        </Section>

        <Section title="2. Information We Collect">
          You may use core browsing and playback features without an account. If you create an account, Supabase processes your email address, authentication credentials, user identifier, and session data to sign you in and keep your session active. An optional display name may be stored with your account. Hidden Tunes does not collect payment details through this mobile app.
        </Section>

        <Section title="3. Third-Party Music Sources">
          Hidden Tunes may use services such as Audius, Internet Archive, Jamendo when configured, and YouTube through an in-app WebView for discovery or playback. These providers may process requests under their own privacy policies.
        </Section>

        <Section title="4. Listening and Device Data">
          The app stores local listening history, playback position, favorites, playlists, queues, search history, catalog caches, downloaded media, and TV, podcast, sports, and mature-content preferences so those features work on your device. Local data remains until you remove it, clear app storage, delete downloads, or uninstall Hidden Tunes. Search, browse, and playback requests are sent to the relevant Hidden Tunes or content-provider service.
        </Section>

        <Section title="5. Artist Submissions">
          If you use creator tools, Hidden Tunes processes submission metadata and files you choose through the document picker, such as audio, artwork, and lyrics. Those files are sent to the authenticated Hidden Tunes creator service for review and catalog operations.
        </Section>

        <Section title="6. Advertising, Tracking, and Permissions">
          Hidden Tunes does not currently use personalized advertising or third-party advertising trackers. The mobile app does not request contacts, location, camera, or microphone access. Background audio uses Android media and foreground-service permissions.
        </Section>

        <Section title="7. Data Sharing and Security">
          We do not sell personal data. Account and session information is shared with Supabase to provide authentication. Search, catalog, and playback requests may be shared with Hidden Tunes API hosts and the provider of the requested content. Requests use HTTPS where supported by the service. Data may also be disclosed when required by law or to protect users and the service.
        </Section>

        <Section title="8. Account Deletion">
          Signed-in users can open Profile, then Account, and choose Delete My Account. The app requires an authenticated session, recent authentication, an explicit confirmation, and a server-side deletion request. Successful deletion removes the Supabase Authentication user and account-owned server data that Hidden Tunes controls. Data held only on your device can be removed by clearing storage, deleting downloads, or uninstalling the app. Third-party providers follow their own deletion policies.
        </Section>

        <Section title="9. Children’s Privacy">
          Hidden Tunes is a general-audience entertainment product and is not directed at children. Catalogs may include mature audio or video. Contact us if you believe a child has provided personal information.
        </Section>

        <Section title="10. Changes and Contact">
          We may update this policy when the app or its providers change. The current public policy is available at https://hiddentunes.com/privacy. For privacy questions, contact support@hiddentunes.com.
        </Section>
      </ScrollView>
    </>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  content: {
    padding: 22,
    paddingBottom: 50,
  },
  title: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "900",
    marginBottom: 8,
  },
  updated: {
    color: "#94a3b8",
    fontSize: 14,
    marginBottom: 28,
  },
  section: {
    marginBottom: 24,
    backgroundColor: "#0f172a",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  heading: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
  },
  text: {
    color: "#cbd5e1",
    fontSize: 15,
    lineHeight: 23,
  },
});

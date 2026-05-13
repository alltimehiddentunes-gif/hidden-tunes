import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";

export default function PrivacyPolicyScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Privacy Policy" }} />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.updated}>Last updated: May 6, 2026</Text>

        <Section title="1. About Hidden Tunes">
          Hidden Tunes is a music discovery and streaming app that allows users to search and play music from supported external sources.
        </Section>

        <Section title="2. Information We Collect">
          Hidden Tunes does not require users to create an account at this stage. We do not collect names, passwords, payment details, or personal profile information.
        </Section>

        <Section title="3. Third-Party Music Sources">
          Hidden Tunes may use third-party services such as Audius, Internet Archive, and YouTube search or media APIs to provide music discovery features. These services may process requests according to their own privacy policies.
        </Section>

        <Section title="4. App Usage Data">
          The app may process basic technical information needed for playback, search, performance, and app stability. This may include search terms, playback requests, device type, and error information.
        </Section>

        <Section title="5. Advertising and Tracking">
          Hidden Tunes does not currently use personalized advertising or third-party tracking for advertising purposes.
        </Section>

        <Section title="6. Children’s Privacy">
          Hidden Tunes is not designed to knowingly collect personal information from children. If you believe a child has provided personal data, please contact us so we can review and remove it.
        </Section>

        <Section title="7. Data Sharing">
          We do not sell personal data. Data may only be shared when required to operate third-party services, comply with legal obligations, or protect the app from abuse.
        </Section>

        <Section title="8. Changes to This Policy">
          We may update this Privacy Policy from time to time. Updates will be shown inside the app or on our official website.
        </Section>

        <Section title="9. Contact">
          For privacy questions, contact us at: support@hiddentunes.com
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
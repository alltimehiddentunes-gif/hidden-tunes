import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import { COLORS, GRADIENTS } from "../constants/theme";
import {
  DEFAULT_LISTENER_PREFERENCES,
  DiscoveryStyle,
  EnergyPreference,
  OnboardingPreferences,
  saveOnboardingPreferences,
  UserRole,
} from "../services/onboardingPreferences";

type Step = "role" | "listener" | "artist";

const GENRE_OPTIONS = [
  "Afrobeat",
  "Amapiano",
  "Hip-Hop",
  "R&B",
  "Pop",
  "Gospel",
  "Dancehall",
  "Electronic",
] as const;

const MOOD_OPTIONS = [
  "Chill",
  "Romantic",
  "Late-night",
  "Workout",
  "Focus",
  "Happy",
  "Soulful",
  "Party",
] as const;

const ENERGY_OPTIONS: {
  value: EnergyPreference;
  title: string;
  subtitle: string;
}[] = [
  {
    value: "calm",
    title: "Calm",
    subtitle: "Soft, soothing, low-pressure listening.",
  },
  {
    value: "balanced",
    title: "Balanced",
    subtitle: "A premium mix of smooth and active.",
  },
  {
    value: "energetic",
    title: "Energetic",
    subtitle: "More lift, tempo, and movement.",
  },
];

const DISCOVERY_OPTIONS: {
  value: DiscoveryStyle;
  title: string;
  subtitle: string;
}[] = [
  {
    value: "familiar",
    title: "Familiar",
    subtitle: "Stay close to artists and sounds I know.",
  },
  {
    value: "balanced",
    title: "Balanced",
    subtitle: "Mix favorites with tasteful discovery.",
  },
  {
    value: "adventurous",
    title: "Adventurous",
    subtitle: "Bring in more new sounds and artists.",
  },
];

function toggleValue(current: string[], value: string) {
  if (current.includes(value)) {
    return current.filter((item) => item !== value);
  }

  return [...current, value];
}

export default function OnboardingScreen() {
  const [step, setStep] = useState<Step>("role");
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [energy, setEnergy] = useState<EnergyPreference>("balanced");
  const [discoveryStyle, setDiscoveryStyle] =
    useState<DiscoveryStyle>("balanced");
  const [isSaving, setIsSaving] = useState(false);

  const progressLabel = useMemo(() => {
    if (step === "role") return "Step 1 of 2";
    if (step === "listener") return "Step 2 of 2";
    return "Creator profile";
  }, [step]);

  async function finishOnboarding(preferences: OnboardingPreferences) {
    if (isSaving) return;

    try {
      setIsSaving(true);
      await saveOnboardingPreferences(preferences);
      router.replace("/(tabs)");
    } finally {
      setIsSaving(false);
    }
  }

  function chooseRole(role: UserRole) {
    setSelectedRole(role);
    setStep(role === "listener" ? "listener" : "artist");
  }

  function finishListener() {
    finishOnboarding({
      userRole: "listener",
      preferredGenres: selectedGenres,
      preferredMoods: selectedMoods,
      preferredEnergy: energy,
      discoveryStyle,
    });
  }

  function finishArtist() {
    finishOnboarding({
      ...DEFAULT_LISTENER_PREFERENCES,
      userRole: "artist",
    });
  }

  return (
    <LinearGradient colors={GRADIENTS.premium} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <View style={styles.logoRow}>
            <Image
              source={require("../assets/images/logo.png")}
              style={styles.logo}
            />
            <View>
              <Text style={styles.brand}>Hidden Tunes</Text>
              <Text style={styles.progress}>{progressLabel}</Text>
            </View>
          </View>

          {step !== "role" ? (
            <Pressable style={styles.backButton} onPress={() => setStep("role")}>
              <Ionicons name="chevron-back" size={18} color={COLORS.text} />
            </Pressable>
          ) : null}
        </View>

        {step === "role" ? (
          <RoleStep selectedRole={selectedRole} onChooseRole={chooseRole} />
        ) : null}

        {step === "listener" ? (
          <ListenerStep
            selectedGenres={selectedGenres}
            selectedMoods={selectedMoods}
            energy={energy}
            discoveryStyle={discoveryStyle}
            isSaving={isSaving}
            onToggleGenre={(genre) =>
              setSelectedGenres((current) => toggleValue(current, genre))
            }
            onToggleMood={(mood) =>
              setSelectedMoods((current) => toggleValue(current, mood))
            }
            onSetEnergy={setEnergy}
            onSetDiscoveryStyle={setDiscoveryStyle}
            onFinish={finishListener}
          />
        ) : null}

        {step === "artist" ? (
          <ArtistStep isSaving={isSaving} onFinish={finishArtist} />
        ) : null}
      </ScrollView>
    </LinearGradient>
  );
}

function RoleStep({
  selectedRole,
  onChooseRole,
}: {
  selectedRole: UserRole | null;
  onChooseRole: (role: UserRole) => void;
}) {
  return (
    <View style={styles.content}>
      <Text style={styles.eyebrow}>Premium setup</Text>
      <Text style={styles.title}>Shape Hidden Tunes around you.</Text>
      <Text style={styles.subtitle}>
        Choose how you want to enter. Listener mode keeps the app focused on
        discovery. Artist mode prepares future creator tools.
      </Text>

      <View style={styles.roleGrid}>
        <RoleCard
          icon="headset"
          title="I am Here to Listen"
          subtitle="Personalize genres, moods, energy, and discovery style."
          selected={selectedRole === "listener"}
          onPress={() => onChooseRole("listener")}
        />
        <RoleCard
          icon="mic"
          title="I am an Artist / Creator"
          subtitle="Store creator intent locally for future release tools."
          selected={selectedRole === "artist"}
          onPress={() => onChooseRole("artist")}
        />
      </View>

      <Text style={styles.note}>
        You can expand role settings later. This foundation does not publish
        uploads, change playback, or modify catalog genres.
      </Text>
    </View>
  );
}

function ListenerStep({
  selectedGenres,
  selectedMoods,
  energy,
  discoveryStyle,
  isSaving,
  onToggleGenre,
  onToggleMood,
  onSetEnergy,
  onSetDiscoveryStyle,
  onFinish,
}: {
  selectedGenres: string[];
  selectedMoods: string[];
  energy: EnergyPreference;
  discoveryStyle: DiscoveryStyle;
  isSaving: boolean;
  onToggleGenre: (genre: string) => void;
  onToggleMood: (mood: string) => void;
  onSetEnergy: (value: EnergyPreference) => void;
  onSetDiscoveryStyle: (value: DiscoveryStyle) => void;
  onFinish: () => void;
}) {
  return (
    <View style={styles.content}>
      <Text style={styles.eyebrow}>Listener profile</Text>
      <Text style={styles.title}>Tune the first listening experience.</Text>
      <Text style={styles.subtitle}>
        Pick a few signals for future personalization. Genres stay true to the
        original backend genre and are never rewritten.
      </Text>

      <PreferenceSection
        title="Favorite genres"
        subtitle="Choose the original genre families you want surfaced first."
      >
        <ChipGrid
          options={GENRE_OPTIONS}
          selected={selectedGenres}
          onToggle={onToggleGenre}
        />
      </PreferenceSection>

      <PreferenceSection
        title="Moods"
        subtitle="Help the app understand the feeling you want."
      >
        <ChipGrid
          options={MOOD_OPTIONS}
          selected={selectedMoods}
          onToggle={onToggleMood}
        />
      </PreferenceSection>

      <PreferenceSection
        title="Energy preference"
        subtitle="Set the starting pace for future listening sessions."
      >
        <OptionStack
          options={ENERGY_OPTIONS}
          selected={energy}
          onSelect={onSetEnergy}
        />
      </PreferenceSection>

      <PreferenceSection
        title="Discovery style"
        subtitle="Choose how far Hidden Tunes should reach later."
      >
        <OptionStack
          options={DISCOVERY_OPTIONS}
          selected={discoveryStyle}
          onSelect={onSetDiscoveryStyle}
        />
      </PreferenceSection>

      <PrimaryButton
        label={isSaving ? "Saving..." : "Enter Hidden Tunes"}
        icon="arrow-forward"
        disabled={isSaving}
        onPress={onFinish}
      />
    </View>
  );
}

function ArtistStep({
  isSaving,
  onFinish,
}: {
  isSaving: boolean;
  onFinish: () => void;
}) {
  return (
    <View style={styles.content}>
      <Text style={styles.eyebrow}>Creator foundation</Text>
      <Text style={styles.title}>Artist tools are being prepared.</Text>
      <Text style={styles.subtitle}>
        We will store your creator role locally now so future profile screens can
        unlock the right experience without changing uploads or backend schema.
      </Text>

      <View style={styles.creatorPanel}>
        <FeatureRow icon="cloud-upload-outline" label="Upload songs for review" />
        <FeatureRow icon="albums-outline" label="Manage releases" />
        <FeatureRow icon="create-outline" label="Edit lyrics" />
        <FeatureRow icon="image-outline" label="Submit artwork" />
        <FeatureRow
          icon="shield-checkmark-outline"
          label="See review and copyright status"
        />
      </View>

      <Text style={styles.note}>
        Creator uploads, dashboards, mutations, and server sync are not enabled
        in this phase.
      </Text>

      <PrimaryButton
        label={isSaving ? "Saving..." : "Enter as Artist"}
        icon="arrow-forward"
        disabled={isSaving}
        onPress={onFinish}
      />
    </View>
  );
}

function RoleCard({
  icon,
  title,
  subtitle,
  selected,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.roleCard, selected ? styles.roleCardSelected : null]}
    >
      <View style={styles.iconBubble}>
        <Ionicons name={icon} size={22} color={COLORS.primaryGlow} />
      </View>
      <View style={styles.roleCopy}>
        <Text style={styles.roleTitle}>{title}</Text>
        <Text style={styles.roleSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={20}
        color={selected ? COLORS.primaryGlow : COLORS.textDim}
      />
    </Pressable>
  );
}

function PreferenceSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      {children}
    </View>
  );
}

function ChipGrid({
  options,
  selected,
  onToggle,
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <View style={styles.chipGrid}>
      {options.map((option) => {
        const isSelected = selected.includes(option);

        return (
          <Pressable
            key={option}
            onPress={() => onToggle(option)}
            style={[styles.chip, isSelected ? styles.chipSelected : null]}
          >
            <Text
              style={[
                styles.chipText,
                isSelected ? styles.chipTextSelected : null,
              ]}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function OptionStack<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { value: T; title: string; subtitle: string }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.optionStack}>
      {options.map((option) => {
        const isSelected = selected === option.value;

        return (
          <Pressable
            key={option.value}
            onPress={() => onSelect(option.value)}
            style={[styles.optionCard, isSelected ? styles.optionSelected : null]}
          >
            <View style={styles.optionTextWrap}>
              <Text style={styles.optionTitle}>{option.title}</Text>
              <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
            </View>
            <View
              style={[
                styles.radioOuter,
                isSelected ? styles.radioOuterSelected : null,
              ]}
            >
              {isSelected ? <View style={styles.radioInner} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function FeatureRow({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  return (
    <View style={styles.featureRow}>
      <Ionicons name={icon} size={18} color={COLORS.primaryGlow} />
      <Text style={styles.featureLabel}>{label}</Text>
    </View>
  );
}

function PrimaryButton({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.primaryButton, disabled ? styles.disabledButton : null]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
      <Ionicons name={icon} size={20} color="#000" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 58,
    paddingBottom: 34,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 34,
  },

  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  logo: {
    width: 52,
    height: 52,
    borderRadius: 16,
  },

  brand: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.3,
  },

  progress: {
    color: COLORS.textDim,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  content: {
    flex: 1,
  },

  eyebrow: {
    color: COLORS.primaryGlow,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2.2,
    textTransform: "uppercase",
    marginBottom: 12,
  },

  title: {
    color: COLORS.text,
    fontSize: 40,
    lineHeight: 45,
    fontWeight: "900",
    letterSpacing: -1.3,
  },

  subtitle: {
    color: COLORS.textMuted,
    fontSize: 15,
    lineHeight: 24,
    fontWeight: "600",
    marginTop: 16,
  },

  roleGrid: {
    gap: 14,
    marginTop: 30,
  },

  roleCard: {
    minHeight: 128,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  roleCardSelected: {
    borderColor: "rgba(192,132,252,0.7)",
    backgroundColor: "rgba(168,85,247,0.18)",
  },

  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.16)",
    borderWidth: 1,
    borderColor: "rgba(192,132,252,0.28)",
  },

  roleCopy: {
    flex: 1,
  },

  roleTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "900",
  },

  roleSubtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    marginTop: 6,
  },

  note: {
    color: COLORS.textDim,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
    marginTop: 20,
  },

  section: {
    marginTop: 24,
  },

  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
  },

  sectionSubtitle: {
    color: COLORS.textDim,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    marginTop: 5,
    marginBottom: 12,
  },

  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  chip: {
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.055)",
  },

  chipSelected: {
    borderColor: "rgba(250,204,21,0.7)",
    backgroundColor: "rgba(250,204,21,0.16)",
  },

  chipText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "900",
  },

  chipTextSelected: {
    color: COLORS.warning,
  },

  optionStack: {
    gap: 10,
  },

  optionCard: {
    borderRadius: 22,
    padding: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.052)",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  optionSelected: {
    borderColor: "rgba(168,85,247,0.72)",
    backgroundColor: "rgba(168,85,247,0.16)",
  },

  optionTextWrap: {
    flex: 1,
  },

  optionTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },

  optionSubtitle: {
    color: COLORS.textDim,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    marginTop: 4,
  },

  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },

  radioOuterSelected: {
    borderColor: COLORS.primaryGlow,
  },

  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primaryGlow,
  },

  creatorPanel: {
    marginTop: 28,
    borderRadius: 28,
    padding: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    gap: 14,
  },

  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  featureLabel: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
    flex: 1,
  },

  primaryButton: {
    height: 58,
    borderRadius: 22,
    backgroundColor: COLORS.warning,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    shadowColor: COLORS.warning,
    shadowOpacity: 0.26,
    shadowRadius: 18,
    elevation: 8,
    marginTop: 28,
  },

  disabledButton: {
    opacity: 0.65,
  },

  primaryButtonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "900",
  },
});

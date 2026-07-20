import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { safeRouterBack } from "../../utils/safeNavigation";

const API_BASE_URL = "https://hidden-tunes-backend.onrender.com";

type PickedAsset = DocumentPicker.DocumentPickerAsset | null;

export default function AdminUploadScreen() {
  const [song, setSong] = useState<PickedAsset>(null);
  const [cover, setCover] = useState<PickedAsset>(null);
  const [lyrics, setLyrics] = useState<PickedAsset>(null);

  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("Caasi Wills");
  const [album, setAlbum] = useState("Singles");
  const [genre, setGenre] = useState("Afrobeat");
  const [mood, setMood] = useState("Premium");
  const [releaseYear, setReleaseYear] = useState(
    String(new Date().getFullYear())
  );

  const [uploading, setUploading] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  async function pickSong() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["audio/mpeg", "audio/mp3", "audio/*"],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled) return;

    const selected = result.assets[0];

    setSong(selected);

    if (!title) {
      const cleanTitle = selected.name.replace(/\.[^/.]+$/, "");
      setTitle(cleanTitle);
    }
  }

  async function pickCover() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/jpeg", "image/png", "image/webp", "image/*"],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled) return;

    setCover(result.assets[0]);
  }

  async function pickLyrics() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["text/plain", "application/octet-stream", "*/*"],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled) return;

    setLyrics(result.assets[0]);
  }

  function getFileForForm(
    asset: DocumentPicker.DocumentPickerAsset,
    fallbackType: string
  ) {
    return {
      uri: asset.uri,
      name: asset.name,
      type: asset.mimeType || fallbackType,
    } as any;
  }

  async function uploadSong() {
    if (!song) {
      Alert.alert("Missing MP3", "Please select an MP3 song first.");
      return;
    }

    try {
      setUploading(true);
      setLastResult(null);

      const formData = new FormData();

      formData.append("song", getFileForForm(song, "audio/mpeg"));

      if (cover) {
        formData.append("cover", getFileForForm(cover, "image/jpeg"));
      }

      if (lyrics) {
        formData.append("lyrics", getFileForForm(lyrics, "text/plain"));
      }

      formData.append("title", title.trim() || song.name.replace(/\.[^/.]+$/, ""));
      formData.append("artist", artist.trim() || "Unknown Artist");
      formData.append("album", album.trim() || "Singles");
      formData.append("genre", genre.trim() || "Afrobeat");
      formData.append("mood", mood.trim() || "Premium");
      formData.append(
        "releaseYear",
        releaseYear.trim() || String(new Date().getFullYear())
      );

      const response = await fetch(`${API_BASE_URL}/admin/upload/song`, {
        method: "POST",
        body: formData,
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.details || json?.error || "Upload failed");
      }

      setLastResult(json);

      Alert.alert("Upload Complete", "Song uploaded to Hidden Tunes catalog.");

      setSong(null);
      setCover(null);
      setLyrics(null);
      setTitle("");
    } catch (error: any) {
      Alert.alert("Upload Failed", error?.message || "Something went wrong.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <LinearGradient
      colors={["#050505", "#101018", "#050505"]}
      style={styles.screen}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => safeRouterBack("/admin-dashboard")}
            >
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>

            <View>
              <Text style={styles.kicker}>Hidden Tunes Admin</Text>
              <Text style={styles.title}>Upload Music</Text>
            </View>
          </View>

          <View style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <Ionicons name="cloud-upload-outline" size={34} color="#F5C76B" />
            </View>

            <View style={styles.heroTextWrap}>
              <Text style={styles.heroTitle}>Publish to Streaming Catalog</Text>

              <Text style={styles.heroSubtitle}>
                Upload MP3, artwork, lyrics, and synced LRC files directly to
                Hidden Tunes cloud storage.
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Files</Text>

            <FilePickerCard
              icon="musical-notes-outline"
              title="MP3 Song"
              subtitle={song ? song.name : "Select audio file"}
              active={!!song}
              onPress={pickSong}
            />

            <FilePickerCard
              icon="image-outline"
              title="Cover Artwork"
              subtitle={cover ? cover.name : "Optional JPG, PNG, WEBP"}
              active={!!cover}
              onPress={pickCover}
            />

            <FilePickerCard
              icon="document-text-outline"
              title="Lyrics / Synced Lyrics"
              subtitle={lyrics ? lyrics.name : "Optional TXT or LRC"}
              active={!!lyrics}
              onPress={pickLyrics}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Metadata</Text>

            <Input
              label="Title"
              value={title}
              onChangeText={setTitle}
              placeholder="Song title"
            />

            <Input
              label="Artist"
              value={artist}
              onChangeText={setArtist}
              placeholder="Artist name"
            />

            <Input
              label="Album"
              value={album}
              onChangeText={setAlbum}
              placeholder="Album or Singles"
            />

            <Input
              label="Genre"
              value={genre}
              onChangeText={setGenre}
              placeholder="Afrobeat"
            />

            <Input
              label="Mood"
              value={mood}
              onChangeText={setMood}
              placeholder="Premium"
            />

            <Input
              label="Release Year"
              value={releaseYear}
              onChangeText={setReleaseYear}
              placeholder="2026"
              keyboardType="number-pad"
            />
          </View>

          <TouchableOpacity
            style={[styles.uploadButton, uploading && styles.uploadButtonDisabled]}
            onPress={uploadSong}
            disabled={uploading}
            activeOpacity={0.85}
          >
            {uploading ? (
              <>
                <ActivityIndicator color="#050505" />
                <Text style={styles.uploadButtonText}>Uploading...</Text>
              </>
            ) : (
              <>
                <Ionicons name="rocket-outline" size={22} color="#050505" />
                <Text style={styles.uploadButtonText}>Publish Song</Text>
              </>
            )}
          </TouchableOpacity>

          {cover?.uri ? (
            <View style={styles.previewCard}>
              <Text style={styles.previewLabel}>Cover Preview</Text>

              <Image source={{ uri: cover.uri }} style={styles.coverPreview} />
            </View>
          ) : null}

          {lastResult?.song ? (
            <View style={styles.successCard}>
              <Ionicons name="checkmark-circle" size={26} color="#55FF99" />

              <View style={styles.successTextWrap}>
                <Text style={styles.successTitle}>Last upload successful</Text>

                <Text style={styles.successSubtitle}>
                  {lastResult.song.title} by {lastResult.song.artist}
                </Text>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

function FilePickerCard({
  icon,
  title,
  subtitle,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.fileCard, active && styles.fileCardActive]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={[styles.fileIcon, active && styles.fileIconActive]}>
        <Ionicons name={icon} size={24} color={active ? "#050505" : "#F5C76B"} />
      </View>

      <View style={styles.fileTextWrap}>
        <Text style={styles.fileTitle}>{title}</Text>

        <Text numberOfLines={1} style={styles.fileSubtitle}>
          {subtitle}
        </Text>
      </View>

      <Ionicons
        name={active ? "checkmark-circle" : "add-circle-outline"}
        size={24}
        color={active ? "#55FF99" : "#888"}
      />
    </TouchableOpacity>
  );
}

function Input({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "default" | "number-pad";
}) {
  return (
    <View style={styles.inputWrap}>
      <Text style={styles.inputLabel}>{label}</Text>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#666"
        keyboardType={keyboardType || "default"}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  screen: {
    flex: 1,
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 50,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 24,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  kicker: {
    color: "#F5C76B",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "900",
  },
  heroCard: {
    flexDirection: "row",
    gap: 16,
    padding: 18,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(245,199,107,0.22)",
    marginBottom: 24,
  },
  heroIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245,199,107,0.12)",
  },
  heroTextWrap: {
    flex: 1,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 6,
  },
  heroSubtitle: {
    color: "#B8B8C8",
    fontSize: 13,
    lineHeight: 19,
  },
  section: {
    marginBottom: 26,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 14,
  },
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginBottom: 12,
  },
  fileCardActive: {
    borderColor: "rgba(85,255,153,0.45)",
    backgroundColor: "rgba(85,255,153,0.08)",
  },
  fileIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245,199,107,0.12)",
  },
  fileIconActive: {
    backgroundColor: "#F5C76B",
  },
  fileTextWrap: {
    flex: 1,
  },
  fileTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 3,
  },
  fileSubtitle: {
    color: "#A7A7B7",
    fontSize: 12,
  },
  inputWrap: {
    marginBottom: 14,
  },
  inputLabel: {
    color: "#CFCFDC",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  input: {
    height: 52,
    borderRadius: 18,
    paddingHorizontal: 16,
    color: "#FFFFFF",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    fontSize: 15,
    fontWeight: "700",
  },
  uploadButton: {
    height: 58,
    borderRadius: 24,
    backgroundColor: "#F5C76B",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  uploadButtonDisabled: {
    opacity: 0.7,
  },
  uploadButtonText: {
    color: "#050505",
    fontSize: 16,
    fontWeight: "900",
  },
  previewCard: {
    padding: 16,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginBottom: 18,
  },
  previewLabel: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 12,
  },
  coverPreview: {
    width: "100%",
    height: 260,
    borderRadius: 20,
    backgroundColor: "#111",
  },
  successCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 22,
    backgroundColor: "rgba(85,255,153,0.1)",
    borderWidth: 1,
    borderColor: "rgba(85,255,153,0.25)",
  },
  successTextWrap: {
    flex: 1,
  },
  successTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  successSubtitle: {
    color: "#B8B8C8",
    fontSize: 12,
    marginTop: 3,
  },
});
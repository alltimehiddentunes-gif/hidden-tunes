import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type DownloadedSong = {
  id: string;
  title: string;
  artist: string;
  cover?: string;
  audioUrl: string;
  localUri: string;
  downloadedAt: string;
};

const DOWNLOADS_KEY = "hidden_tunes_downloads";

export async function getDownloadedSongs(): Promise<DownloadedSong[]> {
  try {
    const saved = await AsyncStorage.getItem(DOWNLOADS_KEY);

    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.log("Get downloads error:", error);

    return [];
  }
}

export async function saveDownload(song: {
  id: string;
  title: string;
  artist: string;
  cover?: string;
  audioUrl: string;
}) {
  try {
    const downloads = await getDownloadedSongs();

    const alreadyDownloaded = downloads.find(
      (item) => item.id === song.id
    );

    if (alreadyDownloaded) {
      return alreadyDownloaded;
    }

    const fileUri =
      FileSystem.documentDirectory + `${song.id}.mp3`;

    const result = await FileSystem.downloadAsync(
      song.audioUrl,
      fileUri
    );

    const newDownload: DownloadedSong = {
      ...song,
      localUri: result.uri,
      downloadedAt: new Date().toISOString(),
    };

    const updatedDownloads = [newDownload, ...downloads];

    await AsyncStorage.setItem(
      DOWNLOADS_KEY,
      JSON.stringify(updatedDownloads)
    );

    return newDownload;
  } catch (error) {
    console.log("Save download error:", error);

    return null;
  }
}

export async function deleteDownload(id: string) {
  try {
    const downloads = await getDownloadedSongs();

    const selected = downloads.find(
      (item) => item.id === id
    );

    if (selected?.localUri) {
      const info = await FileSystem.getInfoAsync(
        selected.localUri
      );

      if (info.exists) {
        await FileSystem.deleteAsync(selected.localUri);
      }
    }

    const updatedDownloads = downloads.filter(
      (item) => item.id !== id
    );

    await AsyncStorage.setItem(
      DOWNLOADS_KEY,
      JSON.stringify(updatedDownloads)
    );

    return true;
  } catch (error) {
    console.log("Delete download error:", error);

    return false;
  }
}

export async function clearDownloads() {
  try {
    const downloads = await getDownloadedSongs();

    for (const song of downloads) {
      if (song.localUri) {
        const info = await FileSystem.getInfoAsync(
          song.localUri
        );

        if (info.exists) {
          await FileSystem.deleteAsync(song.localUri);
        }
      }
    }

    await AsyncStorage.removeItem(DOWNLOADS_KEY);

    return true;
  } catch (error) {
    console.log("Clear downloads error:", error);

    return false;
  }
}
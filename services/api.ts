const API_BASE_URL = "https://hiddentunes.com/api";

export type Song = {
  id: string;
  title: string;
  artist: string;
  cover: string;
  audio: string;
};

export async function fetchTrendingSongs(): Promise<Song[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/trending`);

    if (!response.ok) {
      throw new Error("Failed to fetch trending songs");
    }

    return await response.json();
  } catch (error) {
    console.log("Trending fetch error:", error);

    return [];
  }
}

export async function searchSongs(query: string): Promise<Song[]> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/search?q=${encodeURIComponent(query)}`
    );

    if (!response.ok) {
      throw new Error("Failed to search songs");
    }

    return await response.json();
  } catch (error) {
    console.log("Search error:", error);

    return [];
  }
}

export async function loginUser(email: string, password: string) {
  try {
    const response = await fetch(`${API_BASE_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    return await response.json();
  } catch (error) {
    console.log("Login error:", error);

    return null;
  }
}

export async function registerUser(
  name: string,
  email: string,
  password: string
) {
  try {
    const response = await fetch(`${API_BASE_URL}/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        email,
        password,
      }),
    });

    return await response.json();
  } catch (error) {
    console.log("Register error:", error);

    return null;
  }
}
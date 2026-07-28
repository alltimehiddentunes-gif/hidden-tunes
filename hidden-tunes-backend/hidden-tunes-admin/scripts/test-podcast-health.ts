import assert from "node:assert/strict";

import { probePodcastAudioUrl } from "../lib/podcastAudioProbe";
import { probePodcastFeedUrl } from "../lib/podcastFeedProbe";

function mockResponse(input: {
  status: number;
  headers?: Record<string, string>;
  body?: string;
  location?: string;
}) {
  const headers = new Map(Object.entries(input.headers || {}));
  if (input.location) headers.set("location", input.location);
  const bodyText = input.body || "";
  return {
    ok: input.status >= 200 && input.status < 300,
    status: input.status,
    headers: {
      get(name: string) {
        return headers.get(name.toLowerCase()) || headers.get(name) || null;
      },
    },
    async text() {
      return bodyText;
    },
    body: {
      getReader() {
        let sent = false;
        return {
          async read() {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: Buffer.from(bodyText) };
          },
          async cancel() {},
        };
      },
    },
  } as unknown as Response;
}

const healthyRss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Healthy</title><item><title>Ep</title><enclosure url="https://cdn.example.com/a.mp3" type="audio/mpeg"/></item></channel></rss>`;

const fetchHealthy = async (url: string | URL | Request) => {
  const target = String(url);
  if (target.includes("redirect")) {
    return mockResponse({ status: 302, location: "https://cdn.example.com/feed.xml" });
  }
  if (target.includes("html")) {
    return mockResponse({ status: 200, body: "<html><body>error</body></html>" });
  }
  if (target.includes("timeout")) {
    throw new Error("AbortError");
  }
  return mockResponse({
    status: 200,
    headers: { "content-type": "application/rss+xml" },
    body: healthyRss,
  });
};

void (async () => {
  const okFeed = await probePodcastFeedUrl("https://cdn.example.com/feed.xml", {
    fetchImpl: fetchHealthy as typeof fetch,
  });
  assert.equal(okFeed.ok, true);
  assert.equal(okFeed.episode_count, 1);

  const htmlFeed = await probePodcastFeedUrl("https://cdn.example.com/html.xml", {
    fetchImpl: fetchHealthy as typeof fetch,
  });
  assert.equal(htmlFeed.ok, false);
  assert.equal(htmlFeed.reason, "feed_html_error_page");

  const audioHead = await probePodcastAudioUrl("https://cdn.example.com/a.mp3", {
    fetchImpl: async () =>
      mockResponse({
        status: 200,
        headers: { "content-type": "audio/mpeg", "content-length": "50000" },
      }),
  });
  assert.equal(audioHead.ok, true);
  assert.equal(audioHead.method, "HEAD");

  const audioHtml = await probePodcastAudioUrl("https://cdn.example.com/b.mp3", {
    fetchImpl: async () =>
      mockResponse({
        status: 200,
        headers: { "content-type": "text/html" },
        body: "<html></html>",
      }),
  });
  assert.equal(audioHtml.ok, false);

  console.log("test-podcast-health passed");
})();

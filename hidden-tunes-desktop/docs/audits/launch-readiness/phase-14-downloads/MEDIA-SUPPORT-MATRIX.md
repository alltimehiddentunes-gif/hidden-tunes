# Media Support Matrix

| Media type | Download source | Stable file URL? | Supported format | Offline playback | Final policy |
| ---------- | --------------- | ---------------: | ---------------- | ---------------: | ------------ |
| Music song | Candidate HTTPS from player | When stable HTTPS known | audio/* finite | Yes via prefer-local | Partial — player Download when stable URL |
| Podcast episode | Catalog `/play` resolve | Yes when finite file | audio/* | Yes | Download supported |
| Podcast show | — | No | — | No | Streaming-only |
| Audiobook chapter | Catalog resolve | Yes when finite | audio/* | Yes | Download supported |
| Audiobook book | — | No | — | No | Streaming-only container |
| Motivational session | Catalog resolve | Finite file only | audio/* | Yes | Partial — reject stream/embed |
| Lecture session | Catalog resolve | Finite file only | audio/* | Yes | Partial — reject stream/embed |
| Radio | — | Live | — | No | Streaming-only |
| TV | — | Live/HLS | — | No | Streaming-only |
| Sports | — | Live | — | No | Streaming-only |

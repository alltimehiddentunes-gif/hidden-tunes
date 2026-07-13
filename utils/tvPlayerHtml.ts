export function buildTvStreamPlayerHtml(streamUrl: string) {
  const streamUrlJson = JSON.stringify(streamUrl);

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
    />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #000;
      }

      video {
        width: 100%;
        height: 100%;
        background: #000;
        object-fit: contain;
      }
    </style>
  </head>
  <body>
    <video
      id="hiddenTunesTvPlayer"
      controls
      autoplay
      playsinline
      webkit-playsinline
      preload="none"
    ></video>
    <script>
      var streamUrl = ${streamUrlJson};
      var video = document.getElementById("hiddenTunesTvPlayer");
      var readySent = false;

      function post(payload) {
        if (!window.ReactNativeWebView) return;
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        } catch (e) {}
      }

      function notifyReady() {
        if (readySent) return;
        readySent = true;
        post({ type: "tv_ready" });
      }

      function notifyError(reason) {
        post({ type: "tv_error", reason: reason || "playback_error" });
      }

      video.addEventListener("playing", notifyReady);
      video.addEventListener("timeupdate", function () {
        if (video.currentTime > 0.25) notifyReady();
      });
      video.addEventListener("error", function () {
        notifyError("video_error");
      });
      video.addEventListener("stalled", function () {
        setTimeout(function () {
          if (!readySent && video.readyState < 2) {
            notifyError("stalled");
          }
        }, 12000);
      });

      video.src = streamUrl;
      video.play().catch(function () {
        notifyError("autoplay_blocked");
      });

      setTimeout(function () {
        if (!readySent) notifyError("timeout");
      }, 18000);
    </script>
  </body>
</html>`;
}

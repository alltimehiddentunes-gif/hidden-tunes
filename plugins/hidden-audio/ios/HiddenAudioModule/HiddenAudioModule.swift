import AVFoundation
import MediaPlayer
import React
import UIKit

@objc(HiddenAudioModule)
class HiddenAudioModule: RCTEventEmitter {
  private var player: AVPlayer?
  private var activeTrack: [String: Any]?
  private var queue: [[String: Any]] = []
  private var activeIndex = -1
  private var currentItem: AVPlayerItem?
  private var progressObserverToken: Any?
  private var itemEndObserver: NSObjectProtocol?
  private var itemStatusObserver: NSKeyValueObservation?
  private var timeControlObserver: NSKeyValueObservation?
  private var rateObserver: NSKeyValueObservation?
  private var loadedTimeRangesObserver: NSKeyValueObservation?
  private var bufferEmptyObserver: NSKeyValueObservation?
  private var likelyToKeepUpObserver: NSKeyValueObservation?
  private var playerStatus = "idle"
  private var shouldResumeAfterItemLoad = false
  private var lastProgressDiagnosticAt = 0.0
  private var lastNowPlayingElapsedDiagnosticAt = 0.0
  private var lastBufferDiagnosticAt = 0.0
  private var nowPlayingArtworkUrl: String?
  private var nowPlayingArtwork: MPMediaItemArtwork?
  private var remoteCommandsRegistered = false
  private var lifecycleObserversRegistered = false
  private var currentItemEndedHandled = false
  private var wasPlayingBeforeInterruption = false
  private var backgroundEnteredAt: TimeInterval = 0
  private var isAppInBackground = false
  private var jsQueueLength = 0
  private var jsActiveIndex = -1
  private var lastBackgroundRecoveryAt: TimeInterval = 0
  private let intentionalPauseCooldownSeconds: TimeInterval = 8.0
  private var lastIntentionalPauseAt: TimeInterval = 0
  private var intentionalPauseReason = ""

  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  deinit {
    emitDiagnostic("hidden_audio_module_deinit")
    cleanupPlayerObservers()
    NotificationCenter.default.removeObserver(self)
  }

  override func supportedEvents() -> [String]! {
    return [
      "HiddenAudioState",
      "HiddenAudioProgress",
      "HiddenAudioProgressChanged",
      "HiddenAudioTrackChanged",
      "HiddenAudioPlaybackEnded",
      "HiddenAudioDiagnostic"
    ]
  }

  @objc(setup:rejecter:)
  func setup(resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    do {
      try activateAudioSession()
      let carPlayManager = HiddenAudioCarPlayManager.shared
      carPlayManager.playbackHandler = self
      carPlayManager.onCarPlayDiagnostic = { [weak self] data in
        self?.emitDiagnostic("ios_carplay_status", data)
      }
      carPlayManager.startIfNeeded()
      emitDiagnostic("ios_carplay_prepared", [
        "entitlementMode": "carplay-audio+video",
        "hasCarPlayAudioEntitlement": true,
        "hasCarPlayVideoEntitlement": true,
        "sceneDelegate": "CarPlaySceneDelegate",
      ])
      resolve(nil)
    } catch {
      emitNativeError(error.localizedDescription)
      reject("HIDDEN_AUDIO_SETUP_FAILED", error.localizedDescription, error)
    }
  }

  @objc(syncCarPlayCatalog:resolver:rejecter:)
  func syncCarPlayCatalog(
    snapshot: NSDictionary,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    let map = snapshot.compactMapKeys()
    HiddenAudioCarPlayManager.shared.applyCatalogSnapshot(map)
    let trackCount = (map["tracks"] as? [Any])?.count ?? 0
    emitDiagnostic("ios_carplay_catalog_synced", [
      "trackCount": trackCount,
      "sectionCount": (map["sections"] as? [Any])?.count ?? 0,
    ])
    resolve(nil)
  }

  @objc(loadTrack:resolver:rejecter:)
  func loadTrack(
    track: NSDictionary,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    let trackMap = track.compactMapKeys()
    queue = [trackMap]
    activeIndex = 0
    clearIntentionalPause(reason: "new_track")
    do {
      try loadActiveTrack(autoplay: false)
      resolve(nil)
    } catch {
      emitNativeError(error.localizedDescription)
      reject("HIDDEN_AUDIO_LOAD_TRACK_FAILED", error.localizedDescription, error)
    }
  }

  @objc(loadQueue:startIndex:resolver:rejecter:)
  func loadQueue(
    tracks: NSArray,
    startIndex: NSNumber,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    let mappedTracks = tracks.compactMap { ($0 as? NSDictionary)?.compactMapKeys() }
    guard !mappedTracks.isEmpty else {
      emitNativeError("Queue is empty")
      reject("HIDDEN_AUDIO_EMPTY_QUEUE", "Queue is empty", nil)
      return
    }

    queue = mappedTracks
    activeIndex = max(0, min(startIndex.intValue, queue.count - 1))
    clearIntentionalPause(reason: "new_track")

    do {
      try loadActiveTrack(autoplay: false)
      emitDiagnostic("hidden_audio_native_queue_loaded", [
        "trackCount": queue.count,
        "activeIndex": activeIndex
      ])
      resolve(nil)
    } catch {
      emitNativeError(error.localizedDescription)
      reject("HIDDEN_AUDIO_LOAD_QUEUE_FAILED", error.localizedDescription, error)
    }
  }

  @objc(updateRemoteQueueAvailability:queueLength:resolver:rejecter:)
  func updateRemoteQueueAvailability(
    activeIndex: NSNumber,
    queueLength: NSNumber,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    jsActiveIndex = activeIndex.intValue
    jsQueueLength = max(0, queueLength.intValue)
    emitDiagnostic("hidden_audio_remote_queue_availability_synced", [
      "jsActiveIndex": jsActiveIndex,
      "jsQueueLength": jsQueueLength,
      "nativeQueueLength": queue.count,
      "nativeActiveIndex": self.activeIndex
    ])
    updateRemoteCommandAvailability()
    resolve(nil)
  }

  @objc(play:rejecter:)
  func play(resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    guard let currentPlayer = player else {
      emitNativeError("No player is loaded")
      reject("HIDDEN_AUDIO_NO_PLAYER", "No player is loaded", nil)
      return
    }

    do {
      try activateAudioSession()
    } catch {
      emitNativeError(error.localizedDescription)
      reject("HIDDEN_AUDIO_AUDIO_SESSION_FAILED", error.localizedDescription, error)
      return
    }

    clearIntentionalPause(reason: "play")

    emitDiagnostic("hidden_audio_native_play_requested", [
      "trackId": activeTrack?["id"] as? String ?? "",
      "activeIndex": activeIndex,
      "rate": currentPlayer.rate,
      "timeControlStatus": currentPlayer.timeControlStatus.rawValue
    ])

    let alreadyAdvancing =
      currentPlayer.rate > 0 ||
      currentPlayer.timeControlStatus == .playing

    if alreadyAdvancing {
      shouldResumeAfterItemLoad = true
      emitDiagnostic("hidden_audio_play_reassert_session_only", [
        "trackId": activeTrack?["id"] as? String ?? "",
        "activeIndex": activeIndex
      ])
      startProgressObserver()
      updateRemoteCommandAvailability()
      updateNowPlayingInfo()
      emitState()
      resolve(nil)
      return
    }

    shouldResumeAfterItemLoad = true
    playerStatus = "buffering"
    currentPlayer.play()
    startProgressObserver()
    updateRemoteCommandAvailability()
    emitState()

    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
      self?.confirmPlayingIfNeeded()
    }

    resolve(nil)
  }

  @objc(pause:rejecter:)
  func pause(resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    if isAppInBackground && shouldResumeAfterItemLoad {
      emitDiagnostic("hidden_audio_pause_blocked_in_background", [
        "status": playerStatus,
        "activeIndex": activeIndex
      ])
      resolve(nil)
      return
    }
    markIntentionalPause(reason: "native_pause")
    player?.pause()
    playerStatus = player == nil ? "idle" : "paused"
    stopProgressObserver()
    updateRemoteCommandAvailability()
    updateNowPlayingInfo()
    emitState()
    resolve(nil)
  }

  @objc(resume:rejecter:)
  func resume(resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    play(resolve: resolve, rejecter: reject)
  }

  @objc(stop:rejecter:)
  func stop(resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    if isAppInBackground && shouldResumeAfterItemLoad {
      emitDiagnostic("hidden_audio_stop_blocked_in_background", [
        "status": playerStatus,
        "activeIndex": activeIndex
      ])
      resolve(nil)
      return
    }
    shouldResumeAfterItemLoad = false
    player?.pause()
    player?.seek(to: .zero)
    playerStatus = player == nil ? "idle" : "stopped"
    stopProgressObserver()
    updateRemoteCommandAvailability()
    updateNowPlayingInfo()
    emitState()
    resolve(nil)
  }

  @objc(seekTo:resolver:rejecter:)
  func seekTo(
    seconds: NSNumber,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    let targetSeconds = max(0, seconds.doubleValue)
    currentItemEndedHandled = false
    if playerStatus == "ended" {
      playerStatus = player?.rate ?? 0 > 0 ? "playing" : "paused"
    }

    let time = CMTime(seconds: targetSeconds, preferredTimescale: 600)
    player?.seek(to: time)
    startProgressObserver()
    emitProgress()
    updateNowPlayingInfo()
    resolve(nil)
  }

  @objc(next:rejecter:)
  func next(resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    moveToIndex(activeIndex + 1, autoplay: true)
    resolve(nil)
  }

  @objc(previous:rejecter:)
  func previous(resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    moveToIndex(max(0, activeIndex - 1), autoplay: true)
    resolve(nil)
  }

  @objc(getState:rejecter:)
  func getState(resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve(statePayload())
  }

  @objc(getProgress:rejecter:)
  func getProgress(resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve(progressPayload())
  }

  @objc(getActiveTrack:rejecter:)
  func getActiveTrack(resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve(activeTrack)
  }

  private func loadActiveTrack(autoplay: Bool) throws {
    guard activeIndex >= 0 && activeIndex < queue.count else {
      throw NSError(
        domain: "HiddenAudio",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Active queue index is invalid"]
      )
    }

    let track = queue[activeIndex]
    guard let urlString = track["url"] as? String,
          let url = URL(string: urlString),
          ["http", "https", "file"].contains(url.scheme?.lowercased() ?? "") else {
      throw NSError(
        domain: "HiddenAudio",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Track url is invalid"]
      )
    }

    emitDiagnostic("hidden_audio_native_load_start", [
      "trackId": track["id"] as? String ?? "hidden-audio-track",
      "activeIndex": activeIndex,
      "urlScheme": url.scheme ?? "",
      "urlHost": url.host ?? ""
    ])
    emitDiagnostic("hidden_audio_native_url_valid", [
      "scheme": url.scheme ?? "",
      "trackId": track["id"] as? String ?? "hidden-audio-track"
    ])

    try activateAudioSession()

    activeTrack = normalizeTrack(track, urlString: urlString)
    cleanupPlayerObservers()

    emitDiagnostic("hidden_audio_native_player_item_create_start", [
      "trackId": activeTrack?["id"] as? String ?? "",
      "activeIndex": activeIndex,
      "urlScheme": url.scheme ?? "",
      "urlHost": url.host ?? ""
    ])
    let item = AVPlayerItem(url: url)
    currentItem = item
    currentItemEndedHandled = false
    player = AVPlayer(playerItem: item)
    playerStatus = autoplay ? "buffering" : "ready"
    shouldResumeAfterItemLoad = autoplay
    observePlayerItem(item)
    observePlayer()
    updateRemoteCommandAvailability()
    emitDiagnostic("hidden_audio_native_player_created", [
      "trackId": activeTrack?["id"] as? String ?? "",
      "activeIndex": activeIndex
    ])
    runNonCriticalSetup("remote_commands_after_player_created") {
      configureRemoteCommands()
    }
    runNonCriticalSetup("lifecycle_observers_after_player_created") {
      configureLifecycleObservers()
    }
    runNonCriticalSetup("now_playing_after_player_created") {
      updateNowPlayingInfo()
    }
    runNonCriticalSetup("artwork_after_player_created") {
      loadNowPlayingArtworkIfNeeded()
    }
    emitTrackChanged()
    emitState()

    if autoplay {
      player?.play()
      startProgressObserver()
    }
  }

  private func normalizeTrack(_ track: [String: Any], urlString: String) -> [String: Any] {
    return [
      "id": track["id"] as? String ?? "hidden-audio-track",
      "url": urlString,
      "title": track["title"] as? String ?? "Hidden Tunes",
      "artist": track["artist"] as? String ?? "Hidden Tunes",
      "album": track["album"] as? String ?? "",
      "artworkUrl": track["artworkUrl"] as? String ?? "",
      "durationSeconds": track["durationSeconds"] as? NSNumber ?? 0
    ]
  }

  @objc private func playerItemDidEnd(_ notification: Notification) {
    guard let endedItem = notification.object as? AVPlayerItem,
          endedItem === currentItem else {
      emitDiagnostic("hidden_audio_stale_item_event_ignored", [
        "event": "ended",
        "activeIndex": activeIndex
      ])
      return
    }

    emitDiagnostic("hidden_audio_native_end_observer_fired", [
      "trackId": activeTrack?["id"] as? String ?? "",
      "activeIndex": activeIndex
    ])
    handleCurrentItemEnded(source: "notification")
  }

  private func handleCurrentItemEnded(source: String) {
    if currentItemEndedHandled {
      emitDiagnostic("hidden_audio_duplicate_track_end_ignored", [
        "trackId": activeTrack?["id"] as? String ?? "",
        "activeIndex": activeIndex,
        "source": source
      ])
      return
    }

    currentItemEndedHandled = true
    let progress = progressPayload()
    if source == "position_fallback" {
      emitDiagnostic("hidden_audio_native_end_fallback_emitted", [
        "trackId": activeTrack?["id"] as? String ?? "",
        "activeIndex": activeIndex,
        "positionSeconds": progress["positionSeconds"] ?? 0,
        "durationSeconds": progress["durationSeconds"] ?? 0
      ])
    }
    emitDiagnostic("hidden_audio_native_track_ended", [
      "trackId": activeTrack?["id"] as? String ?? "",
      "activeIndex": activeIndex,
      "source": source
    ])
    emitPlaybackEnded()

    shouldResumeAfterItemLoad = false
    playerStatus = "ended"
    stopProgressObserver()
    updateRemoteCommandAvailability()
    updateNowPlayingInfo()
    emitState()
  }

  private func moveToIndex(_ nextIndex: Int, autoplay: Bool) {
    guard nextIndex >= 0 && nextIndex < queue.count else {
      shouldResumeAfterItemLoad = false
      playerStatus = "ended"
      stopProgressObserver()
      updateRemoteCommandAvailability()
      updateNowPlayingInfo()
      emitState()
      return
    }

    activeIndex = nextIndex
    if autoplay {
      clearIntentionalPause(reason: "new_track")
    }
    do {
      try loadActiveTrack(autoplay: autoplay)
      if autoplay {
        emitDiagnostic("hidden_audio_native_play_requested", [
          "trackId": activeTrack?["id"] as? String ?? "",
          "activeIndex": activeIndex
        ])
      }
    } catch {
      emitNativeError(error.localizedDescription)
    }
  }

  private func activateAudioSession() throws {
    let session = AVAudioSession.sharedInstance()
    emitDiagnostic("hidden_audio_audio_session_config_start", [
      "category": "playback",
      "mode": "default",
      "options": "none"
    ])

    do {
      try session.setCategory(.playback, mode: .default, options: [])
      emitDiagnostic("ios_audio_session_category_success", [
        "category": session.category.rawValue,
        "mode": session.mode.rawValue
      ])
      emitDiagnostic("hidden_audio_audio_session_category_success", [
        "category": session.category.rawValue,
        "mode": session.mode.rawValue
      ])
    } catch {
      emitDiagnostic("hidden_audio_audio_session_config_failed", [
        "message": error.localizedDescription,
        "phase": "setCategory"
      ])
      throw error
    }

    do {
      try session.setActive(true)
      emitDiagnostic("ios_audio_session_active_success", [
        "category": session.category.rawValue,
        "mode": session.mode.rawValue
      ])
      emitDiagnostic("hidden_audio_native_audio_session_active", [
        "category": session.category.rawValue,
        "mode": session.mode.rawValue
      ])
      emitDiagnostic("ios_background_playback_status", [
        "audioSessionActive": true,
        "category": session.category.rawValue,
        "status": playerStatus
      ])
    } catch {
      emitDiagnostic("ios_audio_session_active_failed", [
        "message": error.localizedDescription
      ])
      emitDiagnostic("hidden_audio_audio_session_active_failed", [
        "message": error.localizedDescription
      ])
    }
  }

  private func observePlayerItem(_ item: AVPlayerItem) {
    itemStatusObserver = item.observe(\.status, options: [.new]) { [weak self] item, _ in
      guard let self = self else { return }
      self.emitDiagnostic("hidden_audio_player_item_status", [
        "status": item.status.rawValue,
        "durationSeconds": self.safeDurationSeconds(for: item),
        "urlHost": self.currentUrlHost(),
        "urlScheme": self.currentUrlScheme()
      ])

      if item.status == .failed {
        self.playerStatus = "error"
        self.emitDiagnostic("hidden_audio_player_failed", [
          "message": item.error?.localizedDescription ?? "AVPlayerItem failed",
          "errorLog": self.errorLogSummary(item),
          "accessLog": self.accessLogSummary(item)
        ])
        self.emitNativeError(item.error?.localizedDescription ?? "AVPlayerItem failed")
        self.emitState()
      }
    }

    itemEndObserver = NotificationCenter.default.addObserver(
      forName: .AVPlayerItemDidPlayToEndTime,
      object: item,
      queue: .main
    ) { [weak self] notification in
      self?.playerItemDidEnd(notification)
    }

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(playerItemStalled(_:)),
      name: .AVPlayerItemPlaybackStalled,
      object: item
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(playerItemFailedToEnd(_:)),
      name: .AVPlayerItemFailedToPlayToEndTime,
      object: item
    )

    loadedTimeRangesObserver = item.observe(\.loadedTimeRanges, options: [.new]) { [weak self] item, _ in
      guard let self = self else { return }
      let now = Date().timeIntervalSince1970
      if now - self.lastBufferDiagnosticAt < 15 { return }
      self.lastBufferDiagnosticAt = now
      self.emitDiagnostic("hidden_audio_loaded_time_ranges", [
        "bufferedSeconds": self.bufferedEndSeconds(for: item),
        "durationSeconds": self.safeDurationSeconds(for: item)
      ])
    }

    bufferEmptyObserver = item.observe(\.isPlaybackBufferEmpty, options: [.new]) { [weak self] item, _ in
      guard let self = self else { return }
      if item.isPlaybackBufferEmpty {
        self.emitDiagnostic("hidden_audio_playback_buffer_empty", [
          "trackId": self.activeTrack?["id"] as? String ?? "",
          "activeIndex": self.activeIndex,
          "bufferedSeconds": self.bufferedEndSeconds(for: item)
        ])
        self.emitDiagnostic("native_playback_buffer_status", [
          "bufferEmpty": true,
          "trackId": self.activeTrack?["id"] as? String ?? "",
          "activeIndex": self.activeIndex,
          "bufferedSeconds": self.bufferedEndSeconds(for: item)
        ])
      }
    }

    likelyToKeepUpObserver = item.observe(\.isPlaybackLikelyToKeepUp, options: [.new]) { [weak self] item, _ in
      guard let self = self else { return }
      self.emitDiagnostic("hidden_audio_playback_likely_to_keep_up", [
        "likelyToKeepUp": item.isPlaybackLikelyToKeepUp,
        "trackId": self.activeTrack?["id"] as? String ?? "",
        "activeIndex": self.activeIndex,
        "bufferedSeconds": self.bufferedEndSeconds(for: item)
      ])
      self.emitDiagnostic("native_playback_buffer_status", [
        "likelyToKeepUp": item.isPlaybackLikelyToKeepUp,
        "trackId": self.activeTrack?["id"] as? String ?? "",
        "activeIndex": self.activeIndex,
        "bufferedSeconds": self.bufferedEndSeconds(for: item)
      ])
    }
  }

  private func observePlayer() {
    guard let currentPlayer = player else { return }
    timeControlObserver = currentPlayer.observe(\.timeControlStatus, options: [.new]) { [weak self] _, _ in
      guard let self = self else { return }
      self.emitDiagnostic("hidden_audio_time_control_status", [
        "status": currentPlayer.timeControlStatus.rawValue,
        "rate": currentPlayer.rate
      ])
      self.emitDiagnostic("native_playback_state_changed", [
        "status": currentPlayer.timeControlStatus.rawValue,
        "rate": currentPlayer.rate
      ])
      self.emitDiagnostic("hidden_audio_native_status_background", [
        "status": self.playerStatus,
        "timeControlStatus": currentPlayer.timeControlStatus.rawValue,
        "rate": currentPlayer.rate
      ])
      self.confirmPlayingIfNeeded()
      if currentPlayer.timeControlStatus == .paused && self.shouldResumeAfterItemLoad {
        self.reassertBackgroundPlaybackIfNeeded(reason: "time_control_paused")
      }
    }
    rateObserver = currentPlayer.observe(\.rate, options: [.new]) { [weak self] player, _ in
      self?.emitDiagnostic("hidden_audio_player_rate_changed", [
        "rate": player.rate,
        "timeControlStatus": player.timeControlStatus.rawValue
      ])
      self?.emitDiagnostic("native_playback_is_playing", [
        "isPlaying": player.rate > 0,
        "rate": player.rate,
        "timeControlStatus": player.timeControlStatus.rawValue
      ])
      self?.confirmPlayingIfNeeded()
    }
  }

  private func confirmPlayingIfNeeded() {
    guard let currentPlayer = player else { return }
    if playerStatus == "ended" || currentItemEndedHandled { return }
    if hasRecentIntentionalPause() && playerStatus == "paused" { return }
    if currentPlayer.rate > 0 || currentPlayer.timeControlStatus == .playing {
      if playerStatus != "playing" {
        playerStatus = "playing"
        emitDiagnostic("hidden_audio_native_playing_confirmed", [
          "trackId": activeTrack?["id"] as? String ?? "",
          "activeIndex": activeIndex
        ])
        emitDiagnostic("native_playback_is_playing", [
          "isPlaying": true,
          "trackId": activeTrack?["id"] as? String ?? "",
          "activeIndex": activeIndex
        ])
        updateNowPlayingInfo()
      }
      startProgressObserver()
      emitState()
    }
  }

  private func configureRemoteCommands() {
    if remoteCommandsRegistered { return }
    remoteCommandsRegistered = true

    let commandCenter = MPRemoteCommandCenter.shared()
    commandCenter.playCommand.isEnabled = true
    commandCenter.pauseCommand.isEnabled = true
    commandCenter.togglePlayPauseCommand.isEnabled = true
    commandCenter.nextTrackCommand.isEnabled = true
    commandCenter.previousTrackCommand.isEnabled = true
    commandCenter.changePlaybackPositionCommand.isEnabled = true
    updateRemoteCommandAvailability()

    commandCenter.playCommand.addTarget { [weak self] _ in
      guard let self = self, self.player != nil else {
        self?.emitRemoteCommandResult("play", success: false, reason: "no_player")
        return .commandFailed
      }
      self.emitDiagnostic("remote_command_received", [
        "command": "play"
      ])
      self.emitDiagnostic("ios_remote_command_received", [
        "command": "play"
      ])
      self.emitDiagnostic("remote_play_received")
      self.clearIntentionalPause(reason: "play")
      self.emitDiagnostic("remote_command_dispatched_to_js", [
        "command": "play"
      ])
      do {
        try self.activateAudioSession()
      } catch {
        self.emitRemoteCommandResult("play", success: false, reason: error.localizedDescription)
        return .commandFailed
      }
      self.playerStatus = "buffering"
      self.player?.play()
      self.shouldResumeAfterItemLoad = true
      self.startProgressObserver()
      self.updateNowPlayingInfo()
      self.emitState()
      self.confirmPlayingIfNeeded()
      self.emitDiagnostic("remote_command_native_action_success", [
        "command": "play"
      ])
      self.emitRemoteCommandResult("play", success: true)
      return .success
    }

    commandCenter.pauseCommand.addTarget { [weak self] _ in
      guard let self = self, self.player != nil else {
        self?.emitRemoteCommandResult("pause", success: false, reason: "no_player")
        return .commandFailed
      }
      self.emitDiagnostic("remote_command_received", [
        "command": "pause"
      ])
      self.emitDiagnostic("ios_remote_command_received", [
        "command": "pause"
      ])
      self.emitDiagnostic("remote_pause_received")
      self.markIntentionalPause(reason: "remote_pause")
      self.emitDiagnostic("remote_command_dispatched_to_js", [
        "command": "pause"
      ])
      self.player?.pause()
      self.shouldResumeAfterItemLoad = false
      self.playerStatus = "paused"
      self.stopProgressObserver()
      self.updateNowPlayingInfo()
      self.emitState()
      self.emitDiagnostic("remote_command_native_action_success", [
        "command": "pause"
      ])
      self.emitRemoteCommandResult("pause", success: true)
      return .success
    }

    commandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
      guard let self = self, self.player != nil else {
        self?.emitRemoteCommandResult("toggle", success: false, reason: "no_player")
        return .commandFailed
      }
      self.emitDiagnostic("ios_remote_command_received", [
        "command": "toggle"
      ])
      self.emitDiagnostic("hidden_audio_remote_toggle_received", [
        "status": self.playerStatus
      ])
      if self.playerStatus == "playing" {
        self.markIntentionalPause(reason: "remote_toggle_pause")
        self.player?.pause()
        self.shouldResumeAfterItemLoad = false
        self.playerStatus = "paused"
        self.stopProgressObserver()
        self.updateNowPlayingInfo()
        self.emitState()
      } else {
        do {
          try self.activateAudioSession()
        } catch {
          self.emitRemoteCommandResult("toggle", success: false, reason: error.localizedDescription)
          return .commandFailed
        }
        self.clearIntentionalPause(reason: "play")
        self.shouldResumeAfterItemLoad = true
        self.player?.play()
        self.startProgressObserver()
        self.confirmPlayingIfNeeded()
      }
      self.emitRemoteCommandResult("toggle", success: true)
      return .success
    }

    commandCenter.nextTrackCommand.addTarget { [weak self] _ in
      guard let self = self else { return .commandFailed }
      let effectiveQueueLength = max(self.queue.count, self.jsQueueLength)
      let effectiveIndex = self.jsQueueLength > 0 ? self.jsActiveIndex : self.activeIndex
      self.emitDiagnostic("remote_command_received", [
        "command": "next"
      ])
      self.emitDiagnostic("ios_remote_command_received", [
        "command": "next",
        "activeIndex": effectiveIndex,
        "queueLength": effectiveQueueLength
      ])
      self.emitDiagnostic("remote_next_received", [
        "activeIndex": effectiveIndex,
        "queueLength": effectiveQueueLength,
        "forwardedTo": "js_shared_next"
      ])
      self.emitDiagnostic("remote_command_dispatched_to_js", [
        "command": "next"
      ])
      return .success
    }

    commandCenter.previousTrackCommand.addTarget { [weak self] _ in
      guard let self = self else { return .commandFailed }
      let effectiveQueueLength = max(self.queue.count, self.jsQueueLength)
      let effectiveIndex = self.jsQueueLength > 0 ? self.jsActiveIndex : self.activeIndex
      self.emitDiagnostic("remote_command_received", [
        "command": "previous"
      ])
      self.emitDiagnostic("ios_remote_command_received", [
        "command": "previous",
        "activeIndex": effectiveIndex,
        "queueLength": effectiveQueueLength
      ])
      self.emitDiagnostic("remote_previous_received", [
        "activeIndex": effectiveIndex,
        "queueLength": effectiveQueueLength,
        "forwardedTo": "js_shared_previous"
      ])
      self.emitDiagnostic("remote_command_dispatched_to_js", [
        "command": "previous"
      ])
      return .success
    }

    commandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
      guard let positionEvent = event as? MPChangePlaybackPositionCommandEvent else {
        self?.emitRemoteCommandResult("seek", success: false, reason: "invalid_event")
        return .commandFailed
      }
      self?.emitDiagnostic("ios_remote_command_received", [
        "command": "seek"
      ])
      self?.emitDiagnostic("hidden_audio_remote_seek_received", [
        "positionSeconds": positionEvent.positionTime
      ])
      self?.player?.seek(
        to: CMTime(seconds: positionEvent.positionTime, preferredTimescale: 600)
      )
      self?.emitProgress()
      self?.updateNowPlayingInfo()
      self?.emitRemoteCommandResult("seek", success: true)
      return .success
    }

    emitDiagnostic("hidden_audio_remote_commands_registered")
  }

  private func updateRemoteCommandAvailability() {
    guard remoteCommandsRegistered else { return }
    let commandCenter = MPRemoteCommandCenter.shared()
    let effectiveQueueLength = max(queue.count, jsQueueLength)
    let effectiveIndex = jsQueueLength > 0 ? jsActiveIndex : activeIndex
    let hasNext = effectiveIndex >= 0 && effectiveIndex + 1 < effectiveQueueLength
    let hasPrevious = effectiveIndex > 0 || player != nil
    commandCenter.nextTrackCommand.isEnabled = hasNext
    commandCenter.previousTrackCommand.isEnabled = hasPrevious
    commandCenter.changePlaybackPositionCommand.isEnabled = player != nil
    commandCenter.playCommand.isEnabled = player != nil
    commandCenter.pauseCommand.isEnabled = player != nil
    commandCenter.togglePlayPauseCommand.isEnabled = player != nil
  }

  private func configureLifecycleObservers() {
    if lifecycleObserversRegistered { return }
    lifecycleObserversRegistered = true

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(appEnteredBackground(_:)),
      name: UIApplication.didEnterBackgroundNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(appEnteredForeground(_:)),
      name: UIApplication.willEnterForegroundNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(audioInterruption(_:)),
      name: AVAudioSession.interruptionNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(audioRouteChanged(_:)),
      name: AVAudioSession.routeChangeNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(silenceSecondaryAudioHint(_:)),
      name: AVAudioSession.silenceSecondaryAudioHintNotification,
      object: nil
    )
  }

  private func updateNowPlayingInfo() {
    var info: [String: Any] = [:]
    info[MPMediaItemPropertyTitle] = activeTrack?["title"] as? String ?? "Hidden Tunes"
    info[MPMediaItemPropertyArtist] = activeTrack?["artist"] as? String ?? "Hidden Tunes"
    info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = progressPayload()["positionSeconds"]
    info[MPMediaItemPropertyPlaybackDuration] = progressPayload()["durationSeconds"]
    info[MPNowPlayingInfoPropertyPlaybackRate] = playerStatus == "playing" ? 1 : 0
    if let artwork = nowPlayingArtwork {
      info[MPMediaItemPropertyArtwork] = artwork
    }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    emitDiagnostic("hidden_audio_now_playing_set", [
      "trackId": activeTrack?["id"] as? String ?? "",
      "durationSeconds": progressPayload()["durationSeconds"] ?? 0,
      "playbackRate": playerStatus == "playing" ? 1 : 0
    ])
  }

  private func loadNowPlayingArtworkIfNeeded() {
    guard let artworkUrl = activeTrack?["artworkUrl"] as? String,
          !artworkUrl.isEmpty,
          artworkUrl != nowPlayingArtworkUrl,
          let url = URL(string: artworkUrl) else {
      return
    }

    nowPlayingArtworkUrl = artworkUrl
    nowPlayingArtwork = nil

    URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
      guard let self = self,
            self.nowPlayingArtworkUrl == artworkUrl,
            let data = data,
            let image = UIImage(data: data) else {
        return
      }

      let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
      DispatchQueue.main.async {
        self.nowPlayingArtwork = artwork
        self.updateNowPlayingInfo()
      }
    }.resume()
  }

  private func startProgressObserver() {
    guard progressObserverToken == nil, let currentPlayer = player else { return }

    progressObserverToken = currentPlayer.addPeriodicTimeObserver(
      forInterval: CMTime(seconds: 0.5, preferredTimescale: 600),
      queue: .main
    ) { [weak self] _ in
      self?.emitProgress()
      self?.updateNowPlayingElapsed()
      self?.emitEndedFallbackIfNeeded()
      self?.confirmPlayingIfNeeded()
    }
  }

  private func emitEndedFallbackIfNeeded() {
    guard !currentItemEndedHandled, currentItem != nil else {
      return
    }

    if playerStatus == "ended" {
      return
    }

    let progress = progressPayload()
    let positionSeconds = progress["positionSeconds"] ?? 0
    let durationSeconds = progress["durationSeconds"] ?? 0
    guard durationSeconds.isFinite,
          positionSeconds.isFinite,
          durationSeconds > 0,
          positionSeconds >= max(0, durationSeconds - 0.5) else {
      return
    }

    handleCurrentItemEnded(source: "position_fallback")
  }

  private func stopProgressObserver() {
    if let token = progressObserverToken {
      player?.removeTimeObserver(token)
      progressObserverToken = nil
    }
  }

  private func cleanupPlayerObservers() {
    if player != nil || currentItem != nil {
      emitDiagnostic("hidden_audio_player_deinit", [
        "trackId": activeTrack?["id"] as? String ?? "",
        "activeIndex": activeIndex
      ])
    }
    stopProgressObserver()
    itemStatusObserver = nil
    timeControlObserver = nil
    rateObserver = nil
    loadedTimeRangesObserver = nil
    bufferEmptyObserver = nil
    likelyToKeepUpObserver = nil
    if let observer = itemEndObserver {
      NotificationCenter.default.removeObserver(observer)
      itemEndObserver = nil
    }
    NotificationCenter.default.removeObserver(
      self,
      name: .AVPlayerItemPlaybackStalled,
      object: currentItem
    )
    NotificationCenter.default.removeObserver(
      self,
      name: .AVPlayerItemFailedToPlayToEndTime,
      object: currentItem
    )
    currentItem = nil
  }

  private func updateNowPlayingElapsed() {
    var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
    let progress = progressPayload()
    info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = progress["positionSeconds"]
    info[MPMediaItemPropertyPlaybackDuration] = progress["durationSeconds"]
    info[MPNowPlayingInfoPropertyPlaybackRate] = playerStatus == "playing" ? 1 : 0
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info

    let now = Date().timeIntervalSince1970
    if now - lastNowPlayingElapsedDiagnosticAt >= 15 {
      lastNowPlayingElapsedDiagnosticAt = now
      emitDiagnostic("hidden_audio_now_playing_elapsed_updated", [
        "positionSeconds": progress["positionSeconds"] ?? 0,
        "durationSeconds": progress["durationSeconds"] ?? 0,
        "isPlaying": playerStatus == "playing"
      ])
    }
  }

  private func runNonCriticalSetup(_ name: String, _ work: () throws -> Void) {
    do {
      try work()
    } catch {
      emitDiagnostic("hidden_audio_noncritical_setup_failed", [
        "name": name,
        "message": error.localizedDescription
      ])
    }
  }

  private func statePayload() -> [String: Any] {
    return [
      "status": player == nil ? "idle" : playerStatus,
      "activeTrack": activeTrack as Any,
      "queue": [
        "tracks": queue,
        "activeIndex": activeIndex
      ],
      "error": playerStatus == "error" ? "Hidden Audio native playback failed" : NSNull()
    ]
  }

  private func progressPayload() -> [String: Double] {
    let position = player?.currentTime().seconds ?? 0
    let duration = player?.currentItem?.duration.seconds ?? 0
    let safeDuration: Double
    if duration.isFinite && duration > 0 {
      safeDuration = duration
    } else {
      safeDuration = (activeTrack?["durationSeconds"] as? NSNumber)?.doubleValue ?? 0
    }
    let bufferedEnd = player?.currentItem?.loadedTimeRanges
      .compactMap { $0.timeRangeValue }
      .map { CMTimeGetSeconds(CMTimeAdd($0.start, $0.duration)) }
      .filter { $0.isFinite }
      .max() ?? 0
    let rate = player?.rate ?? 0
    let timeControl = player?.timeControlStatus ?? .paused
    let isAdvancing =
      rate > 0 ||
      timeControl == .playing ||
      playerStatus == "playing" ||
      playerStatus == "buffering"
    return [
      "positionSeconds": max(0, position.isFinite ? position : 0),
      "durationSeconds": max(0, safeDuration),
      "bufferedSeconds": max(0, bufferedEnd),
      "currentTime": max(0, position.isFinite ? position : 0),
      "duration": max(0, safeDuration),
      "bufferedPosition": max(0, bufferedEnd),
      "isPlaying": isAdvancing ? 1.0 : 0.0
    ]
  }

  private func emitState() {
    sendEvent(withName: "HiddenAudioState", body: [
      "type": "state",
      "state": statePayload()
    ])
  }

  private func emitProgress() {
    let progress = progressPayload()
    sendEvent(withName: "HiddenAudioProgress", body: [
      "type": "progress",
      "progress": progress
    ])
    sendEvent(withName: "HiddenAudioProgressChanged", body: [
      "type": "progress",
      "progress": progress
    ])

    let now = Date().timeIntervalSince1970
    let positionSeconds = progress["positionSeconds"] ?? 0
    let diagnosticInterval = positionSeconds >= 15 && positionSeconds <= 25 ? 1.0 : 5.0
    if now - lastProgressDiagnosticAt >= diagnosticInterval {
      lastProgressDiagnosticAt = now
      emitDiagnostic("hidden_audio_native_progress", [
        "positionSeconds": positionSeconds,
        "durationSeconds": progress["durationSeconds"] ?? 0,
        "bufferedSeconds": progress["bufferedSeconds"] ?? 0,
        "activeIndex": activeIndex,
        "isPlaying": playerStatus == "playing"
      ])
      emitDiagnostic("native_playback_position", [
        "positionSeconds": positionSeconds,
        "activeIndex": activeIndex
      ])
      emitDiagnostic("native_playback_duration", [
        "durationSeconds": progress["durationSeconds"] ?? 0,
        "activeIndex": activeIndex
      ])
      emitDiagnostic("native_playback_buffer_status", [
        "bufferedSeconds": progress["bufferedSeconds"] ?? 0,
        "activeIndex": activeIndex
      ])
    }
  }

  private func emitTrackChanged() {
    emitDiagnostic("hidden_audio_native_track_changed", [
      "trackId": activeTrack?["id"] as? String ?? "",
      "activeIndex": activeIndex
    ])
    sendEvent(withName: "HiddenAudioTrackChanged", body: [
      "type": "track_changed",
      "track": activeTrack as Any,
      "index": activeIndex
    ])
  }

  private func emitPlaybackEnded() {
    let progress = progressPayload()
    sendEvent(withName: "HiddenAudioPlaybackEnded", body: [
      "type": "playback_ended",
      "track": activeTrack as Any,
      "index": activeIndex,
      "positionSeconds": progress["positionSeconds"] ?? 0,
      "durationSeconds": progress["durationSeconds"] ?? 0,
      "status": playerStatus
    ])
  }

  private func emitDiagnostic(_ eventName: String, _ data: [String: Any] = [:]) {
    print("[HiddenAudio] \(eventName) \(data)")
    sendEvent(withName: "HiddenAudioDiagnostic", body: [
      "type": "diagnostic",
      "eventName": eventName,
      "data": data
    ])
  }

  private func emitRemoteCommandResult(
    _ command: String,
    success: Bool,
    reason: String = ""
  ) {
    emitDiagnostic("hidden_audio_remote_command_result", [
      "command": command,
      "success": success,
      "reason": reason
    ])
    emitDiagnostic(success ? "remote_command_handled_success" : "remote_command_handled_error", [
      "command": command,
      "success": success,
      "reason": reason
    ])
  }


  private func reassertBackgroundPlaybackIfNeeded(reason: String) {
    guard let currentPlayer = player else { return }
    if hasRecentIntentionalPause() {
      emitDiagnostic("background_recovery_skipped_intentional_pause", [
        "reason": reason,
        "pauseReason": intentionalPauseReason,
        "cooldownRemainingSeconds": intentionalPauseCooldownRemaining()
      ])
      return
    }
    guard shouldResumeAfterItemLoad || playerStatus == "playing" || playerStatus == "buffering" else {
      return
    }

    let now = Date().timeIntervalSince1970
    if now - lastBackgroundRecoveryAt < 2.0 {
      return
    }
    lastBackgroundRecoveryAt = now

    if currentPlayer.rate > 0 || currentPlayer.timeControlStatus == .playing {
      startProgressObserver()
      updateNowPlayingInfo()
      emitDiagnostic("hidden_audio_background_playback_alive", [
        "reason": reason,
        "rate": currentPlayer.rate
      ])
      return
    }

    emitDiagnostic("background_recovery_allowed_no_intentional_pause", [
      "reason": reason,
      "status": playerStatus
    ])
    emitDiagnostic("hidden_audio_background_playback_recover_attempt", [
      "reason": reason,
      "status": playerStatus
    ])
    currentPlayer.play()
    startProgressObserver()
    confirmPlayingIfNeeded()
  }

  private func markIntentionalPause(reason: String) {
    lastIntentionalPauseAt = Date().timeIntervalSince1970
    intentionalPauseReason = reason
    shouldResumeAfterItemLoad = false
    emitDiagnostic("intentional_pause_marked", [
      "reason": reason,
      "cooldownSeconds": intentionalPauseCooldownSeconds
    ])
  }

  private func hasRecentIntentionalPause() -> Bool {
    guard lastIntentionalPauseAt > 0 else { return false }
    return Date().timeIntervalSince1970 - lastIntentionalPauseAt <= intentionalPauseCooldownSeconds
  }

  private func intentionalPauseCooldownRemaining() -> Double {
    guard lastIntentionalPauseAt > 0 else { return 0 }
    return max(0, intentionalPauseCooldownSeconds - (Date().timeIntervalSince1970 - lastIntentionalPauseAt))
  }

  private func clearIntentionalPause(reason: String) {
    guard lastIntentionalPauseAt > 0 else { return }
    let eventName = reason == "new_track"
      ? "intentional_pause_cleared_by_new_track"
      : "intentional_pause_cleared_by_play"
    emitDiagnostic(eventName, [
      "reason": reason,
      "previousReason": intentionalPauseReason
    ])
    lastIntentionalPauseAt = 0
    intentionalPauseReason = ""
  }

  private func scheduleBackgroundPlaybackAliveChecks() {
    let checkpoints: [TimeInterval] = [20, 60, 300]
    for seconds in checkpoints {
      DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
        guard let self = self else { return }
        guard self.backgroundEnteredAt > 0 else { return }
        let rate = self.player?.rate ?? 0
        let alive = rate > 0 || self.playerStatus == "playing" || self.playerStatus == "buffering"
        let eventName =
          seconds == 20
            ? "background_20s_watch_alive"
            : seconds == 60
              ? "ios_background_playback_alive_60s"
              : "ios_background_playback_alive_300s"
        self.emitDiagnostic(eventName, [
          "alive": alive,
          "rate": rate,
          "status": self.playerStatus,
          "activeIndex": self.activeIndex
        ])
        if !alive && self.shouldResumeAfterItemLoad {
          self.emitDiagnostic("ios_background_playback_stopped_detected", [
            "checkpointSeconds": seconds,
            "status": self.playerStatus,
            "rate": rate
          ])
          self.reassertBackgroundPlaybackIfNeeded(reason: eventName)
        }
      }
    }
  }

  private func emitNativeError(_ message: String) {
    print("[HiddenAudio] hidden_audio_native_error \(message)")
    sendEvent(withName: "HiddenAudioDiagnostic", body: [
      "type": "diagnostic",
      "eventName": "hidden_audio_native_error",
      "data": ["message": message]
    ])
    sendEvent(withName: "HiddenAudioState", body: [
      "type": "error",
      "message": message
    ])
  }

  @objc private func appEnteredForeground(_ notification: Notification) {
    isAppInBackground = false
    emitDiagnostic("hidden_audio_app_entered_foreground", [
      "status": playerStatus,
      "activeIndex": activeIndex,
      "rate": player?.rate ?? 0
    ])
  }

  @objc private func appEnteredBackground(_ notification: Notification) {
    isAppInBackground = true
    backgroundEnteredAt = Date().timeIntervalSince1970
    emitDiagnostic("hidden_audio_app_entered_background", [
      "status": playerStatus,
      "activeIndex": activeIndex
    ])
    emitDiagnostic("ios_app_inactive_native_status", [
      "status": playerStatus,
      "activeIndex": activeIndex,
      "rate": player?.rate ?? 0,
      "timeControlStatus": player?.timeControlStatus.rawValue ?? -1
    ])
    emitDiagnostic("ios_background_playback_status", [
      "status": playerStatus,
      "activeIndex": activeIndex,
      "rate": player?.rate ?? 0
    ])
    emitDiagnostic("hidden_audio_background_player_rate", [
      "rate": player?.rate ?? 0,
      "timeControlStatus": player?.timeControlStatus.rawValue ?? -1
    ])

    do {
      try activateAudioSession()
      emitDiagnostic("ios_background_audio_session_reasserted", [
        "status": playerStatus,
        "rate": player?.rate ?? 0
      ])
    } catch {
      emitDiagnostic("hidden_audio_audio_session_config_failed", [
        "message": error.localizedDescription,
        "phase": "background_enter"
      ])
    }

    emitDiagnostic("hidden_audio_remote_commands_background_confirmed", [
      "registered": remoteCommandsRegistered
    ])
    reassertBackgroundPlaybackIfNeeded(reason: "app_entered_background")
    scheduleBackgroundPlaybackAliveChecks()
  }

  @objc private func audioInterruption(_ notification: Notification) {
    guard let typeValue = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
      return
    }

    if type == .began {
      wasPlayingBeforeInterruption =
        playerStatus == "playing" ||
        playerStatus == "buffering" ||
        (player?.rate ?? 0) > 0
      emitDiagnostic("hidden_audio_audio_interruption_began", [
        "rate": player?.rate ?? 0,
        "wasPlaying": wasPlayingBeforeInterruption
      ])
      emitDiagnostic("ios_audio_session_interruption_began", [
        "rate": player?.rate ?? 0,
        "wasPlaying": wasPlayingBeforeInterruption
      ])
      return
    }

    let optionsValue = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
    let shouldResumeOption = AVAudioSession.InterruptionOptions(rawValue: optionsValue).contains(.shouldResume)
    emitDiagnostic("hidden_audio_audio_interruption_ended", [
      "shouldResumeOption": shouldResumeOption,
      "wasPlaying": wasPlayingBeforeInterruption
    ])
    emitDiagnostic("ios_audio_session_interruption_ended", [
      "shouldResumeOption": shouldResumeOption,
      "wasPlaying": wasPlayingBeforeInterruption
    ])
    emitDiagnostic("ios_audio_session_should_resume", [
      "shouldResumeOption": shouldResumeOption
    ])

    do {
      try activateAudioSession()
      if shouldResumeOption && wasPlayingBeforeInterruption && !hasRecentIntentionalPause() {
        player?.play()
        shouldResumeAfterItemLoad = true
        startProgressObserver()
        confirmPlayingIfNeeded()
      }
    } catch {
      emitNativeError(error.localizedDescription)
    }
  }

  @objc private func audioRouteChanged(_ notification: Notification) {
    let reason = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt ?? 0
    emitDiagnostic("hidden_audio_route_changed", [
      "reason": reason,
      "rate": player?.rate ?? 0
    ])
    emitDiagnostic("ios_audio_session_route_changed", [
      "reason": reason,
      "rate": player?.rate ?? 0
    ])
  }

  @objc private func silenceSecondaryAudioHint(_ notification: Notification) {
    let hint = notification.userInfo?[AVAudioSessionSilenceSecondaryAudioHintTypeKey] as? UInt ?? 0
    emitDiagnostic("ios_audio_session_silence_secondary_audio_hint", [
      "hint": hint,
      "rate": player?.rate ?? 0
    ])
  }

  @objc private func playerItemStalled(_ notification: Notification) {
    guard let item = notification.object as? AVPlayerItem,
          item === currentItem else {
      emitDiagnostic("hidden_audio_stale_item_event_ignored", [
        "event": "stalled",
        "activeIndex": activeIndex
      ])
      return
    }
    emitDiagnostic("hidden_audio_player_stalled", [
      "trackId": activeTrack?["id"] as? String ?? "",
      "activeIndex": activeIndex,
      "bufferedSeconds": bufferedEndSeconds(for: item),
      "accessLog": accessLogSummary(item),
      "errorLog": errorLogSummary(item)
    ])
  }

  @objc private func playerItemFailedToEnd(_ notification: Notification) {
    guard let item = notification.object as? AVPlayerItem,
          item === currentItem else {
      emitDiagnostic("hidden_audio_stale_item_event_ignored", [
        "event": "failed_to_end",
        "activeIndex": activeIndex
      ])
      return
    }

    let error = notification.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? Error
    emitDiagnostic("hidden_audio_player_failed_to_end", [
      "message": error?.localizedDescription ?? "Unknown end failure",
      "trackId": activeTrack?["id"] as? String ?? "",
      "activeIndex": activeIndex,
      "accessLog": accessLogSummary(item),
      "errorLog": errorLogSummary(item)
    ])
  }

  private func bufferedEndSeconds(for item: AVPlayerItem) -> Double {
    item.loadedTimeRanges
      .compactMap { $0.timeRangeValue }
      .map { CMTimeGetSeconds(CMTimeAdd($0.start, $0.duration)) }
      .filter { $0.isFinite }
      .max() ?? 0
  }

  private func safeDurationSeconds(for item: AVPlayerItem) -> Double {
    let duration = item.duration.seconds
    return duration.isFinite && duration > 0 ? duration : 0
  }

  private func currentUrlHost() -> String {
    guard let urlString = activeTrack?["url"] as? String,
          let url = URL(string: urlString) else {
      return ""
    }
    return url.host ?? ""
  }

  private func currentUrlScheme() -> String {
    guard let urlString = activeTrack?["url"] as? String,
          let url = URL(string: urlString) else {
      return ""
    }
    return url.scheme ?? ""
  }

  private func accessLogSummary(_ item: AVPlayerItem) -> String {
    guard let event = item.accessLog()?.events.last else { return "" }
    return [
      "observedBitrate=\(event.observedBitrate)",
      "indicatedBitrate=\(event.indicatedBitrate)",
      "stallCount=\(event.numberOfStalls)",
      "transferDuration=\(event.transferDuration)",
      "uriHost=\(URL(string: event.uri ?? "")?.host ?? "")"
    ].joined(separator: " ")
  }

  private func errorLogSummary(_ item: AVPlayerItem) -> String {
    guard let event = item.errorLog()?.events.last else { return "" }
    return [
      "statusCode=\(event.errorStatusCode)",
      "domain=\(event.errorDomain)",
      "comment=\(event.errorComment ?? "")",
      "uriHost=\(URL(string: event.uri ?? "")?.host ?? "")"
    ].joined(separator: " ")
  }
}

extension HiddenAudioModule: HiddenAudioCarPlayPlaybackHandling {
  func playCarPlayTrack(_ track: [String: Any], completion: @escaping (Error?) -> Void) {
    queue = [track]
    activeIndex = 0
    clearIntentionalPause(reason: "carplay_play")
    do {
      try loadActiveTrack(autoplay: true)
      updateNowPlayingInfo()
      updateRemoteCommandAvailability()
      emitState()
      completion(nil)
    } catch {
      emitNativeError(error.localizedDescription)
      completion(error)
    }
  }

  func emitCarPlayMediaSelection(_ mediaId: String) {
    emitDiagnostic("ios_carplay_play_from_media_id", [
      "mediaId": mediaId,
      "source": "carplay",
    ])
    emitDiagnostic("ios_remote_command_received", [
      "command": "play_from_media_id",
      "mediaId": mediaId,
      "source": "carplay",
    ])
  }
}

private extension NSDictionary {
  func compactMapKeys() -> [String: Any] {
    var result: [String: Any] = [:]
    for key in allKeys {
      if let stringKey = key as? String,
         let value = self[key],
         !(value is NSNull) {
        result[stringKey] = value
      }
    }
    return result
  }
}

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
  private var progressTimer: Timer?
  private var itemStatusObserver: NSKeyValueObservation?
  private var timeControlObserver: NSKeyValueObservation?
  private var playerStatus = "idle"
  private var shouldResumeAfterItemLoad = false
  private var lastProgressDiagnosticAt = 0.0
  private var nowPlayingArtworkUrl: String?
  private var nowPlayingArtwork: MPMediaItemArtwork?

  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  override func supportedEvents() -> [String]! {
    return [
      "HiddenAudioState",
      "HiddenAudioProgress",
      "HiddenAudioTrackChanged",
      "HiddenAudioDiagnostic"
    ]
  }

  @objc(setup:rejecter:)
  func setup(resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    do {
      try activateAudioSession()
      configureRemoteCommands()
      resolve(nil)
    } catch {
      emitNativeError(error.localizedDescription)
      reject("HIDDEN_AUDIO_SETUP_FAILED", error.localizedDescription, error)
    }
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

    shouldResumeAfterItemLoad = true
    playerStatus = "buffering"
    emitDiagnostic("hidden_audio_native_play_requested", [
      "trackId": activeTrack?["id"] as? String ?? "",
      "activeIndex": activeIndex
    ])
    currentPlayer.play()
    startProgressTimer()
    emitState()

    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
      self?.confirmPlayingIfNeeded()
    }

    resolve(nil)
  }

  @objc(pause:rejecter:)
  func pause(resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    shouldResumeAfterItemLoad = false
    player?.pause()
    playerStatus = player == nil ? "idle" : "paused"
    progressTimer?.invalidate()
    progressTimer = nil
    emitState()
    resolve(nil)
  }

  @objc(resume:rejecter:)
  func resume(resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    play(resolve: resolve, rejecter: reject)
  }

  @objc(stop:rejecter:)
  func stop(resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    shouldResumeAfterItemLoad = false
    player?.pause()
    player?.seek(to: .zero)
    playerStatus = player == nil ? "idle" : "stopped"
    progressTimer?.invalidate()
    progressTimer = nil
    emitState()
    resolve(nil)
  }

  @objc(seekTo:resolver:rejecter:)
  func seekTo(
    seconds: NSNumber,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    let time = CMTime(seconds: max(0, seconds.doubleValue), preferredTimescale: 600)
    player?.seek(to: time)
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
      "activeIndex": activeIndex
    ])
    emitDiagnostic("hidden_audio_native_url_valid", [
      "scheme": url.scheme ?? "",
      "trackId": track["id"] as? String ?? "hidden-audio-track"
    ])

    try activateAudioSession()

    activeTrack = normalizeTrack(track, urlString: urlString)
    itemStatusObserver = nil
    timeControlObserver = nil
    NotificationCenter.default.removeObserver(self)
    progressTimer?.invalidate()
    progressTimer = nil

    let item = AVPlayerItem(url: url)
    player = AVPlayer(playerItem: item)
    playerStatus = autoplay ? "buffering" : "ready"
    shouldResumeAfterItemLoad = autoplay
    observePlayerItem(item)
    observePlayer()
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(playerItemDidEnd(_:)),
      name: .AVPlayerItemDidPlayToEndTime,
      object: item
    )
    updateNowPlayingInfo()
    loadNowPlayingArtworkIfNeeded()
    emitDiagnostic("hidden_audio_native_player_created", [
      "trackId": activeTrack?["id"] as? String ?? "",
      "activeIndex": activeIndex
    ])
    emitTrackChanged()
    emitState()

    if autoplay {
      player?.play()
      startProgressTimer()
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
    emitDiagnostic("hidden_audio_native_track_ended", [
      "trackId": activeTrack?["id"] as? String ?? "",
      "activeIndex": activeIndex
    ])

    if activeIndex + 1 < queue.count {
      moveToIndex(activeIndex + 1, autoplay: true)
      return
    }

    shouldResumeAfterItemLoad = false
    playerStatus = "ended"
    progressTimer?.invalidate()
    progressTimer = nil
    emitState()
  }

  private func moveToIndex(_ nextIndex: Int, autoplay: Bool) {
    guard nextIndex >= 0 && nextIndex < queue.count else {
      shouldResumeAfterItemLoad = false
      playerStatus = "ended"
      progressTimer?.invalidate()
      progressTimer = nil
      emitState()
      return
    }

    activeIndex = nextIndex
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
    try session.setCategory(.playback, mode: .default, options: [])
    try session.setActive(true)
    emitDiagnostic("hidden_audio_native_audio_session_active", [
      "category": session.category.rawValue
    ])
  }

  private func observePlayerItem(_ item: AVPlayerItem) {
    itemStatusObserver = item.observe(\.status, options: [.new]) { [weak self] item, _ in
      guard let self = self else { return }
      if item.status == .failed {
        self.playerStatus = "error"
        self.emitNativeError(item.error?.localizedDescription ?? "AVPlayerItem failed")
        self.emitState()
      }
    }
  }

  private func observePlayer() {
    guard let currentPlayer = player else { return }
    timeControlObserver = currentPlayer.observe(\.timeControlStatus, options: [.new]) { [weak self] _, _ in
      self?.confirmPlayingIfNeeded()
    }
  }

  private func confirmPlayingIfNeeded() {
    guard let currentPlayer = player else { return }
    if currentPlayer.rate > 0 || currentPlayer.timeControlStatus == .playing {
      if playerStatus != "playing" {
        playerStatus = "playing"
        emitDiagnostic("hidden_audio_native_playing_confirmed", [
          "trackId": activeTrack?["id"] as? String ?? "",
          "activeIndex": activeIndex
        ])
      }
      emitState()
    }
  }

  private func configureRemoteCommands() {
    let commandCenter = MPRemoteCommandCenter.shared()
    commandCenter.playCommand.isEnabled = true
    commandCenter.pauseCommand.isEnabled = true
    commandCenter.nextTrackCommand.isEnabled = true
    commandCenter.previousTrackCommand.isEnabled = true
    commandCenter.changePlaybackPositionCommand.isEnabled = true

    commandCenter.playCommand.addTarget { [weak self] _ in
      guard let self = self else { return .commandFailed }
      self.player?.play()
      self.shouldResumeAfterItemLoad = true
      self.startProgressTimer()
      self.confirmPlayingIfNeeded()
      return .success
    }

    commandCenter.pauseCommand.addTarget { [weak self] _ in
      self?.player?.pause()
      self?.shouldResumeAfterItemLoad = false
      self?.playerStatus = "paused"
      self?.progressTimer?.invalidate()
      self?.progressTimer = nil
      self?.emitState()
      return .success
    }

    commandCenter.nextTrackCommand.addTarget { [weak self] _ in
      self?.moveToIndex((self?.activeIndex ?? -1) + 1, autoplay: true)
      return .success
    }

    commandCenter.previousTrackCommand.addTarget { [weak self] _ in
      self?.moveToIndex(max(0, (self?.activeIndex ?? 0) - 1), autoplay: true)
      return .success
    }

    commandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
      guard let positionEvent = event as? MPChangePlaybackPositionCommandEvent else {
        return .commandFailed
      }
      self?.player?.seek(
        to: CMTime(seconds: positionEvent.positionTime, preferredTimescale: 600)
      )
      self?.emitProgress()
      self?.updateNowPlayingInfo()
      return .success
    }
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

  private func startProgressTimer() {
    progressTimer?.invalidate()
    progressTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
      self?.emitProgress()
      self?.updateNowPlayingInfo()
      self?.confirmPlayingIfNeeded()
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
    return [
      "positionSeconds": max(0, position.isFinite ? position : 0),
      "durationSeconds": max(0, safeDuration),
      "bufferedSeconds": 0
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

    let now = Date().timeIntervalSince1970
    if now - lastProgressDiagnosticAt >= 15 {
      lastProgressDiagnosticAt = now
      emitDiagnostic("hidden_audio_native_progress", [
        "positionSeconds": progress["positionSeconds"] ?? 0,
        "durationSeconds": progress["durationSeconds"] ?? 0,
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

  private func emitDiagnostic(_ eventName: String, _ data: [String: Any] = [:]) {
    print("[HiddenAudio] \(eventName) \(data)")
    sendEvent(withName: "HiddenAudioDiagnostic", body: [
      "type": "diagnostic",
      "eventName": eventName,
      "data": data
    ])
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

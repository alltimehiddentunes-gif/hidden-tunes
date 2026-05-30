import AVFoundation
import MediaPlayer
import React

@objc(HiddenAudioModule)
class HiddenAudioModule: RCTEventEmitter {
  private var player: AVPlayer?
  private var activeTrack: [String: Any]?
  private var progressTimer: Timer?
  private var itemStatusObserver: NSKeyValueObservation?
  private var timeControlObserver: NSKeyValueObservation?
  private var playerStatus = "idle"

  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  override func supportedEvents() -> [String]! {
    return ["HiddenAudioState", "HiddenAudioProgress", "HiddenAudioDiagnostic"]
  }

  @objc(setup:rejecter:)
  func setup(resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    do {
      try activateAudioSession()
      configureRemoteCommands()
      resolve(nil)
    } catch {
      emitError("hidden_audio_native_error", message: error.localizedDescription)
      reject("HIDDEN_AUDIO_SETUP_FAILED", error.localizedDescription, error)
    }
  }

  @objc(loadTrack:resolver:rejecter:)
  func loadTrack(
    track: NSDictionary,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard let urlString = track["url"] as? String,
          let url = URL(string: urlString),
          ["http", "https", "file"].contains(url.scheme?.lowercased() ?? "") else {
      emitError("hidden_audio_native_error", message: "Track url is invalid")
      reject("HIDDEN_AUDIO_INVALID_TRACK", "Track url is invalid", nil)
      return
    }

    emitDiagnostic("hidden_audio_native_url_valid", [
      "scheme": url.scheme ?? "",
      "trackId": track["id"] as? String ?? "hidden-audio-track"
    ])

    do {
      try activateAudioSession()
    } catch {
      emitError("hidden_audio_native_error", message: error.localizedDescription)
      reject("HIDDEN_AUDIO_AUDIO_SESSION_FAILED", error.localizedDescription, error)
      return
    }

    activeTrack = [
      "id": track["id"] as? String ?? "hidden-audio-track",
      "url": urlString,
      "title": track["title"] as? String ?? "Hidden Tunes",
      "artist": track["artist"] as? String ?? "Hidden Tunes",
      "artworkUrl": track["artworkUrl"] as? String ?? ""
    ]

    itemStatusObserver = nil
    timeControlObserver = nil
    progressTimer?.invalidate()
    progressTimer = nil

    let item = AVPlayerItem(url: url)
    player = AVPlayer(playerItem: item)
    playerStatus = "ready"
    observePlayerItem(item)
    observePlayer()
    updateNowPlayingInfo()
    emitDiagnostic("hidden_audio_native_player_created", [
      "trackId": activeTrack?["id"] as? String ?? ""
    ])
    emitState()
    resolve(nil)
  }

  @objc(loadQueue:startIndex:resolver:rejecter:)
  func loadQueue(
    tracks: NSArray,
    startIndex: NSNumber,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    let index = max(0, startIndex.intValue)
    guard tracks.count > 0,
          let track = tracks[min(index, tracks.count - 1)] as? NSDictionary else {
      emitError("hidden_audio_native_error", message: "Queue is empty")
      reject("HIDDEN_AUDIO_EMPTY_QUEUE", "Queue is empty", nil)
      return
    }

    loadTrack(track: track, resolver: resolve, rejecter: reject)
  }

  @objc(play:rejecter:)
  func play(resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    guard let currentPlayer = player else {
      emitError("hidden_audio_native_error", message: "No player is loaded")
      reject("HIDDEN_AUDIO_NO_PLAYER", "No player is loaded", nil)
      return
    }

    do {
      try activateAudioSession()
    } catch {
      emitError("hidden_audio_native_error", message: error.localizedDescription)
      reject("HIDDEN_AUDIO_AUDIO_SESSION_FAILED", error.localizedDescription, error)
      return
    }

    playerStatus = "buffering"
    emitDiagnostic("hidden_audio_native_play_called", [
      "trackId": activeTrack?["id"] as? String ?? ""
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
    player?.pause()
    playerStatus = player == nil ? "idle" : "paused"
    emitState()
    resolve(nil)
  }

  @objc(resume:rejecter:)
  func resume(resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    play(resolve: resolve, rejecter: reject)
  }

  @objc(stop:rejecter:)
  func stop(resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
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
    resolve(nil)
  }

  @objc(next:rejecter:)
  func next(resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve(nil)
  }

  @objc(previous:rejecter:)
  func previous(resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
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
        self.emitError(
          "hidden_audio_native_error",
          message: item.error?.localizedDescription ?? "AVPlayerItem failed"
        )
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
          "trackId": activeTrack?["id"] as? String ?? ""
        ])
      }
      emitState()
    }
  }

  private func configureRemoteCommands() {
    let commandCenter = MPRemoteCommandCenter.shared()
    commandCenter.playCommand.isEnabled = true
    commandCenter.pauseCommand.isEnabled = true

    commandCenter.playCommand.addTarget { [weak self] _ in
      self?.player?.play()
      self?.startProgressTimer()
      self?.confirmPlayingIfNeeded()
      return .success
    }

    commandCenter.pauseCommand.addTarget { [weak self] _ in
      self?.player?.pause()
      self?.playerStatus = "paused"
      self?.emitState()
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
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
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
        "tracks": activeTrack == nil ? [] : [activeTrack as Any],
        "activeIndex": activeTrack == nil ? -1 : 0
      ],
      "error": playerStatus == "error" ? "Hidden Audio native playback failed" : NSNull()
    ]
  }

  private func progressPayload() -> [String: Double] {
    let position = player?.currentTime().seconds ?? 0
    let duration = player?.currentItem?.duration.seconds ?? 0
    let safeDuration = duration.isFinite ? duration : 0
    return [
      "positionSeconds": max(0, position),
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
    sendEvent(withName: "HiddenAudioProgress", body: [
      "type": "progress",
      "progress": progressPayload()
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

  private func emitError(_ eventName: String, message: String) {
    print("[HiddenAudio] \(eventName) \(message)")
    sendEvent(withName: "HiddenAudioDiagnostic", body: [
      "type": "diagnostic",
      "eventName": eventName,
      "data": ["message": message]
    ])
    sendEvent(withName: "HiddenAudioState", body: [
      "type": "error",
      "message": message
    ])
  }
}

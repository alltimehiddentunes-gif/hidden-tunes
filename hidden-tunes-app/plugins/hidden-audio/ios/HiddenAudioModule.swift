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
  private var playerStatus = "idle"
  private var shouldResumeAfterItemLoad = false
  private var lastProgressDiagnosticAt = 0.0
  private var lastNowPlayingElapsedDiagnosticAt = 0.0
  private var nowPlayingArtworkUrl: String?
  private var nowPlayingArtwork: MPMediaItemArtwork?
  private var remoteCommandsRegistered = false
  private var lifecycleObserversRegistered = false

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
      "HiddenAudioDiagnostic"
    ]
  }

  @objc(setup:rejecter:)
  func setup(resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    do {
      try activateAudioSession()
      configureRemoteCommands()
      configureLifecycleObservers()
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
      configureRemoteCommands()
      configureLifecycleObservers()
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
    startProgressObserver()
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
    stopProgressObserver()
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
    shouldResumeAfterItemLoad = false
    player?.pause()
    player?.seek(to: .zero)
    playerStatus = player == nil ? "idle" : "stopped"
    stopProgressObserver()
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
    configureRemoteCommands()
    configureLifecycleObservers()

    activeTrack = normalizeTrack(track, urlString: urlString)
    cleanupPlayerObservers()

    let item = AVPlayerItem(url: url)
    currentItem = item
    player = AVPlayer(playerItem: item)
    playerStatus = autoplay ? "buffering" : "ready"
    shouldResumeAfterItemLoad = autoplay
    observePlayerItem(item)
    observePlayer()
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
    stopProgressObserver()
    updateNowPlayingInfo()
    emitState()
  }

  private func moveToIndex(_ nextIndex: Int, autoplay: Bool) {
    guard nextIndex >= 0 && nextIndex < queue.count else {
      shouldResumeAfterItemLoad = false
      playerStatus = "ended"
      stopProgressObserver()
      updateNowPlayingInfo()
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
        self.emitDiagnostic("hidden_audio_player_failed", [
          "message": item.error?.localizedDescription ?? "AVPlayerItem failed"
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
      startProgressObserver()
      updateNowPlayingInfo()
      emitState()
    }
  }

  private func configureRemoteCommands() {
    if remoteCommandsRegistered { return }
    remoteCommandsRegistered = true

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
      self.startProgressObserver()
      self.confirmPlayingIfNeeded()
      return .success
    }

    commandCenter.pauseCommand.addTarget { [weak self] _ in
      self?.player?.pause()
      self?.shouldResumeAfterItemLoad = false
      self?.playerStatus = "paused"
      self?.stopProgressObserver()
      self?.updateNowPlayingInfo()
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

    emitDiagnostic("hidden_audio_remote_commands_registered")
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
      self?.confirmPlayingIfNeeded()
    }
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
    if let observer = itemEndObserver {
      NotificationCenter.default.removeObserver(observer)
      itemEndObserver = nil
    }
    NotificationCenter.default.removeObserver(
      self,
      name: .AVPlayerItemPlaybackStalled,
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
    return [
      "positionSeconds": max(0, position.isFinite ? position : 0),
      "durationSeconds": max(0, safeDuration),
      "bufferedSeconds": max(0, bufferedEnd),
      "currentTime": max(0, position.isFinite ? position : 0),
      "duration": max(0, safeDuration),
      "bufferedPosition": max(0, bufferedEnd),
      "isPlaying": playerStatus == "playing" ? 1.0 : 0.0
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
    if now - lastProgressDiagnosticAt >= 15 {
      lastProgressDiagnosticAt = now
      emitDiagnostic("hidden_audio_native_progress", [
        "positionSeconds": progress["positionSeconds"] ?? 0,
        "durationSeconds": progress["durationSeconds"] ?? 0,
        "bufferedSeconds": progress["bufferedSeconds"] ?? 0,
        "activeIndex": activeIndex,
        "isPlaying": playerStatus == "playing"
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

  @objc private func appEnteredBackground(_ notification: Notification) {
    emitDiagnostic("hidden_audio_app_entered_background", [
      "status": playerStatus,
      "activeIndex": activeIndex
    ])
    emitDiagnostic("hidden_audio_background_player_rate", [
      "rate": player?.rate ?? 0,
      "timeControlStatus": player?.timeControlStatus.rawValue ?? -1
    ])
  }

  @objc private func audioInterruption(_ notification: Notification) {
    guard let typeValue = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
      return
    }

    if type == .began {
      emitDiagnostic("hidden_audio_audio_interruption_began", [
        "rate": player?.rate ?? 0
      ])
      return
    }

    emitDiagnostic("hidden_audio_audio_interruption_ended", [
      "shouldResume": shouldResumeAfterItemLoad
    ])

    do {
      try activateAudioSession()
      if shouldResumeAfterItemLoad {
        player?.play()
        startProgressObserver()
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
  }

  @objc private func playerItemStalled(_ notification: Notification) {
    emitDiagnostic("hidden_audio_player_stalled", [
      "trackId": activeTrack?["id"] as? String ?? "",
      "activeIndex": activeIndex
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

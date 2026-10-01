import Foundation
import QuartzCore
import UIKit

// Internal development-build recorder. It never emits events or touches React state.
// One background timer checks whether an already-dispatched main-queue ping is late.
final class HiddenAudioPerfRecorder {
  private let lock = NSLock()
  private let monitorQueue = DispatchQueue(label: "com.hiddentunes.perf.monitor", qos: .utility)
  private let incidentKey = "HT217PerfLastIncident"
  private let thresholds = [50, 100, 250, 500, 1000, 2000]
  private var timer: DispatchSourceTimer?
  private var observers: [NSObjectProtocol] = []
  private var foreground = true
  private var pendingMainAt: CFTimeInterval?
  private var countedThresholds = 0
  private var incidentWritten = false
  private var mode = "paused"
  private var startedAt = CACurrentMediaTime()
  private var mainMaxGapMs = 0
  private var mainGapCounts: [Int: Int] = [:]
  private var counters: [String: [String: Int]] = ["paused": [:], "playing": [:]]

  func start() {
    lock.lock()
    if timer != nil { lock.unlock(); return }
    startedAt = CACurrentMediaTime()
    lock.unlock()

    observers.append(NotificationCenter.default.addObserver(
      forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: nil
    ) { [weak self] _ in self?.setForeground(false) })
    observers.append(NotificationCenter.default.addObserver(
      forName: UIApplication.willEnterForegroundNotification, object: nil, queue: nil
    ) { [weak self] _ in self?.setForeground(true) })

    let source = DispatchSource.makeTimerSource(queue: monitorQueue)
    source.schedule(deadline: .now() + .milliseconds(100), repeating: .milliseconds(100), leeway: .milliseconds(25))
    source.setEventHandler { [weak self] in self?.pulse() }
    lock.lock()
    timer = source
    lock.unlock()
    source.resume()
  }

  deinit {
    timer?.cancel()
    for observer in observers { NotificationCenter.default.removeObserver(observer) }
  }

  func setPlaying(_ playing: Bool) {
    lock.lock()
    let next = playing ? "playing" : "paused"
    if next != mode {
      mode = next
      counters[next, default: [:]]["transitions", default: 0] += 1
    }
    lock.unlock()
  }

  func count(_ key: String) {
    lock.lock()
    counters[mode, default: [:]][key, default: 0] += 1
    lock.unlock()
  }

  func reset() {
    lock.lock()
    counters = ["paused": [:], "playing": [:]]
    mainGapCounts = [:]
    mainMaxGapMs = 0
    pendingMainAt = nil
    countedThresholds = 0
    incidentWritten = false
    startedAt = CACurrentMediaTime()
    lock.unlock()
    UserDefaults.standard.removeObject(forKey: incidentKey)
  }

  func snapshot() -> [String: Any] {
    lock.lock()
    let current = snapshotLocked()
    lock.unlock()
    var result = current
    result["lastIncident"] = UserDefaults.standard.dictionary(forKey: incidentKey) ?? [:]
    return result
  }

  private func setForeground(_ isForeground: Bool) {
    lock.lock()
    foreground = isForeground
    pendingMainAt = nil
    countedThresholds = 0
    lock.unlock()
  }

  private func pulse() {
    let now = CACurrentMediaTime()
    var shouldDispatch = false
    var incident: [String: Any]?
    lock.lock()
    if foreground {
      if let pending = pendingMainAt {
        let delayedMs = max(0, Int((now - pending) * 1000))
        recordMainGapLocked(delayedMs)
        if delayedMs > 2000 && !incidentWritten {
          incidentWritten = true
          incident = snapshotLocked()
        }
      } else {
        pendingMainAt = now
        countedThresholds = 0
        shouldDispatch = true
      }
    }
    lock.unlock()

    if let incident = incident {
      // One bounded write on a detected severe stall, off the main thread.
      UserDefaults.standard.set(incident, forKey: incidentKey)
      UserDefaults.standard.synchronize()
    }
    if shouldDispatch {
      DispatchQueue.main.async { [weak self] in self?.ackMain() }
    }
  }

  private func ackMain() {
    lock.lock()
    if let pending = pendingMainAt, foreground {
      recordMainGapLocked(max(0, Int((CACurrentMediaTime() - pending) * 1000)))
    }
    pendingMainAt = nil
    countedThresholds = 0
    lock.unlock()
  }

  private func recordMainGapLocked(_ milliseconds: Int) {
    mainMaxGapMs = max(mainMaxGapMs, milliseconds)
    for index in countedThresholds..<thresholds.count {
      let threshold = thresholds[index]
      if milliseconds <= threshold { break }
      mainGapCounts[threshold, default: 0] += 1
      countedThresholds = index + 1
    }
  }

  private func snapshotLocked() -> [String: Any] {
    return [
      "capturedAt": Date().timeIntervalSince1970,
      "elapsedSeconds": CACurrentMediaTime() - startedAt,
      "mode": mode,
      "mainMaxGapMs": mainMaxGapMs,
      "mainGap50": mainGapCounts[50] ?? 0,
      "mainGap100": mainGapCounts[100] ?? 0,
      "mainGap250": mainGapCounts[250] ?? 0,
      "mainGap500": mainGapCounts[500] ?? 0,
      "mainGap1000": mainGapCounts[1000] ?? 0,
      "mainGap2000": mainGapCounts[2000] ?? 0,
      "counters": counters
    ]
  }
}

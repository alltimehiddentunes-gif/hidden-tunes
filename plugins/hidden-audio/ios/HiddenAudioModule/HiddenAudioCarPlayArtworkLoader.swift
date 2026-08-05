import Foundation
import ImageIO
import UIKit

/// Bounded, non-blocking artwork pipeline for native CarPlay list rows.
final class HiddenAudioCarPlayArtworkLoader {
  static let shared = HiddenAudioCarPlayArtworkLoader()

  static let maximumEntryCount = 48
  static let maximumMemoryBytes = 6 * 1024 * 1024
  static let maximumConcurrentRequests = 3
  static let requestTimeoutSeconds: TimeInterval = 8

  private let cache = NSCache<NSString, UIImage>()
  private let queue = OperationQueue()
  private let lock = NSLock()
  private var tasks: [String: URLSessionDataTask] = [:]
  private var pending: [String: (url: URL, maximumPixelSize: Int)] = [:]
  private var completions: [String: [(UIImage?) -> Void]] = [:]
  private var activeRequestCount = 0
  private lazy var session: URLSession = {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = Self.requestTimeoutSeconds
    configuration.timeoutIntervalForResource = Self.requestTimeoutSeconds
    configuration.urlCache = nil
    return URLSession(configuration: configuration, delegate: nil, delegateQueue: queue)
  }()

  private init() {
    cache.countLimit = Self.maximumEntryCount
    cache.totalCostLimit = Self.maximumMemoryBytes
    queue.maxConcurrentOperationCount = Self.maximumConcurrentRequests
    queue.qualityOfService = .utility
  }

  func image(
    source: String,
    targetPointSize: CGSize,
    displayScale: CGFloat,
    completion: @escaping (UIImage?) -> Void
  ) {
    guard source.hasPrefix("https://"), let url = URL(string: source) else {
      completion(nil)
      return
    }
    let width = max(1, Int(ceil(targetPointSize.width * displayScale)))
    let height = max(1, Int(ceil(targetPointSize.height * displayScale)))
    let key = "\(source)|\(width)x\(height)"
    if let cached = cache.object(forKey: key as NSString) {
      completion(cached)
      return
    }

    lock.lock()
    if tasks[key] != nil || pending[key] != nil {
      completions[key, default: []].append(completion)
      lock.unlock()
      return
    }
    completions[key] = [completion]
    pending[key] = (url, max(width, height))
    let starting = startPendingRequestsLocked()
    lock.unlock()
    starting.forEach { $0.resume() }
  }

  func cancelOutstandingRequests() {
    lock.lock()
    let active = Array(tasks.values)
    tasks.removeAll(keepingCapacity: false)
    pending.removeAll(keepingCapacity: false)
    completions.removeAll(keepingCapacity: false)
    activeRequestCount = 0
    lock.unlock()
    active.forEach { $0.cancel() }
  }

  private func finish(key: String, image: UIImage?) {
    lock.lock()
    let callbacks = completions.removeValue(forKey: key) ?? []
    if tasks.removeValue(forKey: key) != nil {
      activeRequestCount = max(0, activeRequestCount - 1)
    }
    let starting = startPendingRequestsLocked()
    lock.unlock()
    starting.forEach { $0.resume() }
    DispatchQueue.main.async { callbacks.forEach { $0(image) } }
  }

  /// Called only while `lock` is held. It is the strict global request cap,
  /// independent of how many artwork hosts are represented in one snapshot.
  private func startPendingRequestsLocked() -> [URLSessionDataTask] {
    var starting: [URLSessionDataTask] = []
    while activeRequestCount < Self.maximumConcurrentRequests,
      let (key, requestInfo) = pending.first {
      pending.removeValue(forKey: key)
      let request = URLRequest(url: requestInfo.url, cachePolicy: .returnCacheDataElseLoad,
        timeoutInterval: Self.requestTimeoutSeconds)
      let task = session.dataTask(with: request) { [weak self] data, response, _ in
        guard let self else { return }
        self.queue.addOperation {
          let mime = (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Type") ?? ""
          let image = data.flatMap { payload -> UIImage? in
            guard payload.count <= Self.maximumMemoryBytes,
              mime.isEmpty || mime.lowercased().hasPrefix("image/") else { return nil }
            return Self.thumbnail(data: payload, maximumPixelSize: requestInfo.maximumPixelSize)
          }
          if let image {
            let cost = max(1, Int(image.size.width * image.scale) * Int(image.size.height * image.scale) * 4)
            self.cache.setObject(image, forKey: key as NSString, cost: cost)
          }
          self.finish(key: key, image: image)
        }
      }
      tasks[key] = task
      activeRequestCount += 1
      starting.append(task)
    }
    return starting
  }

  private static func thumbnail(data: Data, maximumPixelSize: Int) -> UIImage? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceThumbnailMaxPixelSize: maximumPixelSize,
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
    return UIImage(cgImage: image)
  }
}

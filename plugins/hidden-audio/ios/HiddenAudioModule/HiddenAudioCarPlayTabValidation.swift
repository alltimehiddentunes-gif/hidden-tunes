import CarPlay
import Foundation

/// Pure CarPlay tab-bar validation.
/// Prevents `CPTabBarTemplate validateTemplates:` SIGABRT by rejecting
/// invalid children before `CPTabBarTemplate(templates:)` is called.
enum HiddenAudioCarPlayTabValidation {
  /// Apple permits a small fixed number of tabs; keep well under the limit.
  static let maxTabCount = 5

  static func validateCarPlayTabs(_ templates: [CPTemplate]) -> Bool {
    guard !templates.isEmpty else {
      NSLog("[HTCarPlay] invalid tabs: empty")
      return false
    }

    guard templates.count <= maxTabCount else {
      NSLog("[HTCarPlay] invalid tabs: count=%d exceeds max=%d", templates.count, maxTabCount)
      return false
    }

    var identities = Set<ObjectIdentifier>()

    for (index, template) in templates.enumerated() {
      let identifier = ObjectIdentifier(template)
      guard identities.insert(identifier).inserted else {
        NSLog("[HTCarPlay] invalid tabs: duplicate at \(index)")
        return false
      }

      guard let title = template.tabTitle,
            !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        NSLog("[HTCarPlay] invalid tabs: missing title at \(index)")
        return false
      }

      guard template.tabImage != nil else {
        NSLog("[HTCarPlay] invalid tabs: missing image at \(index)")
        return false
      }

      // Only CPListTemplate children are used as production tab roots.
      // CPSearchTemplate / CPNowPlayingTemplate / custom UIKit views are rejected.
      guard template is CPListTemplate else {
        NSLog(
          "[HTCarPlay] invalid tab class at \(index): %@",
          String(describing: type(of: template))
        )
        return false
      }
    }

    return true
  }

  static func logTabDiagnostics(_ templates: [CPTemplate]) {
    NSLog("[HTCarPlay] building tab bar count=%d", templates.count)
    for (index, template) in templates.enumerated() {
      NSLog(
        "[HTCarPlay] tab[%d] class=%@ title=%@ image=%d",
        index,
        String(describing: type(of: template)),
        template.tabTitle ?? "<nil>",
        template.tabImage != nil ? 1 : 0
      )
    }
  }
}

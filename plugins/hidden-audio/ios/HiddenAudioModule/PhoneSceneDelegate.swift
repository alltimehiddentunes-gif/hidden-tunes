import UIKit

/// Phone UIWindowScene delegate. Required once UIApplicationSceneManifest exists
/// (CarPlay + modern iOS SDK). Starts the existing Expo/React Native UI in the
/// phone window without changing playback ownership.
final class PhoneSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window

    if let appDelegate = UIApplication.shared.delegate as? AppDelegate {
      appDelegate.attachReactNative(to: window)
    }

    window.makeKeyAndVisible()
  }
}

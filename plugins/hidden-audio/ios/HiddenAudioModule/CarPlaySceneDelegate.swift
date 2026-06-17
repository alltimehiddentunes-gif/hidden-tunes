import CarPlay
import UIKit

class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController
  ) {
    let item = CPListItem(
      text: "Hidden Tunes is connected",
      detailText: nil
    )
    let section = CPListSection(items: [item])
    let template = CPListTemplate(
      title: "Hidden Tunes",
      sections: [section]
    )

    interfaceController.setRootTemplate(template, animated: false, completion: nil)
  }

  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didDisconnect interfaceController: CPInterfaceController
  ) {}
}

import UIKit
import Capacitor
import Security

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private weak var bridgeViewController: CAPBridgeViewController?
    private var boldTextObserver: NSObjectProtocol?
    private var contentSizeObserver: NSObjectProtocol?
    private var privacyCover: UIView?
    private let authInstallMarker = "biblequest-native-auth-install-v1"
    private let authKeyPrefix = "biblequest_auth_"

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }

        clearRetainedAuthAfterReinstall()
        let bridge = CAPBridgeViewController()
        bridgeViewController = bridge
        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = bridge
        window?.makeKeyAndVisible()

        protectJourneyMirror()
        observeBoldText()
        observeContentSizeCategory()
        SceneDelegateProxy.shared.scene(
            scene,
            willConnectTo: session,
            options: connectionOptions
        )
    }

    // The app-container marker is removed on uninstall while Keychain can
    // survive it, so a missing marker identifies an older installation.
    private func clearRetainedAuthAfterReinstall() {
        let files = FileManager.default
        guard let support = files.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first else { return }
        let marker = support.appendingPathComponent(authInstallMarker)
        guard !files.fileExists(atPath: marker.path) else { return }

        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecReturnAttributes: true,
            kSecMatchLimit: kSecMatchLimitAll,
            kSecAttrSynchronizable: kSecAttrSynchronizableAny
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            return
        }

        var cleared = true
        let items = result as? [[CFString: Any]] ?? []
        for item in items {
            guard let account = item[kSecAttrAccount] as? String,
                  account.hasPrefix(authKeyPrefix) else { continue }
            let deletion: [CFString: Any] = [
                kSecClass: kSecClassGenericPassword,
                kSecAttrAccount: account,
                kSecAttrSynchronizable: kSecAttrSynchronizableAny
            ]
            let deletionStatus = SecItemDelete(deletion as CFDictionary)
            cleared = cleared && (
                deletionStatus == errSecSuccess ||
                deletionStatus == errSecItemNotFound
            )
        }
        if cleared {
            try? files.createDirectory(
                at: support,
                withIntermediateDirectories: true
            )
            try? Data().write(to: marker, options: .atomic)
        }
    }

    deinit {
        if let observer = boldTextObserver {
            NotificationCenter.default.removeObserver(observer)
        }
        if let observer = contentSizeObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    // Covers private journal and prayer content before iOS snapshots the app.
    func sceneDidEnterBackground(_ scene: UIScene) {
        showPrivacyCover()
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        hidePrivacyCover()
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        syncBoldText()
        syncContentSizeCategory()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    // Existing mirrors predate the entitlement, so upgrade that file in place.
    private func protectJourneyMirror() {
        guard let documents = FileManager.default.urls(
            for: .documentDirectory,
            in: .userDomainMask
        ).first else { return }
        let mirror = documents.appendingPathComponent("journey-backup.json")
        try? FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: mirror.path
        )
    }

    // Mirrors iOS Bold Text into the same semantic layer as the app toggle.
    private func observeBoldText() {
        boldTextObserver = NotificationCenter.default.addObserver(
            forName: UIAccessibility.boldTextStatusDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.syncBoldText()
        }
        syncBoldText()
    }

    private func syncBoldText() {
        let enabled = UIAccessibility.isBoldTextEnabled ? "true" : "false"
        let script = """
        (() => {
          const apply = () => document.documentElement.classList.toggle('system-bold-text', \(enabled));
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', apply, { once: true });
          } else {
            apply();
          }
        })();
        """
        bridgeViewController?.webView?.evaluateJavaScript(script)
    }

    // Mirrors iOS accessibility text categories into responsive web layouts.
    private func observeContentSizeCategory() {
        contentSizeObserver = NotificationCenter.default.addObserver(
            forName: UIContentSizeCategory.didChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.syncContentSizeCategory()
        }
        syncContentSizeCategory()
    }

    private func syncContentSizeCategory() {
        let enabled = UIApplication.shared.preferredContentSizeCategory
            .isAccessibilityCategory ? "true" : "false"
        let script = """
        (() => {
          const apply = () => document.documentElement.classList.toggle('system-accessibility-text', \(enabled));
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', apply, { once: true });
          } else {
            apply();
          }
        })();
        """
        bridgeViewController?.webView?.evaluateJavaScript(script)
    }

    private func showPrivacyCover() {
        guard privacyCover == nil, let window = window else { return }
        let cover = UIView(frame: window.bounds)
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        cover.backgroundColor = UIColor(
            red: 250 / 255,
            green: 246 / 255,
            blue: 236 / 255,
            alpha: 1
        )

        let title = UILabel()
        title.text = "BibleQuest"
        title.font = .preferredFont(forTextStyle: .title1)
        title.textColor = UIColor(
            red: 22 / 255,
            green: 77 / 255,
            blue: 53 / 255,
            alpha: 1
        )
        title.textAlignment = .center

        let note = UILabel()
        note.text = "Your journey stays private."
        note.font = .preferredFont(forTextStyle: .body)
        note.textColor = UIColor(
            red: 80 / 255,
            green: 78 / 255,
            blue: 70 / 255,
            alpha: 1
        )
        note.textAlignment = .center

        let stack = UIStackView(arrangedSubviews: [title, note])
        stack.axis = .vertical
        stack.spacing = 8
        stack.translatesAutoresizingMaskIntoConstraints = false
        cover.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: cover.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: cover.centerYAnchor),
            stack.leadingAnchor.constraint(
                greaterThanOrEqualTo: cover.leadingAnchor,
                constant: 24
            ),
            stack.trailingAnchor.constraint(
                lessThanOrEqualTo: cover.trailingAnchor,
                constant: -24
            )
        ])
        window.addSubview(cover)
        privacyCover = cover
    }

    private func hidePrivacyCover() {
        privacyCover?.removeFromSuperview()
        privacyCover = nil
    }
}

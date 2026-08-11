import Capacitor
import Foundation
import StoreKit
import UIKit

// The checked-in Xcode configurations stay closed; Task 1 must opt only its
// separate account-beta configuration into this native bridge.
enum BibleQuestNativeFeatures {
    static var usStripeCheckoutEnabled: Bool {
        let value = Bundle.main.object(
            forInfoDictionaryKey: "BibleQuestNativeUSStripeCheckoutEnabled"
        ) as? String
        return value == "YES"
    }
}

// Registers app-local plugins after Capacitor's generated plugin pass finishes.
final class BibleQuestBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard BibleQuestNativeFeatures.usStripeCheckoutEnabled else { return }
        bridge?.registerPluginInstance(BibleQuestCommercePlugin())
    }
}

@objc(BibleQuestCommercePlugin)
final class BibleQuestCommercePlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "BibleQuestCommercePlugin"
    let jsName = "BibleQuestCommerce"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(
            name: "getCurrentStorefront",
            returnType: CAPPluginReturnPromise
        ),
        CAPPluginMethod(
            name: "openExternalStripeUrl",
            returnType: CAPPluginReturnPromise
        ),
        CAPPluginMethod(
            name: "cancelExternalStripeOpen",
            returnType: CAPPluginReturnPromise
        )
    ]

    private var storefrontUpdatesTask: Task<Void, Never>?
    @MainActor private var pendingExternalOpens = Set<String>()
    @MainActor private var cancelledExternalOpens = Set<String>()

    // Storefront values remain ephemeral; listeners receive only an invalidation.
    override func load() {
        super.load()
        storefrontUpdatesTask = Task { @MainActor [weak self] in
            for await _ in Storefront.updates {
                guard !Task.isCancelled else { return }
                self?.notifyListeners("storefrontChanged", data: [:])
            }
        }
    }

    deinit {
        storefrontUpdatesTask?.cancel()
    }

    // Reads StoreKit immediately before presentation and returns no storefront ID.
    @objc func getCurrentStorefront(_ call: CAPPluginCall) {
        guard BibleQuestNativeFeatures.usStripeCheckoutEnabled else {
            call.unavailable("Native checkout is unavailable.")
            return
        }
        Task { @MainActor in
            let storefront = await Storefront.current
            var result: JSObject = [
                "checkedAtEpochMilliseconds": (
                    Date().timeIntervalSince1970 * 1_000
                ).rounded()
            ]
            if let countryCode = storefront?.countryCode {
                result["countryCode"] = countryCode
            }
            call.resolve(result)
        }
    }

    // Opens only the purpose-matched Stripe host in the system/default browser.
    @objc func openExternalStripeUrl(_ call: CAPPluginCall) {
        guard BibleQuestNativeFeatures.usStripeCheckoutEnabled else {
            call.unavailable("Native checkout is unavailable.")
            return
        }
        guard let rawUrl = call.getString("url"),
              let purpose = call.getString("purpose"),
              let requestId = call.getString("requestId"),
              validOpenRequestId(requestId),
              let url = approvedStripeUrl(rawUrl, purpose: purpose) else {
            call.reject("The external destination is invalid.", "invalid_destination")
            return
        }
        // A WebView reload cannot strand a late StoreKit task that later opens.
        let deadlineUptime = ProcessInfo.processInfo.systemUptime + 4
        // StoreKit is checked again in the same main-actor turn as the open,
        // closing the final JavaScript-to-native storefront race.
        Task { @MainActor in
            guard cancelledExternalOpens.remove(requestId) == nil else {
                call.resolve(["opened": false])
                return
            }
            pendingExternalOpens.insert(requestId)
            let storefront = await Storefront.current
            guard pendingExternalOpens.remove(requestId) != nil,
                  ProcessInfo.processInfo.systemUptime <= deadlineUptime,
                  storefront?.countryCode == "USA" else {
                call.resolve(["opened": false])
                return
            }
            UIApplication.shared.open(url, options: [:]) { opened in
                call.resolve(["opened": opened])
            }
        }
    }

    // Cancels a suspended StoreKit check before it can open an old account URL.
    @objc func cancelExternalStripeOpen(_ call: CAPPluginCall) {
        guard let requestId = call.getString("requestId"),
              validOpenRequestId(requestId) else {
            call.reject("The external request is invalid.", "invalid_request")
            return
        }
        Task { @MainActor in
            if pendingExternalOpens.remove(requestId) == nil {
                // A cancel can reach the actor before its previously queued
                // open task. Keep a tiny tombstone set for that ordering.
                if cancelledExternalOpens.count >= 8 {
                    cancelledExternalOpens.removeAll()
                }
                cancelledExternalOpens.insert(requestId)
            }
            call.resolve()
        }
    }

    // Accepts only the small monotonic handle generated inside this WebView.
    private func validOpenRequestId(_ value: String) -> Bool {
        let prefix = "bq-open-"
        guard value.hasPrefix(prefix), value.count == prefix.count + 32 else {
            return false
        }
        let suffix = value.dropFirst(prefix.count)
        return suffix.unicodeScalars.allSatisfy { scalar in
            (48...57).contains(scalar.value) ||
                (97...102).contains(scalar.value)
        }
    }

    // Revalidates the exact provider host without discarding Stripe query data.
    private func approvedStripeUrl(_ rawUrl: String, purpose: String) -> URL? {
        let expectedHost: String
        switch purpose {
        case "checkout":
            expectedHost = "checkout.stripe.com"
        case "billing":
            expectedHost = "billing.stripe.com"
        default:
            return nil
        }
        guard !rawUrl.isEmpty,
              rawUrl.utf8.count <= 8 * 1_024,
              rawUrl.hasPrefix("https://\(expectedHost)/"),
              !rawUrl.contains("\\"),
              rawUrl.rangeOfCharacter(from: .whitespacesAndNewlines) == nil,
              rawUrl.rangeOfCharacter(from: .controlCharacters) == nil,
              let components = URLComponents(string: rawUrl),
              components.scheme == "https",
              components.host == expectedHost,
              components.user == nil,
              components.password == nil,
              components.port == nil else {
            return nil
        }
        return components.url
    }
}

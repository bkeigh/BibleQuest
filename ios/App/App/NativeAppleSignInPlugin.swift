import AuthenticationServices
import Capacitor
import CryptoKit
import Security
import UIKit

// Registers BibleQuest-owned native plugins after Capacitor creates its bridge.
final class BibleQuestBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeAppleSignInPlugin())
    }
}

// Presents Apple's trusted account sheet and returns only its nonce-bound token.
@objc(NativeAppleSignInPlugin)
final class NativeAppleSignInPlugin: CAPPlugin, CAPBridgedPlugin,
    ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding {
    let identifier = "NativeAppleSignInPlugin"
    let jsName = "NativeAppleSignIn"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]

    private var authorizationController: ASAuthorizationController?
    private var pendingCall: CAPPluginCall?
    private var pendingNonce: String?

    // Starts one interactive authorization and rejects overlapping account sheets.
    @objc func authorize(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else {
                call.reject("Apple sign-in is unavailable.", "APPLE_SIGN_IN_UNAVAILABLE")
                return
            }
            guard self.pendingCall == nil else {
                call.reject("Apple sign-in is already open.", "APPLE_SIGN_IN_BUSY")
                return
            }
            guard self.presentationWindow() != nil else {
                call.reject("Apple sign-in cannot be presented.", "APPLE_SIGN_IN_UNAVAILABLE")
                return
            }

            do {
                let nonce = try self.randomNonce()
                let request = ASAuthorizationAppleIDProvider().createRequest()
                // Email is the only profile field BibleQuest needs for account access.
                request.requestedScopes = [.email]
                request.nonce = self.sha256(nonce)

                let controller = ASAuthorizationController(
                    authorizationRequests: [request]
                )
                controller.delegate = self
                controller.presentationContextProvider = self
                self.pendingCall = call
                self.pendingNonce = nonce
                self.authorizationController = controller
                controller.performRequests()
            } catch {
                call.reject(
                    "Apple sign-in could not start.",
                    "APPLE_SIGN_IN_UNAVAILABLE"
                )
            }
        }
    }

    // Returns no Apple user identifier or email to the WebView surface.
    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard
            let credential = authorization.credential
                as? ASAuthorizationAppleIDCredential,
            let tokenData = credential.identityToken,
            let token = String(data: tokenData, encoding: .utf8),
            !token.isEmpty,
            let nonce = pendingNonce,
            let call = pendingCall
        else {
            finishWithError(
                message: "Apple sign-in returned an invalid authorization.",
                code: "APPLE_SIGN_IN_INVALID"
            )
            return
        }

        clearPendingAuthorization()
        call.resolve([
            "identityToken": token,
            "nonce": nonce
        ])
    }

    // Maps dismissal separately so the UI can remain calm and unchanged.
    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        let code = ASAuthorizationError.Code(
            rawValue: (error as NSError).code
        )
        if code == .canceled {
            finishWithError(
                message: "Apple sign-in was canceled.",
                code: "APPLE_SIGN_IN_CANCELLED"
            )
            return
        }
        finishWithError(
            message: "Apple sign-in could not be completed.",
            code: "APPLE_SIGN_IN_FAILED"
        )
    }

    // Anchors the Apple sheet to the active BibleQuest scene.
    func presentationAnchor(
        for controller: ASAuthorizationController
    ) -> ASPresentationAnchor {
        return presentationWindow() ?? ASPresentationAnchor()
    }

    // Finds only an active foreground window and avoids deprecated global APIs.
    private func presentationWindow() -> UIWindow? {
        if let window = bridge?.viewController?.view.window {
            return window
        }
        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .filter { $0.activationState == .foregroundActive }
            .flatMap(\.windows)
            .first { $0.isKeyWindow }
    }

    // Generates a cryptographically random base64url nonce with no persistence.
    private func randomNonce() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        guard status == errSecSuccess else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
        }
        return Data(bytes)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    // Sends Apple only the SHA-256 digest while Supabase receives the raw nonce.
    private func sha256(_ value: String) -> String {
        let digest = SHA256.hash(data: Data(value.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    // Rejects the pending call with content-free errors and releases token state.
    private func finishWithError(message: String, code: String) {
        guard let call = pendingCall else {
            clearPendingAuthorization()
            return
        }
        clearPendingAuthorization()
        call.reject(message, code)
    }

    // Drops every interactive reference immediately after one terminal result.
    private func clearPendingAuthorization() {
        pendingCall = nil
        pendingNonce = nil
        authorizationController = nil
    }
}

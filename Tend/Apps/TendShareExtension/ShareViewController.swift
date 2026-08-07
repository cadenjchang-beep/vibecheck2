import SwiftUI
import TendKit
import UIKit
import UniformTypeIdentifiers

/// The Share Extension — §1's re-entry problem, attacked at the point it
/// actually happens.
///
/// A flyer in Photos, an invite in Messages, an address in Safari: share to
/// Tend and it arrives as a filled-in draft rather than as something to retype.
/// The extension writes to the same app-group store the app uses, so a draft
/// saved here is on the household's list before the sheet finishes dismissing.
final class ShareViewController: UIViewController {

    override func viewDidLoad() {
        super.viewDidLoad()
        Task { await loadAndPresent() }
    }

    private func loadAndPresent() async {
        let payload = await extractPayload()
        let draft = SharedContentParser.parse(
            text: payload.text,
            url: payload.url,
            scannedText: payload.scannedText
        )

        let view = ShareDraftView(
            draft: draft,
            onSave: { [weak self] in self?.complete() },
            onCancel: { [weak self] in self?.cancel() }
        )

        let hosting = UIHostingController(rootView: view)
        addChild(hosting)
        self.view.addSubview(hosting.view)
        hosting.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            hosting.view.topAnchor.constraint(equalTo: self.view.topAnchor),
            hosting.view.bottomAnchor.constraint(equalTo: self.view.bottomAnchor),
            hosting.view.leadingAnchor.constraint(equalTo: self.view.leadingAnchor),
            hosting.view.trailingAnchor.constraint(equalTo: self.view.trailingAnchor),
        ])
        hosting.didMove(toParent: self)
    }

    // MARK: - Payload

    private struct Payload {
        var text: String?
        var url: URL?
        var scannedText: String?
    }

    private func extractPayload() async -> Payload {
        var payload = Payload()
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else { return payload }

        for item in items {
            for provider in item.attachments ?? [] {
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    payload.url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL
                }
                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    payload.text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String
                }
                if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                    // An image is usually a flyer or a screenshot, so the useful
                    // content is the text in it. OCR runs on-device.
                    if let url = try? await provider.loadItem(forTypeIdentifier: UTType.image.identifier) as? URL,
                       let data = try? Data(contentsOf: url),
                       let image = UIImage(data: data) {
                        payload.scannedText = TextRecognizer.text(in: image)
                    } else if let image = try? await provider.loadItem(forTypeIdentifier: UTType.image.identifier) as? UIImage {
                        payload.scannedText = TextRecognizer.text(in: image)
                    }
                }
            }
        }

        if payload.text == nil, let attributed = item(named: NSExtensionJavaScriptPreprocessingResultsKey) {
            payload.text = attributed
        }
        return payload
    }

    private func item(named key: String) -> String? {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else { return nil }
        for item in items {
            if let dictionary = item.userInfo?[key] as? [String: Any],
               let text = dictionary["content"] as? String {
                return text
            }
        }
        return nil
    }

    // MARK: - Completion

    private func complete() {
        extensionContext?.completeRequest(returningItems: nil)
    }

    private func cancel() {
        extensionContext?.cancelRequest(withError: NSError(domain: "com.tend.share", code: 0))
    }
}

private extension NSItemProvider {
    /// Async wrapper over the completion-handler API, so the extraction above
    /// reads top to bottom.
    func loadItem(forTypeIdentifier identifier: String) async throws -> NSSecureCoding? {
        try await withCheckedThrowingContinuation { continuation in
            loadItem(forTypeIdentifier: identifier, options: nil) { item, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: item)
                }
            }
        }
    }
}

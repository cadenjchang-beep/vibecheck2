#if os(iOS)
import Foundation
import TendKit
import UIKit
import Vision

/// On-device OCR. Vision runs entirely locally, which is what lets §8's "no
/// third-party server ever touches it" stay true for a scanned recipe card or
/// a school flyer.
enum TextRecognizer {

    static func text(in image: UIImage) -> String {
        guard let cgImage = image.cgImage else { return "" }

        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        do {
            try handler.perform([request])
        } catch {
            TendLog.parser.error("OCR failed: \(error.localizedDescription)")
            return ""
        }

        return (request.results ?? [])
            .compactMap { $0.topCandidates(1).first?.string }
            .joined(separator: "\n")
    }
}
#endif

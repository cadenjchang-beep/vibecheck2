// swift-tools-version: 5.9
import PackageDescription

// TendKit is the shared layer every target links against: models + migration
// plan, CloudKit sync and sharing, App Intents, the deep-link router, and the
// two highest-risk pure-logic components (natural-language parsing and
// recurrence). Keeping them here means the widget, the Watch app and the share
// extension all agree on behaviour by construction rather than by convention.
let package = Package(
    name: "TendKit",
    defaultLocalization: "en",
    platforms: [
        .iOS(.v17),
        .watchOS(.v10),
    ],
    products: [
        .library(name: "TendKit", targets: ["TendKit"]),
    ],
    targets: [
        .target(name: "TendKit"),
        .testTarget(name: "TendKitTests", dependencies: ["TendKit"]),
    ]
)

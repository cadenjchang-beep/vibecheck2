import SwiftUI
import TendKit
import WidgetKit

@main
struct TendWidgetBundle: WidgetBundle {
    var body: some Widget {
        PulseWidget()
        ListWidget()
        NextEventWidget()
        #if canImport(ActivityKit)
        ShoppingTripLiveActivity()
        #endif
    }
}

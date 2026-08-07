import CloudKit
import Foundation
import Network

/// A serial, retrying queue for CloudKit work that Tend performs explicitly
/// (sharing, participant changes, shared-zone pulls). SwiftData's own mirroring
/// handles ordinary record writes; this covers everything it doesn't.
///
/// The contract: an operation handed to this queue is never dropped because the
/// network was unavailable. It waits, it retries with backoff, and the only way
/// it leaves the queue unfinished is a `.permanent` or `.surfaceToUser` verdict
/// from ``CloudKitErrorPolicy`` — both of which are reported, never silent.
public actor CloudKitOperationQueue {

    public struct Operation: Sendable {
        public let id: UUID
        public let name: String
        public let work: @Sendable () async throws -> Void

        public init(id: UUID = UUID(), name: String, work: @escaping @Sendable () async throws -> Void) {
            self.id = id
            self.name = name
            self.work = work
        }
    }

    /// Reported back so the UI can say "3 changes waiting to sync" instead of
    /// pretending everything is fine.
    public private(set) var pendingCount: Int = 0

    private var queue: [Operation] = []
    private var isDraining = false
    private var isOnline = true
    private let maxAttempts: Int
    private let onIssue: @Sendable (SyncIssue) -> Void
    private let reachability = NetworkReachability()

    public init(maxAttempts: Int = 8, onIssue: @escaping @Sendable (SyncIssue) -> Void = { _ in }) {
        self.maxAttempts = maxAttempts
        self.onIssue = onIssue
    }

    public func start() async {
        await reachability.start { [weak self] online in
            Task { await self?.setOnline(online) }
        }
    }

    public func enqueue(_ operation: Operation) {
        queue.append(operation)
        pendingCount = queue.count
        Task { await drain() }
    }

    public func enqueue(name: String, work: @escaping @Sendable () async throws -> Void) {
        enqueue(Operation(name: name, work: work))
    }

    private func setOnline(_ online: Bool) async {
        let wasOffline = !isOnline
        isOnline = online
        if online && wasOffline {
            TendLog.sync.info("Network back; draining \(self.queue.count) queued operations.")
            await drain()
        }
    }

    private func drain() async {
        guard !isDraining else { return }
        isDraining = true
        defer { isDraining = false }

        while let operation = queue.first {
            guard isOnline else {
                TendLog.sync.info("Offline; holding \(self.queue.count) operations.")
                return
            }

            var attempt = 0
            var finished = false

            while !finished {
                do {
                    try await operation.work()
                    finished = true
                } catch {
                    switch CloudKitErrorPolicy.response(to: error, attempt: attempt) {
                    case .ignore:
                        finished = true

                    case .retry(let delay):
                        attempt += 1
                        guard attempt < maxAttempts else {
                            TendLog.sync.error("\(operation.name) gave up after \(attempt) attempts.")
                            finished = true
                            break
                        }
                        try? await Task.sleep(for: .seconds(delay))

                    case .retryWhenOnline:
                        isOnline = false
                        // Leave the operation at the head of the queue; the
                        // reachability callback restarts the drain.
                        return

                    case .surfaceToUser(let issue):
                        onIssue(issue)
                        finished = true

                    case .permanent(let reason):
                        TendLog.sync.error("\(operation.name) failed permanently: \(reason)")
                        finished = true
                    }
                }
            }

            queue.removeFirst()
            pendingCount = queue.count
        }
    }
}

/// Thin wrapper over `NWPathMonitor`, so the queue can wait for connectivity
/// rather than burning retries against a radio that is off.
actor NetworkReachability {
    private var monitor: NWPathMonitor?

    func start(_ onChange: @escaping @Sendable (Bool) -> Void) {
        guard monitor == nil else { return }
        let monitor = NWPathMonitor()
        self.monitor = monitor
        monitor.pathUpdateHandler = { path in
            onChange(path.status == .satisfied)
        }
        monitor.start(queue: DispatchQueue(label: "com.tend.reachability"))
    }

    func stop() {
        monitor?.cancel()
        monitor = nil
    }
}

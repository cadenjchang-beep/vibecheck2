import Foundation
import SwiftData

/// Tend ships a migration plan from v1, before there is anything to migrate.
///
/// This is deliberate. Retrofitting `SchemaMigrationPlan` after real users have
/// CloudKit-backed data means writing the v1 → v2 stage *and* proving the
/// unversioned store opens as v1 on every device that already synced. Defining
/// the plan up front makes the second problem not exist.
///
/// ## Adding a schema version
///
/// 1. Copy `TendSchemaV1` to `TendSchemaV2`, bump `versionIdentifier`, and make
///    the change there. Never edit `TendSchemaV1`.
/// 2. Append `TendSchemaV2.self` to ``schemas``.
/// 3. Append a stage to ``stages`` — `.lightweight` when the change is purely
///    additive (new optional property, new model), `.custom` when data has to
///    be reshaped.
/// 4. Point the `typealias`es at the end of `TendSchemaV1.swift` at V2.
/// 5. Add a round-trip test in `MigrationPlanTests`.
///
/// CloudKit-specific caveat: a *destructive* change (dropping a property,
/// changing a type, adding a non-optional without a default) cannot be
/// mirrored. Such a change must be modelled as "add the new shape, migrate,
/// leave the old shape in place unused" — the old field is retired in code,
/// not in the store.
public enum TendMigrationPlan: SchemaMigrationPlan {

    public static var schemas: [any VersionedSchema.Type] {
        [TendSchemaV1.self]
    }

    public static var stages: [MigrationStage] {
        // v1 is the first shipped version, so there is nothing before it.
        // Example of what the next entry looks like:
        //
        // MigrationStage.lightweight(fromVersion: TendSchemaV1.self,
        //                            toVersion: TendSchemaV2.self)
        []
    }
}

/// The schema the app currently opens stores with.
public enum TendSchema {
    public static var current: Schema {
        Schema(versionedSchema: TendSchemaV1.self)
    }

    public static var currentVersion: Schema.Version {
        TendSchemaV1.versionIdentifier
    }
}

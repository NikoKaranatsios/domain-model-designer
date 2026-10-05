# Importing model JSON

Choose **Import** in the toolbar, upload a `.json` file or select **Paste JSON**, then choose **Preview model**. The preview validates the model and shows its name and counts. **Import model** replaces the current design; Undo restores it. Parsing happens in the browser and does not upload the file to a server.

Supported inputs:

- **Model JSON** exported by this product: `format: "uml-data-model"`, `formatVersion: "1.0.0"`. Domain areas, classes, attributes, keys, constraints, enumerations, value types and UML relationships are reconstructed. A new layout groups classes by domain area.
- **Design backup**: `{v: 1, model, layout, view}`. The model, arrangement, routes and view are restored exactly.
- A native model using `CTX`, `ENT`, `RELS`, `ENUMS`, `ENUMNOTES`, `TYPES` and `PRIMS`, either directly or under `model`. This gets a new layout when `layout` is absent.

For AI-created models, start from an exported Model JSON or this minimal example:

```json
{
  "format": "uml-data-model",
  "formatVersion": "1.0.0",
  "name": "Team directory",
  "classes": [
    {
      "id": "Team",
      "primaryKey": ["team_id"],
      "attributes": [
        { "name": "team_id", "type": "UUID" },
        { "name": "name", "type": "String" }
      ]
    },
    {
      "id": "Member",
      "attributes": [
        { "name": "member_id", "type": "UUID", "isIdentifier": true },
        { "name": "team_id", "type": "UUID", "references": ["Team"] },
        { "name": "name", "type": "String" }
      ]
    }
  ],
  "relationships": [
    {
      "id": "e0",
      "kind": "association",
      "name": "members",
      "from": { "classId": "Team", "role": "team", "multiplicity": "1" },
      "to": { "classId": "Member", "role": "members", "multiplicity": "0..*" },
      "navigability": "unspecified"
    }
  ]
}
```

Omitted domain areas produce one default area. Omitted primitive types provide UUID, String, Integer, Decimal, Boolean, DateTime and Date. Omitted attribute multiplicity means `1`. Multiplicities accept UML strings or `{notation, lowerBound, upperBound}`; notation and bounds must agree, and a null upper bound means unbounded. Class and type references are exact and case-sensitive.

Class kinds are `class`, `abstractClass`, and `interface`. Relationship kinds are `association`, `aggregation`, `composition`, `generalization`, `realization`, and `dependency`. Navigability is `unspecified`, `fromTo`, `toFrom`, or `both`. Supplied relationship IDs must be unique `e` plus a number. Omitted IDs are assigned automatically. The `from` endpoint is the whole for composition/aggregation and the subclass for generalization.

To edit an exported graph, change declared attributes and value-type definitions. Expanded fields with a value-type `source`, `inheritedAttributes`, `inheritanceConflicts`, `unresolvedTypes`, and `semantics` are derived export information. Import reconstructs included and inherited fields from their definitions rather than duplicating these fields. `superclasses` and `interfaces` can supply inheritance relationships when relationship rows are absent; keep both representations consistent when both are present. Keep explicit whole/part and subclass/superclass metadata consistent with endpoints.

Inputs must be valid JSON objects, at most 2 MB. Existing schema and canvas limits apply, including 256 classes, 64 areas, 2,048 relationships and bounded routing memory. Unknown references, conflicting multiplicities, duplicate IDs, unsafe names and inheritance/composition cycles are rejected before replacing the current design. This imports model definitions, not example application records or JSON Schema documents.

/* Stable, readable graph for people and AI; view filters never remove data. */
const ModelExport = (() => {
  const kinds = {
    assoc: 'association',
    agg: 'aggregation',
    comp: 'composition',
    gen: 'generalization',
    real: 'realization',
    dep: 'dependency',
  };
  function multiplicity(value) {
    if (!value) return null;
    const notation = ModelEditor.multiplicity(value),
      [lower, upper] = notation.split('..');
    return {
      notation,
      lowerBound: Number(lower),
      upperBound: upper === '*' ? null : Number(upper === undefined ? lower : upper),
    };
  }
  function attribute(f, source = 'declared', declaredIn) {
    const keys = f.k.split(' ').filter(Boolean);
    return {
      name: f.n,
      type: f.t,
      multiplicity: multiplicity(f.m),
      isIdentifier: keys.includes('PK'),
      isUnique: keys.includes('UK'),
      references: keys.filter((k) => k.startsWith('FK:')).map((k) => k.slice(3)),
      description: f.note,
      source,
      ...(declaredIn ? { declaredIn } : {}),
    };
  }
  function readable(config) {
    const { model: m } = DesignURL.validate(config);
    const classes = m.ENT.map((e) => {
      const attributes = e.f.map((f) => attribute(f, 'declared', e.id));
      const seen = new Set(e.f.map((f) => f.n));
      for (const name of e.includes || [])
        for (const f of m.TYPES.find((type) => type.n === name).f)
          if (!seen.has(f.n)) {
            attributes.push(attribute(f, name, name));
            seen.add(f.n);
          }
      const superclasses = [
        ...new Set(m.RELS.filter((r) => r.k === 'gen' && r.a === e.id).map((r) => r.b)),
      ];
      if (e.ext && !superclasses.includes(e.ext)) superclasses.push(e.ext);
      return {
        id: e.id,
        domainAreaId: e.ctx,
        kind: e.st === 'abstract' ? 'abstractClass' : e.st === 'interface' ? 'interface' : 'class',
        description: e.desc,
        superclasses,
        interfaces: m.RELS.filter((r) => r.k === 'real' && r.a === e.id).map((r) => r.b),
        includedValueTypes: [...(e.includes || [])],
        primaryKey: attributes.filter((f) => f.isIdentifier).map((f) => f.name),
        uniqueConstraints: [...(e.uk || [])],
        constraints: [...(e.checks || [])],
        attributes,
      };
    });
    const byId = new Map(classes.map((c) => [c.id, c])),
      resolved = new Set(),
      visiting = new Set();
    function inherit(c) {
      if (resolved.has(c.id)) return;
      if (visiting.has(c.id)) throw new Error('Inheritance contains a cycle at ' + c.id + '.');
      visiting.add(c.id);
      const inherited = [],
        own = new Set(c.attributes.map((a) => a.name)),
        seen = new Set();
      for (const parentId of c.superclasses) {
        const parent = byId.get(parentId);
        inherit(parent);
        for (const a of [...parent.attributes, ...parent.inheritedAttributes]) {
          const key = a.name + '@' + a.declaredIn;
          if (!own.has(a.name) && !seen.has(key)) {
            inherited.push({
              ...a,
              references: [...a.references],
              multiplicity: { ...a.multiplicity },
              inheritedFrom: parentId,
            });
            seen.add(key);
          }
        }
      }
      c.inheritedAttributes = inherited;
      c.primaryKey = [
        ...new Set(
          [...c.attributes, ...inherited].filter((a) => a.isIdentifier).map((a) => a.name)
        ),
      ];
      const origins = new Map();
      for (const a of inherited) {
        if (!origins.has(a.name)) origins.set(a.name, new Set());
        origins.get(a.name).add(a.declaredIn);
      }
      c.inheritanceConflicts = [...origins]
        .filter(([, sources]) => sources.size > 1)
        .map(([attributeName, sources]) => ({ attributeName, declaredIn: [...sources] }));
      visiting.delete(c.id);
      resolved.add(c.id);
    }
    classes.forEach(inherit);
    const relationships = m.RELS.map((r) => {
      const association = ['assoc', 'agg', 'comp'].includes(r.k),
        nav = r.nav === undefined ? (r.k === 'assoc' ? 'b' : 'none') : r.nav;
      const relationship = {
        id: 'e' + r.i,
        kind: kinds[r.k],
        name: r.l || null,
        from: {
          classId: r.a,
          role: r.role1 || null,
          multiplicity: association ? multiplicity(r.m1) : null,
        },
        to: {
          classId: r.b,
          role: r.role2 || null,
          multiplicity: association ? multiplicity(r.m2) : null,
        },
      };
      if (association)
        relationship.navigability = { none: 'unspecified', a: 'toFrom', b: 'fromTo', both: 'both' }[
          nav
        ];
      if (['agg', 'comp'].includes(r.k)) {
        relationship.wholeClassId = r.a;
        relationship.partClassId = r.b;
      }
      if (r.k === 'gen') {
        relationship.subclassId = r.a;
        relationship.superclassId = r.b;
      }
      if (r.k === 'real') {
        relationship.implementingClassId = r.a;
        relationship.interfaceId = r.b;
      }
      return relationship;
    });
    const definedTypes = new Set([
      ...classes.map((c) => c.id),
      ...Object.keys(m.ENUMS),
      ...m.TYPES.map((t) => t.n),
      ...m.PRIMS.map((p) => p[0]),
    ]);
    const unresolvedTypes = [
      ...new Set(
        [
          ...classes.flatMap((c) => c.attributes.map((a) => a.type)),
          ...m.TYPES.flatMap((t) => t.f.map((f) => f.t)),
        ].filter((type) => !definedTypes.has(type))
      ),
    ].sort();
    return {
      format: 'uml-data-model',
      formatVersion: '1.0.0',
      name: m.title || 'Domain Model',
      semantics: {
        scope: 'UML data structures only; no operations or behavior.',
        identifiers:
          'Class IDs and type names are exact, case-sensitive references. domainAreaId refers to a domainAreas entry.',
        multiplicity:
          'Bounds describe the number of values at that attribute or relationship end. upperBound null means unbounded; a null multiplicity means unspecified.',
        relationships:
          'Each relationship end describes that class and its role. Composition and aggregation put the diamond at wholeClassId. Generalization points from subclassId to superclassId.',
        inheritance:
          'attributes contains own and included value-type fields. inheritedAttributes resolves superclass fields, excluding overridden names. declaredIn identifies the original class or value type; inheritedFrom is the immediate superclass. inheritanceConflicts lists ambiguous names from multiple parents.',
        keys: 'primaryKey lists the attributes of the composite identifier. isUnique identifies a single-attribute unique key; uniqueConstraints and constraints preserve model rules as text.',
      },
      domainAreas: m.CTX.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.desc,
        ...(c.color ? { color: c.color } : {}),
      })),
      classes,
      relationships,
      unresolvedTypes,
      enumerations: Object.entries(m.ENUMS).map(([name, values]) => ({
        name,
        description: Object.hasOwn(m.ENUMNOTES, name) ? m.ENUMNOTES[name] : '',
        values: [...values],
      })),
      valueTypes: m.TYPES.map((t) => ({
        name: t.n,
        description: t.d,
        attributes: t.f.map((f) => attribute(f, 'declared', t.n)),
      })),
      primitiveTypes: m.PRIMS.map(([name, description]) => ({ name, description })),
    };
  }
  function json(config, format = 'readable') {
    if (!['readable', 'design'].includes(format)) throw new Error('Choose an export format.');
    const value = format === 'design' ? DesignURL.validate(config) : readable(config),
      pretty = JSON.stringify(value, null, 2) + '\n';
    return format === 'design' &&
      new TextEncoder().encode(pretty).length > DesignURL.limits.maxBytes
      ? JSON.stringify(value)
      : pretty;
  }
  const inline = (value) =>
    String(value)
      .replace(/\\/g, '\\\\')
      .replace(/[|`*_[\]#]/g, '\\$&')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\r\n?|\n/g, '<br>');
  function brief(config) {
    const g = readable(config),
      lines = [
        '# ' + inline(g.name),
        '',
        'UML data model · ' +
          g.domainAreas.length +
          ' domain areas · ' +
          g.classes.length +
          ' classes · ' +
          g.relationships.length +
          ' relationships',
        '',
        'Use this model as the source of truth when analysing or proposing data-model changes. Preserve identifiers, multiplicities, keys, and constraints. Ask about missing definitions rather than assuming them. The model contains data structures only; it does not define operations or behavior.',
        '',
        'Multiplicity applies at the listed attribute or relationship end; * means unbounded. Attribute origins resolve included value types and inheritance. PK means identifier, UK means individually unique, and FK names a referenced class.',
        '',
        '## Domain areas',
        '',
      ];
    for (const a of g.domainAreas)
      lines.push(
        '- **' +
          inline(a.name) +
          '** (`' +
          a.id +
          '`)' +
          (a.description ? ' — ' + inline(a.description) : '')
      );
    function fields(attributes) {
      if (!attributes.length) {
        lines.push('_No attributes._', '');
        return;
      }
      lines.push(
        '| Attribute | Type | Multiplicity | Keys / references | Origin | Description |',
        '| --- | --- | --- | --- | --- | --- |'
      );
      for (const a of attributes)
        lines.push(
          '| ' +
            [
              a.name,
              a.type,
              a.multiplicity.notation,
              [
                a.isIdentifier ? 'PK' : '',
                a.isUnique ? 'UK' : '',
                ...a.references.map((id) => 'FK: ' + id),
              ]
                .filter(Boolean)
                .join(', '),
              a.declaredIn + (a.inheritedFrom ? ' via ' + a.inheritedFrom : ''),
              a.description || '—',
            ]
              .map(inline)
              .join(' | ') +
            ' |'
        );
      lines.push('');
    }
    lines.push('', '## Classes', '');
    for (const c of g.classes) {
      lines.push('### ' + c.id, '', c.kind + ' · domain area: ' + c.domainAreaId, '');
      if (c.description) lines.push(inline(c.description), '');
      if (c.superclasses.length) lines.push('Inherits: ' + c.superclasses.join(', '), '');
      if (c.interfaces.length) lines.push('Implements: ' + c.interfaces.join(', '), '');
      if (c.includedValueTypes.length)
        lines.push('Includes: ' + c.includedValueTypes.join(', '), '');
      fields([...c.attributes, ...c.inheritedAttributes]);
      if (c.primaryKey.length) lines.push('Primary key: ' + c.primaryKey.join(', '), '');
      for (const rule of c.uniqueConstraints) lines.push('- Unique constraint: ' + inline(rule));
      for (const rule of c.constraints) lines.push('- Constraint: ' + inline(rule));
      for (const conflict of c.inheritanceConflicts)
        lines.push(
          '- Ambiguous inherited attribute: ' +
            conflict.attributeName +
            ' from ' +
            conflict.declaredIn.join(', ')
        );
      lines.push('');
    }
    lines.push(
      '## Relationships',
      '',
      '| ID | Kind | From end | To end | Name | Navigation / meaning |',
      '| --- | --- | --- | --- | --- | --- |'
    );
    const end = (e) =>
      e.classId +
      (e.role ? ' (role: ' + e.role + ')' : '') +
      (e.multiplicity ? ' [' + e.multiplicity.notation + ']' : '');
    for (const r of g.relationships) {
      const navigation = {
        unspecified: 'navigation unspecified',
        fromTo: 'from → to',
        toFrom: 'to → from',
        both: 'both directions',
      }[r.navigability];
      const meaning = r.wholeClassId
        ? 'whole: ' + r.wholeClassId + '; part: ' + r.partClassId + '; ' + navigation
        : r.superclassId
          ? 'subclass → superclass'
          : r.interfaceId
            ? 'implementer → interface'
            : navigation || 'from → to';
      lines.push(
        '| ' +
          [r.id, r.kind, end(r.from), end(r.to), r.name || '—', meaning].map(inline).join(' | ') +
          ' |'
      );
    }
    lines.push('', '## Enumerations', '');
    for (const e of g.enumerations) {
      lines.push('### ' + e.name, '');
      if (e.description) lines.push(inline(e.description), '');
      lines.push('Values: ' + e.values.map(inline).join(', '), '');
    }
    lines.push('## Value types', '');
    for (const t of g.valueTypes) {
      lines.push('### ' + t.name, '');
      if (t.description) lines.push(inline(t.description), '');
      fields(t.attributes);
    }
    lines.push('## Primitive types', '');
    for (const p of g.primitiveTypes) lines.push('- **' + p.name + '** — ' + inline(p.description));
    if (g.unresolvedTypes.length)
      lines.push(
        '',
        '## Types without definitions',
        '',
        'These attribute types are referenced by name but have no definition in this model: ' +
          g.unresolvedTypes.map(inline).join(', ') +
          '.'
      );
    return lines.join('\n').trim() + '\n';
  }
  function document(config, format = 'readable') {
    const { model: m } = DesignURL.validate(config);
    const normalized = (m.title || 'Domain Model')
      .normalize('NFKC')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/^[.\-]+|[.\-]+$/g, '');
    let base =
      Array.from(normalized)
        .slice(0, 80)
        .join('')
        .replace(/[.\-]+$/g, '') || 'domain-model';
    if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) base = 'model-' + base;
    const isBrief = format === 'brief';
    const contents = isBrief ? brief(config) : json(config, format);
    return {
      contents,
      filename: base + (isBrief ? '.ai.md' : format === 'design' ? '.design.json' : '.model.json'),
      mimeType: isBrief ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8',
      summary: {
        domainAreas: m.CTX.length,
        classes: m.ENT.length,
        attributes: m.ENT.reduce((count, e) => count + e.f.length, 0),
        relationships: m.RELS.length,
        enumerations: Object.keys(m.ENUMS).length,
        valueTypes: m.TYPES.length,
      },
    };
  }
  return { readable, json, brief, document };
})();

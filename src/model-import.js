/* Model JSON -> validated editor snapshot. No DOM, storage, or network access. */
const ModelImport = (() => {
  const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  function check(ok, message) {
    if (!ok) throw new Error(message);
  }
  function list(value, label, fallback = []) {
    if (value === undefined) return fallback;
    check(Array.isArray(value), label + ' must be an array.');
    return value;
  }
  function text(value, fallback = '') {
    if (value === undefined || value === null) return fallback;
    check(typeof value === 'string', 'Names, types, and descriptions must be text.');
    return value;
  }
  function multiplicity(value, fallback) {
    if (value === undefined) return fallback;
    if (value === null) return '';
    if (typeof value === 'string') return value === '' ? '' : ModelEditor.multiplicity(value);
    check(record(value), 'Multiplicity must be UML notation or an object with numeric bounds.');
    let notation;
    if (value.notation !== undefined) notation = ModelEditor.multiplicity(value.notation);
    else {
      check(
        Number.isInteger(value.lowerBound) &&
          value.lowerBound >= 0 &&
          (value.upperBound === null ||
            (Number.isInteger(value.upperBound) && value.upperBound >= value.lowerBound)),
        'Multiplicity bounds must be nonnegative integers; null upperBound means unbounded.'
      );
      notation = ModelEditor.multiplicity(
        value.lowerBound + '..' + (value.upperBound === null ? '*' : value.upperBound)
      );
    }
    const [lo, hi] = notation.split('..'),
      upper = hi === '*' ? null : Number(hi ?? lo);
    check(
      (value.lowerBound === undefined || value.lowerBound === Number(lo)) &&
        (value.upperBound === undefined || value.upperBound === upper),
      'Multiplicity notation conflicts with its numeric bounds.'
    );
    return notation;
  }
  function attributes(value, primaryKey = []) {
    return list(value, 'Attributes').map((a) => {
      check(record(a), 'Each attribute must be an object.');
      for (const key of ['isIdentifier', 'isUnique'])
        check(a[key] === undefined || typeof a[key] === 'boolean', key + ' must be true or false.');
      return {
        n: text(a.name),
        t: text(a.type),
        m: multiplicity(a.multiplicity, '1'),
        k: [
          ...(a.isIdentifier || primaryKey.includes(a.name) ? ['PK'] : []),
          ...(a.isUnique ? ['UK'] : []),
          ...list(a.references, 'Attribute references').map((id) => 'FK:' + text(id)),
        ].join(' '),
        note: text(a.description),
      };
    });
  }
  function arrange(model) {
    check(
      Array.isArray(model.CTX) && model.CTX.length > 0 && model.CTX.length <= 64,
      'A model needs between 1 and 64 domain areas.'
    );
    check(
      Array.isArray(model.ENT) && model.ENT.length <= 256,
      'A model can have up to 256 classes.'
    );
    check(
      model.CTX.every(record) &&
        model.ENT.every(
          (e) =>
            record(e) &&
            Array.isArray(e.f) &&
            e.f.length <= 256 &&
            e.f.every((f) => record(f) && typeof f.k === 'string')
        ),
      'Invalid model classes or attributes.'
    );
    const C = Math.max(1, Math.min(8, Math.ceil(Math.sqrt(model.ENT.length * 1.6)))),
      order = model.CTX.flatMap((area) =>
        model.ENT.filter((e) => e.ctx === area.id).map((e) => e.id)
      ),
      attributes = model.ENT.length <= 8 ? 'all' : 'keys';
    return {
      v: 1,
      model,
      layout: {
        version: 'imported-model',
        C,
        R: Math.max(1, Math.ceil(model.ENT.length / C)),
        gx: 100,
        gy: 100,
        cardWidth: 320,
        cell: model.ENT.map((e) => order.indexOf(e.id)),
        nodes: Object.fromEntries(
          model.ENT.map((e) => [e.id, { w: 320, h: ModelEditor.height(e, attributes) }])
        ),
        routes: {},
        ro: { grid: model.ENT.length > 64 ? 20 : 10 },
      },
      view: {
        hidden: [],
        selected: null,
        search: '',
        camera: { fit: true },
        attributes,
        labels: false,
      },
    };
  }
  function read(value) {
    check(record(value), 'Import a JSON object describing a model, not example records.');
    check(
      new TextEncoder().encode(JSON.stringify(value)).length <= DesignURL.limits.maxBytes,
      'The JSON is too large (maximum 2 MB).'
    );
    if (value.model && value.layout) return DesignURL.validate(value);
    if (value.ENT || value.model?.ENT) return DesignURL.validate(arrange(value.model || value));
    check(
      value.format === undefined || value.format === 'uml-data-model',
      'Unsupported model JSON format.'
    );
    check(
      value.formatVersion === undefined || value.formatVersion === '1.0.0',
      'Unsupported Model JSON version.'
    );
    check(
      Array.isArray(value.classes),
      'Choose Model JSON with a classes array, or a Design backup with model and layout.'
    );
    check(value.classes.length <= 256, 'A model can have up to 256 classes.');
    const areas = list(value.domainAreas, 'Domain areas', [
      { id: 'model', name: 'Domain model', description: '' },
    ]);
    const model = {
      title: text(value.name, 'Imported model'),
      CTX: areas.map((a) => {
        check(record(a), 'Each domain area must be an object.');
        return {
          id: a.id,
          name: a.name,
          desc: text(a.description),
          ...(a.color !== undefined ? { color: a.color } : {}),
        };
      }),
      ENT: [],
      RELS: [],
      ENUMS: {},
      ENUMNOTES: {},
      TYPES: [],
      PRIMS: [],
    };
    for (const c of value.classes) {
      check(record(c), 'Each class must be an object.');
      const kinds = { class: undefined, abstractClass: 'abstract', interface: 'interface' },
        kind = c.kind === undefined ? 'class' : c.kind;
      check(Object.hasOwn(kinds, kind), 'Unknown class kind: ' + kind);
      const included = list(c.includedValueTypes, 'Included value types'),
        fields = list(c.attributes, 'Class attributes');
      check(
        fields.every(
          (a) =>
            record(a) &&
            (a.source === undefined || a.source === 'declared' || included.includes(a.source))
        ),
        'Attribute origins must be declared or name an included value type.'
      );
      const entity = {
        id: c.id,
        ctx: c.domainAreaId === undefined && areas.length === 1 ? areas[0].id : c.domainAreaId,
        desc: text(c.description),
        f: attributes(
          fields.filter((a) => a.source === undefined || a.source === 'declared'),
          list(c.primaryKey, 'Primary key')
        ),
        uk: list(c.uniqueConstraints, 'Unique constraints'),
        checks: list(c.constraints, 'Constraints'),
        ...(kinds[kind] ? { st: kinds[kind] } : {}),
        ...(included.length ? { includes: included } : {}),
      };
      model.ENT.push(entity);
    }
    const enumerations = list(value.enumerations, 'Enumerations');
    const enumerationNames = new Set();
    for (const type of enumerations) {
      check(
        record(type) && typeof type.name === 'string' && !enumerationNames.has(type.name),
        'Invalid or duplicate enumeration.'
      );
      enumerationNames.add(type.name);
    }
    model.ENUMS = Object.fromEntries(
      enumerations.map((t) => [t.name, list(t.values, 'Enumeration values')])
    );
    model.ENUMNOTES = Object.fromEntries(enumerations.map((t) => [t.name, text(t.description)]));
    model.TYPES = list(value.valueTypes, 'Value types').map((t) => {
      check(record(t), 'Each value type must be an object.');
      return { n: t.name, d: text(t.description), f: attributes(t.attributes) };
    });
    const defaults = ['UUID', 'String', 'Integer', 'Decimal', 'Boolean', 'DateTime', 'Date'].map(
      (name) => ({ name, description: '' })
    );
    model.PRIMS = list(value.primitiveTypes, 'Primitive types', defaults).map((t) => {
      check(record(t), 'Each primitive type must be an object.');
      return [t.name, text(t.description)];
    });
    const kinds = {
        association: 'assoc',
        aggregation: 'agg',
        composition: 'comp',
        generalization: 'gen',
        realization: 'real',
        dependency: 'dep',
      },
      navigation = { unspecified: 'none', toFrom: 'a', fromTo: 'b', both: 'both' },
      used = new Set(),
      relationships = list(value.relationships, 'Relationships');
    check(relationships.length <= 2048, 'A model can have up to 2048 relationships.');
    for (const r of relationships) {
      check(
        record(r) && Object.hasOwn(kinds, r.kind) && record(r.from) && record(r.to),
        'Each relationship needs a supported kind and from/to classId endpoints.'
      );
      let i = 0;
      if (r.id !== undefined) {
        check(
          typeof r.id === 'string' && /^e\d+$/.test(r.id),
          'Relationship IDs must use e followed by a number, such as e0.'
        );
        i = Number(r.id.slice(1));
      } else while (used.has(i) || relationships.some((other) => other.id === 'e' + i)) i++;
      check(!used.has(i), 'Duplicate relationship ID.');
      used.add(i);
      const kind = kinds[r.kind],
        association = ['assoc', 'agg', 'comp'].includes(kind);
      if (r.navigability !== undefined)
        check(Object.hasOwn(navigation, r.navigability), 'Invalid relationship navigability.');
      for (const [key, expected] of [
        ['wholeClassId', r.from.classId],
        ['partClassId', r.to.classId],
        ['subclassId', r.from.classId],
        ['superclassId', r.to.classId],
        ['implementingClassId', r.from.classId],
        ['interfaceId', r.to.classId],
      ])
        check(
          r[key] === undefined || r[key] === expected,
          key + ' conflicts with the from/to endpoints.'
        );
      model.RELS.push({
        i,
        a: r.from.classId,
        b: r.to.classId,
        k: kind,
        l: text(r.name),
        m1: association ? multiplicity(r.from.multiplicity, '1') : '',
        m2: association ? multiplicity(r.to.multiplicity, '0..*') : '',
        role1: text(r.from.role),
        role2: text(r.to.role),
        nav: r.navigability === undefined ? 'none' : navigation[r.navigability],
      });
    }
    function inherit(from, to, kind) {
      if (model.RELS.some((r) => r.a === from && r.b === to && r.k === kind)) return;
      let i = 0;
      while (used.has(i)) i++;
      used.add(i);
      model.RELS.push({ i, a: from, b: to, k: kind, l: '', m1: '', m2: '', nav: 'none' });
    }
    for (const c of value.classes) {
      for (const [key, kind] of [
        ['superclasses', 'gen'],
        ['interfaces', 'real'],
      ]) {
        const explicit = model.RELS.filter((r) => r.a === c.id && r.k === kind).map((r) => r.b);
        const declared = list(c[key], 'Class ' + key);
        if (c[key] !== undefined && explicit.length)
          check(
            new Set(declared).size === explicit.length &&
              explicit.every((id) => declared.includes(id)),
            'Class ' + key + ' conflicts with its relationship rows. Update both definitions.'
          );
      }
      for (const parent of list(c.superclasses, 'Superclasses')) inherit(c.id, parent, 'gen');
      for (const type of list(c.interfaces, 'Interfaces')) inherit(c.id, type, 'real');
    }
    const config = DesignURL.validate(arrange(model)),
      graph = ModelExport.readable(config);
    for (const c of value.classes) {
      const resolved = graph.classes.find((e) => e.id === c.id),
        names = new Set(
          [...resolved.attributes, ...resolved.inheritedAttributes].map((a) => a.name)
        );
      check(
        list(c.primaryKey, 'Primary key').every(
          (name) => typeof name === 'string' && names.has(name)
        ),
        'A primaryKey names an attribute that does not exist.'
      );
    }
    return config;
  }
  function parse(source) {
    check(typeof source === 'string' && source.trim(), 'Choose a JSON file or paste model JSON.');
    check(
      new TextEncoder().encode(source).length <= DesignURL.limits.maxBytes,
      'The JSON is too large (maximum 2 MB).'
    );
    let value;
    try {
      value = JSON.parse(source.replace(/^\uFEFF/, ''));
    } catch {
      throw new Error('This is not valid JSON. Check for missing quotes, commas, or brackets.');
    }
    return read(value);
  }
  return { parse, read };
})();

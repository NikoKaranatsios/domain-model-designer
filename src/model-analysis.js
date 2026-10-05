/* Review a compiled graph. UML rules and relational conventions stay distinct. */
const ModelAnalysis = (() => {
  function review(g, model) {
    const issues = [],
      byId = new Map(g.classes.map((c) => [c.id, c]));
    const add = (code, message, classId, severity = 'warning') =>
      issues.push({ code, severity, ...(classId ? { classId } : {}), message });
    const all = (c) => [...c.attributes, ...c.inheritedAttributes];
    const upper = (m) => (m.upperBound === null ? Infinity : m.upperBound);
    function conforms(actual, expected, seen = new Set()) {
      if (actual === expected) return true;
      if (seen.has(actual)) return false;
      seen.add(actual);
      const c = byId.get(actual);
      return !!c && [...c.superclasses, ...c.interfaces].some((id) => conforms(id, expected, seen));
    }
    for (const type of g.unresolvedTypes)
      add(
        'undefined-type',
        'Type ' + type + ' has no class, enumeration, value-type or primitive definition.',
        null,
        'error'
      );
    for (const c of g.classes) {
      for (const conflict of c.inheritanceConflicts)
        add(
          'ambiguous-inheritance',
          'Inherited attribute ' +
            conflict.attributeName +
            ' has distinct definitions in ' +
            conflict.declaredIn.join(', ') +
            '.',
          c.id,
          'error'
        );
      for (const a of c.attributes) {
        for (const parentId of c.superclasses)
          for (const inherited of all(byId.get(parentId)).filter((f) => f.name === a.name))
            if (
              !conforms(a.type, inherited.type) ||
              a.multiplicity.lowerBound < inherited.multiplicity.lowerBound ||
              upper(a.multiplicity) > upper(inherited.multiplicity)
            )
              add(
                'incompatible-redefinition',
                a.name +
                  ' cannot redefine ' +
                  parentId +
                  '.' +
                  inherited.name +
                  ': its type must conform and its multiplicity must narrow the inherited range.',
                c.id,
                'error'
              );
      }
      for (const a of all(c)) {
        if (a.isIdentifier && (a.multiplicity.lowerBound !== 1 || a.multiplicity.upperBound !== 1))
          add(
            'relational-identifier',
            a.name +
              ' is an identifier with a nonscalar or optional value. UML permits this; a relational primary key requires one non-null value.',
            c.id
          );
        for (const targetId of a.references) {
          const target = byId.get(targetId),
            keys = all(target).filter((f) => target.primaryKey.includes(f.name));
          if (!keys.length)
            add(
              'reference-without-key',
              a.name + ' references ' + targetId + ', which has no declared identifier.',
              c.id
            );
          else if (keys.length > 1)
            add(
              'composite-reference',
              a.name +
                ' references the composite identifier of ' +
                targetId +
                '. Specify the component mapping in constraints; the class reference alone does not define it.',
              c.id
            );
          else if (a.type !== keys[0].type && a.type !== targetId)
            add(
              'foreign-key-type',
              a.name +
                ' has type ' +
                a.type +
                ' but ' +
                targetId +
                '.' +
                keys[0].name +
                ' has type ' +
                keys[0].type +
                '.',
              c.id,
              'error'
            );
          const links = g.relationships.filter(
            (r) =>
              ['association', 'aggregation', 'composition'].includes(r.kind) &&
              ((r.from.classId === c.id && r.to.classId === targetId) ||
                (r.to.classId === c.id && r.from.classId === targetId))
          );
          if (!links.length && !c.superclasses.includes(targetId))
            add(
              'reference-without-association',
              a.name +
                ' references ' +
                targetId +
                ' without a displayed association. Add the relationship or document the deliberate omission.',
              c.id
            );
          else if (
            links.length &&
            !links.some((r) => {
              const ends = [r.from, r.to].filter((end) => end.classId === targetId);
              return ends.some(
                (end) =>
                  end.multiplicity &&
                  end.multiplicity.lowerBound === a.multiplicity.lowerBound &&
                  end.multiplicity.upperBound === a.multiplicity.upperBound
              );
            })
          )
            add(
              'reference-multiplicity',
              a.name +
                ' and its association to ' +
                targetId +
                ' use different or unspecified reference bounds. Review the role-to-field mapping.',
              c.id
            );
        }
      }
    }
    for (const e of model.ENT) {
      const included = new Map();
      for (const name of e.includes || [])
        for (const f of model.TYPES.find((t) => t.n === name).f) {
          if (included.has(f.n) && !e.f.some((own) => own.n === f.n))
            add(
              'included-name-collision',
              f.n +
                ' is supplied by both ' +
                included.get(f.n) +
                ' and ' +
                name +
                '; declare one attribute explicitly to resolve it.',
              e.id,
              'error'
            );
          included.set(f.n, name);
        }
    }
    for (const r of g.relationships) {
      if (
        ['association', 'aggregation', 'composition'].includes(r.kind) &&
        (!r.from.multiplicity || !r.to.multiplicity)
      )
        add(
          'unspecified-multiplicity',
          r.id +
            ' has an unspecified end multiplicity. No cardinality can be inferred from a hidden or unspecified label.',
          r.from.classId
        );
    }
    const compositions = g.relationships.filter((r) => r.kind === 'composition');
    for (const c of g.classes) {
      const owners = compositions.filter((r) => r.partClassId === c.id);
      if (owners.length > 1)
        add(
          'exclusive-composition',
          'Instances of ' +
            c.id +
            ' may have at most one composite owner across all ' +
            owners.length +
            ' composition relationships. Enforce exclusive ownership between objects.',
          c.id
        );
      if (owners.some((r) => r.wholeClassId === c.id && r.from.multiplicity?.lowerBound === 1))
        add(
          'mandatory-recursive-owner',
          'Every ' +
            c.id +
            ' would require another ' +
            c.id +
            ' as its composite owner. A finite nonempty hierarchy needs an optional parent or a different root type.',
          c.id
        );
    }
    return {
      standard: 'OMG UML 2.5.1',
      scope:
        'Supported binary UML data structures and declared relational conventions. Business constraints are documentation, not executable validation; instance-level composition ownership and acyclicity require enforcement by the implementing service.',
      status: issues.some((i) => i.severity === 'error')
        ? 'issues'
        : issues.length
          ? 'review'
          : 'checked',
      issues,
    };
  }
  return { review };
})();

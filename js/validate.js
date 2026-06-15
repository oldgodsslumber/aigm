/* AI GM — system pack validation. Clear, path-specific error messages. */
const PackValidate = (function () {
  const FIELD_TYPES = ['number', 'text', 'track', 'list', 'derived'];
  const ROLL_TYPES = ['sum', 'target-number', 'pool-count', '2d20'];

  function validate(pack) {
    const errors = [], warnings = [];
    function err(p, msg) { errors.push(p + ': ' + msg); }
    function warn(p, msg) { warnings.push(p + ': ' + msg); }

    if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
      return { ok: false, errors: ['Pack must be a JSON object.'], warnings: [] };
    }

    /* meta */
    if (!pack.meta || typeof pack.meta !== 'object') err('meta', 'required object with at least a "name".');
    else {
      if (!pack.meta.name || typeof pack.meta.name !== 'string') err('meta.name', 'required string.');
      if (pack.meta.version != null && typeof pack.meta.version !== 'string' && typeof pack.meta.version !== 'number')
        warn('meta.version', 'should be a string or number.');
    }

    /* sheetSchema */
    const ids = {};
    if (!pack.sheetSchema || !Array.isArray(pack.sheetSchema.sections) || !pack.sheetSchema.sections.length) {
      err('sheetSchema.sections', 'required non-empty array of sections.');
    } else {
      pack.sheetSchema.sections.forEach(function (sec, si) {
        const sp = 'sheetSchema.sections[' + si + ']';
        if (!sec.title) err(sp + '.title', 'required string.');
        if (!Array.isArray(sec.fields) || !sec.fields.length) { err(sp + '.fields', 'required non-empty array.'); return; }
        sec.fields.forEach(function (f, fi) {
          const fp = sp + '.fields[' + fi + ']';
          if (!f.id || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(f.id)) err(fp + '.id', 'required identifier (letters, digits, underscore; starts with a letter).');
          else if (ids[f.id]) err(fp + '.id', 'duplicate field id "' + f.id + '" (ids must be unique across the whole sheet).');
          else ids[f.id] = f;
          if (!f.label) err(fp + '.label', 'required string.');
          if (FIELD_TYPES.indexOf(f.type) < 0) err(fp + '.type', 'must be one of ' + FIELD_TYPES.join(', ') + '.');
          if (f.type === 'track' && (typeof f.max !== 'number' || f.max < 1)) err(fp + '.max', 'track fields need a numeric max ≥ 1.');
          if (f.type === 'derived' && (!f.expr || typeof f.expr !== 'string')) err(fp + '.expr', 'derived fields need an "expr" string, e.g. "body + mind".');
        });
      });
      /* derived exprs reference known ids */
      Object.values(ids).forEach(function (f) {
        if (f.type !== 'derived') return;
        const refs = String(f.expr).match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
        refs.forEach(function (r) {
          if (!ids[r]) err('field "' + f.id + '".expr', 'references unknown field "' + r + '".');
          else if (ids[r].type !== 'number' && ids[r].type !== 'track') err('field "' + f.id + '".expr', '"' + r + '" is not numeric.');
        });
      });
    }

    /* rollDefinitions */
    if (!Array.isArray(pack.rollDefinitions) || !pack.rollDefinitions.length) {
      err('rollDefinitions', 'required non-empty array.');
    } else {
      const rids = {};
      pack.rollDefinitions.forEach(function (r, ri) {
        const rp = 'rollDefinitions[' + ri + ']';
        if (!r.id) err(rp + '.id', 'required.');
        else if (rids[r.id]) err(rp + '.id', 'duplicate roll id "' + r.id + '".');
        else rids[r.id] = true;
        if (!r.label) warn(rp + '.label', 'missing label; the id will be shown to the player.');
        if (ROLL_TYPES.indexOf(r.type) < 0) { err(rp + '.type', 'must be one of ' + ROLL_TYPES.join(', ') + '.'); return; }
        if (r.type === 'sum' || r.type === 'target-number') {
          if (!r.dice || typeof r.dice.sides !== 'number') err(rp + '.dice.sides', 'required number (e.g. {"count":1,"sides":20}).');
        }
        if (r.type === 'pool-count') {
          if (!r.dice || typeof r.dice.sides !== 'number') err(rp + '.dice.sides', 'required number.');
          const m = r.countRule && r.countRule.mode;
          if (m !== 'threshold' && m !== 'sets') err(rp + '.countRule.mode', 'must be "threshold" or "sets".');
          if (m === 'threshold' && typeof r.countRule.min !== 'number') err(rp + '.countRule.min', 'threshold rule needs a numeric "min" (success on min+).');
        }
        if (r.type === '2d20') {
          if (r.critUnder != null && typeof r.critUnder !== 'number') err(rp + '.critUnder', 'must be a number.');
          if (r.complicationFrom != null && typeof r.complicationFrom !== 'number') err(rp + '.complicationFrom', 'must be a number.');
        }
      });
    }

    /* gmPrompt */
    if (!pack.gmPrompt || typeof pack.gmPrompt !== 'string' || pack.gmPrompt.trim().length < 40) {
      err('gmPrompt', 'required string — the rules-knowledge document the GM plays from (at least a paragraph).');
    }

    /* templates */
    if (pack.templates != null) {
      if (!Array.isArray(pack.templates)) err('templates', 'must be an array.');
      else pack.templates.forEach(function (t, ti) {
        const tp = 'templates[' + ti + ']';
        if (!t.name) err(tp + '.name', 'required.');
        if (!t.sheet || typeof t.sheet !== 'object') err(tp + '.sheet', 'required object of field values.');
        else Object.keys(t.sheet).forEach(function (k) {
          if (!ids[k]) warn(tp + '.sheet.' + k, 'not a field in sheetSchema — will be ignored.');
        });
      });
    }

    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  return { validate: validate };
})();

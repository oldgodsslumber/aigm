/* AI GM — schema-driven character sheets.
 * Field types: number | text | track {current,max} | list | derived (expr).
 * Sheet truth is the append-only sheetLog; sheetState is the cached projection. */
const SheetUI = (function () {

  function allFields(schema) {
    const out = [];
    (schema.sections || []).forEach(function (s) { (s.fields || []).forEach(function (f) { out.push(f); }); });
    return out;
  }

  function newSheet(schema) {
    const state = {};
    allFields(schema).forEach(function (f) {
      if (f.type === 'number') state[f.id] = f.default != null ? f.default : 0;
      else if (f.type === 'text') state[f.id] = f.default || '';
      else if (f.type === 'track') state[f.id] = { current: f.default != null ? f.default : (f.max || 0), max: f.max || 0 };
      else if (f.type === 'list') state[f.id] = (f.default || []).slice();
      /* derived: not stored */
    });
    return state;
  }

  function getPath(state, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, state);
  }
  function setPath(state, path, value) {
    const parts = path.split('.');
    let o = state;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof o[parts[i]] !== 'object' || o[parts[i]] == null) o[parts[i]] = {};
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = value;
  }

  function applyChanges(state, changes, reverse) {
    (changes || []).forEach(function (c) {
      if (!c || !c.field) return;
      setPath(state, c.field, reverse ? c.from : c.to);
    });
    return state;
  }

  function describeChanges(changes) {
    return (changes || []).map(function (c) {
      const from = c.from === undefined ? '' : JSON.stringify(c.from) + ' → ';
      return c.field + ': ' + from + JSON.stringify(c.to);
    }).join(' · ');
  }

  /* numeric view of the sheet for derived exprs and prompt context:
     numbers as-is, tracks contribute their current value under the field id */
  function flatValues(schema, state) {
    const flat = {};
    allFields(schema).forEach(function (f) {
      const v = state[f.id];
      if (f.type === 'number') flat[f.id] = Number(v) || 0;
      else if (f.type === 'track') flat[f.id] = v && typeof v === 'object' ? Number(v.current) || 0 : 0;
    });
    return flat;
  }

  function evalExpr(expr, flat) {
    let s = String(expr).replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, function (id) {
      return flat[id] != null ? String(flat[id]) : '0';
    });
    if (!/^[\d\s+\-*/().]*$/.test(s)) return NaN;
    try { return Function('"use strict";return (' + s + ')')(); } catch (e) { return NaN; }
  }

  /* Compact text projection of the sheet for the LLM context. */
  function describeSheet(schema, state, name) {
    const lines = ['CHARACTER: ' + name];
    const flat = flatValues(schema, state);
    (schema.sections || []).forEach(function (sec) {
      const parts = [];
      (sec.fields || []).forEach(function (f) {
        const v = state[f.id];
        if (f.type === 'number') parts.push(f.label + ' ' + (v != null ? v : 0));
        else if (f.type === 'text') { if (v) parts.push(f.label + ': ' + v); }
        else if (f.type === 'track') parts.push(f.label + ' ' + (v ? v.current : 0) + '/' + (v ? v.max : 0));
        else if (f.type === 'list') { if (v && v.length) parts.push(f.label + ': ' + v.join(', ')); }
        else if (f.type === 'derived') parts.push(f.label + ' ' + evalExpr(f.expr, flat));
      });
      if (parts.length) lines.push(sec.title + ' — ' + parts.join(' · '));
    });
    return lines.join('\n');
  }

  /* fieldId list with paths the LLM may target in gm-sheet changes */
  function fieldPaths(schema) {
    return allFields(schema).map(function (f) {
      if (f.type === 'track') return f.id + '.current (number, max ' + (f.max || '?') + ')';
      if (f.type === 'list') return f.id + ' (list of strings)';
      if (f.type === 'derived') return null;
      return f.id + ' (' + f.type + ')';
    }).filter(Boolean);
  }

  /* Render the sheet panel. opts: {schema, state, onDiff(changes)} */
  function render(container, opts) {
    const schema = opts.schema, state = opts.state;
    container.innerHTML = '';
    const flat = flatValues(schema, state);

    (schema.sections || []).forEach(function (sec) {
      const secEl = h('section', { class: 'sheet-section' }, h('h3', null, sec.title));
      (sec.fields || []).forEach(function (f) {
        const v = state[f.id];
        const row = h('div', { class: 'sheet-field ft-' + f.type });
        const label = h('label', { class: 'sf-label' }, f.label);
        row.append(label);

        function commit(to, from) {
          if (JSON.stringify(to) === JSON.stringify(from)) return;
          opts.onDiff([{ field: f.path || f.id, from: from, to: to }]);
        }

        if (f.type === 'number') {
          const inp = h('input', { type: 'number', value: v != null ? v : 0 });
          inp.addEventListener('change', function () { commit(Number(inp.value) || 0, Number(v) || 0); });
          row.append(inp);

        } else if (f.type === 'text') {
          const inp = h('input', { type: 'text', value: v || '' });
          inp.addEventListener('change', function () { commit(inp.value, v || ''); });
          row.append(inp);

        } else if (f.type === 'track') {
          const cur = v && typeof v === 'object' ? Number(v.current) || 0 : 0;
          const max = v && typeof v === 'object' ? Number(v.max) || 0 : 0;
          const minus = h('button', { class: 'track-btn', 'aria-label': f.label + ' minus' }, '−');
          const plus = h('button', { class: 'track-btn', 'aria-label': f.label + ' plus' }, '+');
          const pips = h('span', { class: 'track-pips' });
          for (let i = 0; i < max; i++) pips.append(h('span', { class: 'pip' + (i < cur ? ' on' : '') }));
          const count = h('span', { class: 'track-count' }, cur + '/' + max);
          minus.addEventListener('click', function () {
            if (cur <= 0) return;
            opts.onDiff([{ field: f.id + '.current', from: cur, to: cur - 1 }]);
          });
          plus.addEventListener('click', function () {
            if (cur >= max) return;
            opts.onDiff([{ field: f.id + '.current', from: cur, to: cur + 1 }]);
          });
          row.append(h('span', { class: 'track-wrap' }, minus, pips, plus, count));

        } else if (f.type === 'list') {
          const items = Array.isArray(v) ? v : [];
          const ul = h('ul', { class: 'sheet-list' });
          items.forEach(function (item, i) {
            const del = h('button', { class: 'list-del', 'aria-label': 'remove ' + item }, '×');
            del.addEventListener('click', function () {
              const next = items.slice(); next.splice(i, 1);
              commit(next, items);
            });
            ul.append(h('li', null, h('span', null, item), del));
          });
          const addInp = h('input', { type: 'text', placeholder: 'Add…' });
          addInp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && addInp.value.trim()) {
              commit(items.concat([addInp.value.trim()]), items);
            }
          });
          row.append(h('div', { class: 'list-wrap' }, ul, addInp));

        } else if (f.type === 'derived') {
          row.append(h('span', { class: 'derived-val' }, String(evalExpr(f.expr, flat))));
        }
        if (f.hint) row.append(h('span', { class: 'sf-hint' }, f.hint));
        secEl.append(row);
      });
      container.append(secEl);
    });
  }

  return {
    newSheet: newSheet, applyChanges: applyChanges, describeChanges: describeChanges,
    describeSheet: describeSheet, fieldPaths: fieldPaths, flatValues: flatValues,
    render: render, getPath: getPath, allFields: allFields
  };
})();

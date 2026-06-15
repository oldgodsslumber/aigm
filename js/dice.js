/* AI GM — dice engine + roll widgets.
 * One engine interprets declarative rollDefinitions from system packs.
 * Types: sum | target-number | pool-count | 2d20.
 * Randomness via crypto.getRandomValues. Every individual die is shown. */
const Dice = (function () {

  function rollDie(sides) {
    const max = Math.floor(0xFFFFFFFF / sides) * sides;
    let v;
    do { v = crypto.getRandomValues(new Uint32Array(1))[0]; } while (v >= max);
    return (v % sides) + 1;
  }

  function num(v, fallback) { const n = Number(v); return isNaN(n) ? fallback : n; }

  /* Which editable parameters does each roll type expose? */
  function paramFields(def, data) {
    const d = data || {};
    const p = Object.assign({}, d.params || {});
    ['modifier', 'difficulty', 'count', 'target'].forEach(function (k) {
      if (d[k] != null && p[k] == null) p[k] = d[k];
    });
    const dice = def.dice || {};
    const fields = [];
    function f(key, label, val) { fields.push({ key: key, label: label, value: val }); }
    if (def.type === 'sum') {
      f('count', 'Dice', num(p.count, dice.count || 1));
      f('modifier', 'Modifier', num(p.modifier, def.modifier || 0));
    } else if (def.type === 'target-number') {
      f('modifier', 'Modifier', num(p.modifier, def.modifier || 0));
      f('difficulty', 'Difficulty', num(p.difficulty, (def.difficulty && def.difficulty.default) || def.difficulty || 12));
    } else if (def.type === 'pool-count') {
      f('count', 'Dice', num(p.count, dice.count || 2));
      if ((def.countRule || {}).mode === 'sets') f('difficulty', 'Needs', num(p.difficulty, def.difficulty || 2));
      else f('difficulty', 'Needed', num(p.difficulty, def.difficulty || 1));
    } else if (def.type === '2d20') {
      f('count', 'Dice', Math.min(5, Math.max(1, num(p.count, dice.count || 2))));
      f('target', 'Target', num(p.target, def.target || 10));
      f('difficulty', 'Difficulty', num(p.difficulty, def.difficulty || 1));
    }
    return fields;
  }

  function execute(def, params) {
    const dice = def.dice || {};
    const sides = num(dice.sides, 6);
    const r = { type: def.type, rollId: def.id, dice: [], outcome: 'neutral', text: '' };

    if (def.type === 'sum') {
      const count = Math.max(1, num(params.count, dice.count || 1));
      const mod = num(params.modifier, 0);
      let total = mod;
      for (let i = 0; i < count; i++) { const v = rollDie(sides); total += v; r.dice.push({ sides: sides, value: v }); }
      r.total = total;
      r.text = 'Total ' + total + (mod ? ' (' + (mod > 0 ? '+' : '') + mod + ' mod)' : '');

    } else if (def.type === 'target-number') {
      const count = Math.max(1, num(dice.count, 1));
      const mod = num(params.modifier, 0);
      const dc = num(params.difficulty, 12);
      let total = mod;
      for (let i = 0; i < count; i++) { const v = rollDie(sides); total += v; r.dice.push({ sides: sides, value: v }); }
      r.total = total; r.difficulty = dc;
      r.outcome = total >= dc ? 'success' : 'failure';
      r.text = total + ' vs ' + dc + ' — ' + (r.outcome === 'success' ? 'Success' : 'Failure');

    } else if (def.type === 'pool-count') {
      const count = Math.max(1, num(params.count, dice.count || 2));
      const rule = def.countRule || { mode: 'threshold', min: 5 };
      for (let i = 0; i < count; i++) r.dice.push({ sides: sides, value: rollDie(sides) });
      if (rule.mode === 'sets') {
        const groups = {};
        r.dice.forEach(function (d) { groups[d.value] = (groups[d.value] || 0) + 1; });
        const names = def.setNames || { '2': 'Pair', '3': 'Triple', '4': 'Four of a kind', '5': 'Five of a kind', '6': 'Six of a kind' };
        r.sets = Object.keys(groups)
          .filter(function (v) { return groups[v] >= 2; })
          .map(function (v) { return { value: Number(v), size: groups[v], name: names[String(groups[v])] || groups[v] + ' of a kind' }; })
          .sort(function (a, b) { return b.size - a.size || b.value - a.value; });
        r.dice.forEach(function (d) { if (groups[d.value] >= 2) d.hot = true; });
        /* required match size: 2 = pair, 3 = three of a kind, etc. A larger set
           also satisfies a smaller requirement. difficulty 0/1 means "any set". */
        const required = Math.max(1, num(params.difficulty, def.difficulty || 1));
        const best = r.sets.length ? r.sets[0].size : 0;
        r.required = required; r.best = best;
        r.outcome = best >= required ? 'success' : 'failure';
        const reqName = names[String(required)] || (required + ' of a kind');
        const got = r.sets.map(function (s) { return s.name + ' (' + s.size + '\u00d7' + s.value + ')'; }).join(', ');
        if (required <= 1) {
          r.text = r.sets.length ? got : 'No matches';
        } else if (r.sets.length) {
          r.text = got + ' \u2014 ' + (r.outcome === 'success' ? 'beats ' + reqName : 'needed ' + reqName);
        } else {
          r.text = 'No matches \u2014 needed ' + reqName;
        }
      } else {
        const min = num(rule.min, 5);
        const need = Math.max(1, num(params.difficulty, 1));
        let hits = 0;
        r.dice.forEach(function (d) { if (d.value >= min) { hits++; d.hot = true; } });
        r.successes = hits; r.difficulty = need;
        r.outcome = hits >= need ? 'success' : 'failure';
        r.text = hits + (hits === 1 ? ' success' : ' successes') + ' (needed ' + need + ') — ' + (r.outcome === 'success' ? 'Success' : 'Failure');
      }

    } else if (def.type === '2d20') {
      const count = Math.min(5, Math.max(1, num(params.count, dice.count || 2)));
      const target = num(params.target, def.target || 10);
      const need = Math.max(0, num(params.difficulty, def.difficulty || 1));
      const critUnder = num(def.critUnder, 1);
      const compFrom = num(def.complicationFrom, 20);
      let hits = 0, comps = 0;
      for (let i = 0; i < count; i++) {
        const v = rollDie(20);
        const d = { sides: 20, value: v };
        if (v <= target) { hits += 1; d.hot = true; }
        if (v <= critUnder) { hits += 1; d.crit = true; }
        if (v >= compFrom) { comps += 1; d.comp = true; }
        r.dice.push(d);
      }
      r.successes = hits; r.complications = comps; r.difficulty = need; r.target = target;
      r.outcome = hits >= need ? 'success' : 'failure';
      r.text = hits + (hits === 1 ? ' success' : ' successes') + ' vs Difficulty ' + need +
        ' — ' + (r.outcome === 'success' ? 'Success' : 'Failure') +
        (comps ? ' · ' + comps + ' complication' + (comps > 1 ? 's' : '') : '');
    }
    return r;
  }

  function dieEl(sides) {
    const el = h('span', { class: 'die rolling d' + sides }, h('span', { class: 'die-face' }, '?'));
    return el;
  }

  function settleDie(el, d) {
    el.classList.remove('rolling');
    if (d.hot) el.classList.add('hot');
    if (d.crit) el.classList.add('crit');
    if (d.comp) el.classList.add('comp');
    el.querySelector('.die-face').textContent = d.value;
  }

  /* Quick 2D flip: faces cycle randomly, then settle one by one. */
  function animate(els, result, onDone) {
    const t0 = performance.now();
    const tick = setInterval(function () {
      els.forEach(function (el, i) {
        if (el.classList.contains('rolling')) {
          el.querySelector('.die-face').textContent = rollDie(result.dice[i].sides);
        }
      });
    }, 70);
    els.forEach(function (el, i) {
      setTimeout(function () { settleDie(el, result.dice[i]); }, 420 + i * 110);
    });
    setTimeout(function () {
      clearInterval(tick);
      onDone();
    }, 420 + els.length * 110 + 180);
  }

  /* Inline chat widget. opts: {def, data, result, onRoll(result)} */
  function widget(opts) {
    const def = opts.def;
    const root = h('div', { class: 'roll-widget' + (opts.result ? ' resolved ' + opts.result.outcome : '') });
    const head = h('div', { class: 'roll-head' },
      h('span', { class: 'roll-label' }, def ? def.label || def.id : (opts.data.roll || 'Roll')),
      opts.data && opts.data.character ? h('span', { class: 'roll-char' }, opts.data.character) : null
    );
    root.append(head);
    if (opts.data && opts.data.reason) root.append(h('div', { class: 'roll-reason' }, opts.data.reason));

    if (!def) {
      root.append(h('div', { class: 'roll-error' }, 'Unknown roll "' + esc(opts.data.roll) + '" — not in this system pack.'));
      return root;
    }

    const diceRow = h('div', { class: 'dice-row' });
    const outLine = h('div', { class: 'roll-outcome' });
    root.append(diceRow, outLine);

    if (opts.result) {
      opts.result.dice.forEach(function (d) {
        const el = dieEl(d.sides); settleDie(el, d); diceRow.append(el);
      });
      outLine.textContent = opts.result.text;
      return root;
    }

    const fields = paramFields(def, opts.data);
    const inputs = {};
    const paramRow = h('div', { class: 'roll-params' });
    fields.forEach(function (f) {
      const inp = h('input', { type: 'number', value: f.value, 'aria-label': f.label });
      inputs[f.key] = inp;
      paramRow.append(h('label', { class: 'roll-param' }, h('span', null, f.label), inp));
    });
    const btn = h('button', { class: 'btn accent roll-btn' }, 'Roll');
    paramRow.append(btn);
    root.insertBefore(paramRow, diceRow);

    btn.addEventListener('click', function () {
      const params = {};
      for (const k in inputs) params[k] = Number(inputs[k].value);
      const result = execute(def, params);
      btn.disabled = true;
      Object.values(inputs).forEach(function (i) { i.disabled = true; });
      const els = result.dice.map(function () { return dieEl(result.dice[0].sides); });
      result.dice.forEach(function (d, i) { els[i].className = 'die rolling d' + d.sides; });
      diceRow.innerHTML = '';
      els.forEach(function (el) { diceRow.append(el); });
      animate(els, result, function () {
        outLine.textContent = result.text;
        root.classList.add('resolved', result.outcome);
        paramRow.remove();
        if (opts.onRoll) opts.onRoll(result);
      });
    });
    return root;
  }

  return { execute: execute, widget: widget, paramFields: paramFields, rollDie: rollDie };
})();

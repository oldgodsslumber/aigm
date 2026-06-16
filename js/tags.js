/* AI GM — tag protocol parser.
 * The GM embeds fenced blocks like:
 *   ```gm-roll
 *   {"roll":"check", ...}
 *   ```
 * parse() splits reply text into segments (text | block) and collects
 * well-formed blocks. Malformed JSON degrades to plain text and logs
 * to the console — never crashes the turn. */
const Tags = (function () {
  const FENCE = /```(gm-[a-z]+)[ \t]*\r?\n([\s\S]*?)```/g;
  const KNOWN = ['gm-roll', 'gm-sheet', 'gm-wiki', 'gm-lookup', 'gm-scene'];

  function parse(text) {
    const segments = [];
    const blocks = [];
    let last = 0, m;
    FENCE.lastIndex = 0;
    while ((m = FENCE.exec(text)) !== null) {
      if (m.index > last) segments.push({ type: 'text', text: text.slice(last, m.index) });
      const tag = m[1];
      let data = null, ok = false;
      if (KNOWN.indexOf(tag) >= 0) {
        try { data = JSON.parse(m[2]); ok = true; }
        catch (e) { console.warn('[AI GM] malformed ' + tag + ' block:', e.message, m[2]); }
      } else {
        console.warn('[AI GM] unknown tag:', tag);
      }
      if (ok) {
        const block = { tag: tag, data: data, raw: m[0], index: blocks.length };
        blocks.push(block);
        segments.push({ type: 'block', block: block });
      } else {
        segments.push({ type: 'text', text: m[0] });
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) segments.push({ type: 'text', text: text.slice(last) });
    return { segments: segments, blocks: blocks };
  }

  function fence(name, obj) {
    return '```' + name + '\n' + JSON.stringify(obj, null, 1) + '\n```';
  }

  return { parse: parse, fence: fence };
})();

/* AI GM — shell: router, modal, toast, boot. */
const BUILD = '20260618g';

const Modal = (function () {
  let root = null;
  function open(content) {
    close();
    root = h('div', { class: 'modal-overlay' }, h('div', { class: 'modal-box' }, content));
    root.addEventListener('mousedown', function (e) { if (e.target === root) close(); });
    document.getElementById('modal-root').append(root);
    document.addEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function close() {
    if (root) { root.remove(); root = null; }
    document.removeEventListener('keydown', onKey);
  }
  return { open: open, close: close };
})();

function Toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(Toast._t);
  Toast._t = setTimeout(function () { t.classList.remove('show'); }, 3200);
}

/* ---------- router ---------- */
const Router = (function () {
  function parse() {
    const hash = location.hash.replace(/^#\/?/, '') || 'campaigns';
    const parts = hash.split('/');
    return { view: parts[0], id: parts[1] || null };
  }

  function renderNav(route) {
    const ctx = document.getElementById('ctx-nav');
    const global = document.getElementById('global-nav');
    ctx.innerHTML = '';
    if (route.id && ['play', 'wiki', 'journal'].indexOf(route.view) >= 0) {
      [['play', 'Play'], ['wiki', 'Wiki'], ['journal', 'Journal']].forEach(function (pair) {
        ctx.append(h('a', {
          class: 'nav-link' + (route.view === pair[0] ? ' on' : ''),
          href: '#/' + pair[0] + '/' + route.id
        }, pair[1]));
      });
    }
    /* "Campaigns" deep-links to the last campaign you were in, so leaving for
     * Settings and clicking it again drops you back where you were rather than
     * at the list. (The ❧ brand logo still goes to the full list.) */
    const campLink = global.querySelector('a[data-nav="campaigns"]');
    if (campLink) {
      const lastId = Store.lastCampaignId();
      campLink.setAttribute('href', lastId ? '#/play/' + lastId : '#/campaigns');
    }
    const inCampaign = ['play', 'wiki', 'journal'].indexOf(route.view) >= 0;
    global.querySelectorAll('a').forEach(function (a) {
      const on = a.getAttribute('data-nav') === 'campaigns'
        ? (route.view === 'campaigns' || inCampaign)
        : a.getAttribute('href') === '#/' + route.view;
      a.classList.toggle('on', on);
    });
  }

  async function go() {
    const route = parse();
    const root = document.getElementById('view');
    renderNav(route);
    try {
      if (route.view === 'play' && route.id) await Views.play(root, route.id);
      else if (route.view === 'wiki' && route.id) await Views.wiki(root, route.id);
      else if (route.view === 'journal' && route.id) await Views.journal(root, route.id);
      else if (route.view === 'characters') await Views.characters(root);
      else if (route.view === 'new') await Views.campaigns(root, route.id); /* start a new story, optionally with a preset character */
      else if (route.view === 'settings') await Views.settings(root);
      else await Views.campaigns(root);
    } catch (e) {
      console.error(e);
      root.innerHTML = '';
      root.append(h('div', { class: 'page narrow' },
        h('div', { class: 'empty-state' },
          h('p', { class: 'empty-title' }, 'Something went wrong.'),
          h('p', null, e.message),
          h('a', { class: 'btn', href: '#/campaigns' }, 'Back to campaigns'))));
    }
  }
  return { go: go };
})();

/* ---------- boot ---------- */
(async function boot() {
  console.log('%c[AI GM] build ' + BUILD + ' — reading-mode scroll-to-top of new replies', 'color:#9cc29c');
  const bt = document.getElementById('build-tag');
  if (bt) bt.textContent = 'build ' + BUILD;
  Store.init();

  window.addEventListener('hashchange', function () { Router.go(); });

  if (!Store.profile()) {
    const nameInp = h('input', { type: 'text', placeholder: 'Your name', autocomplete: 'off' });
    const start = h('button', { class: 'btn accent' }, 'Enter');
    start.addEventListener('click', async function () {
      const name = nameInp.value.trim();
      if (!name) return;
      await Store.setProfile({ name: name });
      Modal.close();
      Router.go();
    });
    nameInp.addEventListener('keydown', function (e) { if (e.key === 'Enter') start.click(); });
    Modal.open(h('div', null,
      h('h2', null, 'Welcome to AI GM'),
      h('p', null, 'A solo tabletop RPG, run by an AI Game Master that remembers your campaign — every NPC, every scene, every thread.'),
      h('p', { class: 'card-sub' }, 'Everything is stored in this browser for now. Google sign-in arrives when Firebase is wired up; this name just labels your campaigns.'),
      h('label', { class: 'form-row' }, h('span', null, 'Name'), nameInp),
      h('div', { class: 'modal-actions' }, start)));
    setTimeout(function () { nameInp.focus(); }, 50);
  }

  Router.go();
})();

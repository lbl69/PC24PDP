// PC-24 PDP — révision personnelle. Aucune dépendance, aucun build.
// Le contenu vit dans content/*.json ; un pack importé (Réglages) le remplace,
// stocké uniquement sur l'appareil.

const MODULES = ['normal', 'abnormal', 'systems', 'quiz', 'limitations', 'cockpit'];
const app = document.getElementById('app');

// ---------- Stockage local (peut être indisponible : navigation privée…) ----------

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('pc24:' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('pc24:' + key, JSON.stringify(value)); return true; }
    catch { return false; }
  },
  del(key) {
    try { localStorage.removeItem('pc24:' + key); } catch { /* rien */ }
  },
};

// ---------- Images cockpit (IndexedDB : trop lourdes pour localStorage) ----------

const images = {
  db: null,
  open() {
    if (this.db) return this.db;
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open('pc24', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('images');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  },
  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const t = db.transaction('images', mode);
      const r = fn(t.objectStore('images'));
      t.oncomplete = () => resolve(r?.result);
      t.onerror = () => reject(t.error);
    });
  },
  get(key) { return this.tx('readonly', (st) => st.get(key)).catch(() => undefined); },
  keys() { return this.tx('readonly', (st) => st.getAllKeys()).catch(() => []); },
  putAll(map) { return this.tx('readwrite', (st) => { for (const [k, v] of Object.entries(map)) st.put(v, k); }); },
  clear() { return this.tx('readwrite', (st) => st.clear()); },
};

// ---------- Contenu ----------

let C = {};

async function loadContent() {
  const custom = store.get('content', null);
  const out = {};
  for (const m of MODULES) {
    if (custom && custom[m]) { out[m] = custom[m]; continue; }
    const res = await fetch(`content/${m}.json`);
    out[m] = await res.json();
  }
  C = out;
  const names = { normal: 'normales', abnormal: 'anormales', systems: 'systèmes', quiz: 'quiz', limitations: 'limitations', cockpit: 'cockpit' };
  const samples = MODULES.filter((m) => C[m]?._meta?.sample).map((m) => names[m]);
  const banner = document.getElementById('sample-banner');
  banner.hidden = !samples.length;
  banner.textContent = `Contenu d'exemple, non conforme à l'AFM : ${samples.join(', ')}. Importe ton propre contenu dans ⚙︎ Réglages.`;
}

function validatePack(pack) {
  if (!pack || typeof pack !== 'object') return 'Le fichier n\'est pas un objet JSON.';
  const found = MODULES.filter((m) => pack[m]);
  if (!found.length && !pack.images) return `Aucun module reconnu. Clés attendues : ${MODULES.join(', ')}, images.`;
  if (pack.images && (typeof pack.images !== 'object' || Object.values(pack.images).some((v) => !String(v).startsWith('data:image/')))) {
    return 'images doit associer chaque vue à une image data:image/….';
  }
  if (pack.cockpit && !Array.isArray(pack.cockpit.views)) return 'cockpit.views doit être une liste.';
  if (pack.normal && !Array.isArray(pack.normal.phases)) return 'normal.phases doit être une liste.';
  if (pack.abnormal && !Array.isArray(pack.abnormal.procedures)) return 'abnormal.procedures doit être une liste.';
  if (pack.systems && !Array.isArray(pack.systems.chapters)) return 'systems.chapters doit être une liste.';
  if (pack.quiz && !Array.isArray(pack.quiz.questions)) return 'quiz.questions doit être une liste.';
  if (pack.limitations && !Array.isArray(pack.limitations.groups)) return 'limitations.groups doit être une liste.';
  return null;
}

// ---------- Utilitaires ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

// Markdown minimal : paragraphes, listes « - », **gras**.
function md(text) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return String(text ?? '').split(/\n{2,}/).map((block) => {
    const lines = block.split('\n');
    if (lines.every((l) => /^\s*-\s+/.test(l))) {
      return '<ul>' + lines.map((l) => `<li${/^\s{2,}/.test(l) ? ' class="sub"' : ''}>${inline(l.replace(/^\s*-\s+/, ''))}</li>`).join('') + '</ul>';
    }
    if (/^\d+\.\s/.test(lines[0]) && lines.every((l) => /^(\d+\.|\s+-)\s/.test(l))) {
      return '<ol class="mix">' + lines.map((l) => (/^\s/.test(l)
        ? `<li class="sub">${inline(l.replace(/^\s*-\s+/, ''))}</li>`
        : `<li><b>${l.match(/^\d+/)[0]}.</b> ${inline(l.replace(/^\d+\.\s+/, ''))}</li>`)).join('') + '</ol>';
    }
    if (lines.every((l) => /^###\s+/.test(l))) return `<h4>${inline(lines.join(' ').replace(/^###\s+/, ''))}</h4>`;
    if (lines.every((l) => /^>\s?/.test(l))) return `<p class="fig">${lines.map((l) => inline(l.replace(/^>\s?/, ''))).join('<br>')}</p>`;
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function render(html) {
  app.innerHTML = html;
  window.scrollTo(0, 0);
}

function crumbs(...parts) {
  return `<p class="small muted">${parts.map(([href, label]) => (
    href ? `<a href="${href}">${esc(label)}</a>` : esc(label)
  )).join(' › ')}</p>`;
}

// ---------- Étapes de procédure ----------
// Types : {c, r} challenge/réponse · {t} texte · {if, then:[…]} condition
//         {note} · {caution} · {warning}

function stepsHtml(steps, cls = '') {
  let html = `<ul class="checklist ${cls}">`;
  for (const s of steps || []) {
    if (s.c !== undefined) {
      html += `<li data-step><span class="c">${esc(s.c)}</span><span class="lead"></span><span class="r">${esc(s.r)}</span></li>`;
    } else if (s.t !== undefined) {
      html += `<li class="text" data-step>${esc(s.t)}</li>`;
    } else if (s.if !== undefined) {
      html += `</ul><div class="cond"><div class="if">${esc(s.if)}</div>${stepsHtml(s.then, cls)}</div><ul class="checklist ${cls}">`;
    } else if (s.note) {
      html += `</ul><div class="note">${esc(s.note)}</div><ul class="checklist ${cls}">`;
    } else if (s.caution) {
      html += `</ul><div class="caution">${esc(s.caution)}</div><ul class="checklist ${cls}">`;
    } else if (s.warning) {
      html += `</ul><div class="warning">${esc(s.warning)}</div><ul class="checklist ${cls}">`;
    }
  }
  html += '</ul>';
  return html.replace(/<ul class="checklist[^"]*"><\/ul>/g, '');
}

// Coche au toucher ; en mode révision, le 1er toucher révèle, le 2e coche.
function bindChecklists(root, onChange) {
  root.querySelectorAll('.checklist li[data-step]:not(.text)').forEach((li) => {
    li.addEventListener('click', () => {
      const study = li.closest('.checklist').classList.contains('study');
      if (study && !li.classList.contains('revealed')) li.classList.add('revealed');
      else li.classList.toggle('done');
      onChange?.();
    });
  });
}

// ---------- Accueil ----------

function viewHome() {
  const n = C.normal.phases.length;
  const a = C.abnormal.procedures.length;
  const s = C.systems.chapters.length;
  const q = C.quiz.questions.length;
  const l = C.limitations.groups.reduce((t, g) => t + g.items.length, 0);
  const box = store.get('leitner', {});
  const limIds = allLimitCards().map((c) => c.id);
  const mastered = limIds.filter((id) => (box[id] || 0) >= 4).length;
  const pct = limIds.length ? Math.round((mastered / limIds.length) * 100) : 0;

  render(`
    <h1>PC-24 PDP</h1>
    <input class="search" type="search" placeholder="Rechercher (procédure, CAS, système, limitation…)" id="q" autocomplete="off">
    <div class="grid">
      <a class="tile" href="#/normal"><strong>Procédures normales</strong><span class="muted">${n} phases</span></a>
      <a class="tile" href="#/abn"><strong>Anormales & urgences</strong><span class="muted">${a} procédures</span></a>
      <a class="tile" href="#/sys"><strong>Systèmes</strong><span class="muted">${s} chapitres · ${q} questions</span></a>
      <a class="tile" href="#/cockpit"><strong>Cockpit interactif</strong><span class="muted">${C.cockpit.views.length} vues · ${cockpitTargets().length} commandes</span></a>
      <a class="tile" href="#/lim"><strong>Limitations & chiffres</strong><span class="muted">${l} valeurs</span>
        <div class="progress" title="${mastered}/${limIds.length} maîtrisées"><span style="width:${pct}%"></span></div></a>
    </div>
    <h2>Entraînement</h2>
    <div class="grid">
      <a class="tile" href="#/drill/memory"><strong>Memory items</strong><span class="muted">Récite, puis vérifie</span></a>
      <a class="tile" href="#/drill/lim"><strong>Flashcards limitations</strong><span class="muted">${mastered}/${limIds.length} maîtrisées</span></a>
      <a class="tile" href="#/quiz/all"><strong>Quiz général</strong><span class="muted">${q} questions mélangées</span></a>
      <a class="tile" href="#/quiz/errors"><strong>Revoir mes erreurs</strong><span class="muted">${store.get('wrong', []).length} question(s)</span></a>
    </div>
  `);
  const q$ = document.getElementById('q');
  q$.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && q$.value.trim()) location.hash = '#/search/' + encodeURIComponent(q$.value.trim());
  });
}

// ---------- Recherche ----------

function viewSearch(query) {
  const q = norm(query);
  const hits = [];
  const hit = (text) => norm(text).includes(q);

  for (const p of C.normal.phases) {
    if (hit(p.title)) hits.push(['Normales', p.title, `#/normal/${p.id}`]);
    for (const s of flatSteps(p.items)) {
      if (hit(s.c) || hit(s.r) || hit(s.t)) hits.push(['Normales', `${p.title} — ${s.c ?? s.t}`, `#/normal/${p.id}`]);
    }
  }
  for (const p of C.abnormal.procedures) {
    if (hit(p.title) || hit(p.cas) || hit(p.category)) hits.push(['Anormales', p.title, `#/abn/${p.id}`]);
  }
  for (const ch of C.systems.chapters) {
    if (hit(ch.summary)) hits.push(['Systèmes', `${ch.title} — L'essentiel`, `#/sys/${ch.id}`]);
    ch.sections.forEach((sec, i) => {
      if (hit(sec.title) || hit(sec.body)) hits.push(['Systèmes', `${ch.title} — ${sec.title}`, `#/sys/${ch.id}/${i}`]);
    });
  }
  for (const v of C.cockpit.views) {
    for (const h of v.hotspots) {
      if (!h.go && (hit(h.label) || hit(h.info))) hits.push(['Cockpit', `${v.title} — ${h.label}`, `#/cockpit/${v.id}/${h.id}`]);
    }
  }
  for (const g of C.limitations.groups) {
    for (const it of g.items) {
      if (hit(it.label) || hit(it.value)) hits.push(['Limitations', `${it.label} : ${it.value}`, '#/lim']);
    }
  }
  const seen = new Set();
  const uniq = hits.filter(([, label, href]) => !seen.has(label + href) && seen.add(label + href));

  render(`
    ${crumbs(['#/', 'Accueil'], [null, 'Recherche'])}
    <input class="search" type="search" id="q" value="${esc(query)}" autocomplete="off">
    <p class="muted">${uniq.length} résultat(s)</p>
    <ul class="list card">${uniq.map(([mod, label, href]) => (
      `<li><a href="${href}"><span class="small muted" style="min-width:90px">${esc(mod)}</span>${esc(label)}</a></li>`
    )).join('') || '<li class="row muted">Rien trouvé.</li>'}</ul>
  `);
  const q$ = document.getElementById('q');
  q$.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && q$.value.trim()) location.hash = '#/search/' + encodeURIComponent(q$.value.trim());
  });
}

function flatSteps(steps) {
  return (steps || []).flatMap((s) => (s.if !== undefined ? flatSteps(s.then) : [s]));
}

// ---------- Procédures normales ----------

function viewNormalList() {
  render(`
    ${crumbs(['#/', 'Accueil'], [null, 'Procédures normales'])}
    <h1>Procédures normales</h1>
    <ul class="list card">${C.normal.phases.map((p) => (
      `<li><a href="#/normal/${esc(p.id)}">${esc(p.title)}<span class="small muted">${flatSteps(p.items).filter((s) => s.c !== undefined).length} items</span></a></li>`
    )).join('')}</ul>
  `);
}

function viewNormal(id) {
  const phases = C.normal.phases;
  const i = phases.findIndex((p) => p.id === id);
  if (i < 0) return viewNotFound();
  const p = phases[i];
  const prev = phases[i - 1];
  const next = phases[i + 1];

  render(`
    ${crumbs(['#/', 'Accueil'], ['#/normal', 'Normales'], [null, p.title])}
    <h1>${esc(p.title)}</h1>
    ${p.intro ? `<p class="muted">${esc(p.intro)}</p>` : ''}
    <div class="btns">
      <button class="btn" id="study" aria-pressed="false">Mode révision</button>
      <button class="btn" id="reset">Réinitialiser</button>
    </div>
    <div class="card" id="cl">${stepsHtml(p.items)}</div>
    <div class="btns" style="justify-content:space-between">
      ${prev ? `<a class="btn" href="#/normal/${esc(prev.id)}">‹ ${esc(prev.title)}</a>` : '<span></span>'}
      ${next ? `<a class="btn primary" href="#/normal/${esc(next.id)}">${esc(next.title)} ›</a>` : ''}
    </div>
  `);
  setupStudyToggle();
}

function setupStudyToggle() {
  const cl = document.getElementById('cl');
  bindChecklists(cl);
  const study = document.getElementById('study');
  const apply = (on) => {
    study.setAttribute('aria-pressed', String(on));
    cl.querySelectorAll('.checklist').forEach((ul) => ul.classList.toggle('study', on));
    cl.querySelectorAll('li').forEach((li) => li.classList.remove('revealed'));
  };
  apply(store.get('studyMode', false));
  study.addEventListener('click', () => {
    const on = study.getAttribute('aria-pressed') !== 'true';
    store.set('studyMode', on);
    apply(on);
  });
  document.getElementById('reset').addEventListener('click', () => {
    cl.querySelectorAll('li').forEach((li) => li.classList.remove('done', 'revealed'));
  });
}

// ---------- Procédures anormales ----------

let abnFilter = 'Toutes';

function viewAbnList() {
  const cats = ['Toutes', ...new Set(C.abnormal.procedures.map((p) => p.category))];
  const draw = (q = '') => {
    const list = C.abnormal.procedures
      .filter((p) => abnFilter === 'Toutes' || p.category === abnFilter)
      .filter((p) => !q || norm(p.title + ' ' + (p.cas || '')).includes(norm(q)))
      .sort((a, b) => (a.type === b.type ? a.title.localeCompare(b.title, 'fr') : a.type === 'emergency' ? -1 : 1));
    document.getElementById('procs').innerHTML = list.map((p) => (
      `<li><a href="#/abn/${esc(p.id)}"><span class="tag ${esc(p.type)}"></span>
        <span>${esc(p.title)}${p.cas ? `<br><span class="cas ${esc(p.type)}">${esc(p.cas)}</span>` : ''}</span>
        ${p.memory?.length ? '<span class="small" style="color:var(--danger);font-weight:700;margin-left:auto">MÉMO</span>' : ''}</a></li>`
    )).join('') || '<li class="row muted">Aucune procédure.</li>';
  };

  render(`
    ${crumbs(['#/', 'Accueil'], [null, 'Anormales & urgences'])}
    <h1>Anormales & urgences</h1>
    <input class="search" type="search" id="q" placeholder="Filtrer par titre ou message CAS" autocomplete="off">
    <div class="chips">${cats.map((c) => (
      `<button class="chip" data-cat="${esc(c)}" aria-pressed="${c === abnFilter}">${esc(c)}</button>`
    )).join('')}</div>
    <p class="small muted"><span class="tag emergency"></span> Urgence &nbsp; <span class="tag abnormal"></span> Anormale</p>
    <ul class="list card" id="procs"></ul>
  `);
  const q$ = document.getElementById('q');
  q$.addEventListener('input', () => draw(q$.value));
  app.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
    abnFilter = b.dataset.cat;
    app.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw(q$.value);
  }));
  draw();
}

function viewAbn(id) {
  const p = C.abnormal.procedures.find((x) => x.id === id);
  if (!p) return viewNotFound();
  render(`
    ${crumbs(['#/', 'Accueil'], ['#/abn', 'Anormales'], [null, p.title])}
    <h1>${esc(p.title)}</h1>
    ${p.cas ? `<p><span class="cas ${esc(p.type)}">${esc(p.cas)}</span></p>` : ''}
    ${p.condition ? `<p class="muted">${esc(p.condition)}</p>` : ''}
    <div class="btns">
      <button class="btn" id="study" aria-pressed="false">Mode révision</button>
      <button class="btn" id="reset">Réinitialiser</button>
    </div>
    <div id="cl">
      ${p.memory?.length ? `<div class="memory"><div class="label">MEMORY ITEMS</div>${stepsHtml(p.memory)}</div>` : ''}
      ${p.steps?.length ? `<div class="card">${stepsHtml(p.steps)}</div>` : ''}
    </div>
    ${p.ref ? `<p class="small muted">Réf. : ${esc(p.ref)}</p>` : ''}
  `);
  setupStudyToggle();
}

// ---------- Systèmes ----------

function viewSysList() {
  const best = store.get('best', {});
  render(`
    ${crumbs(['#/', 'Accueil'], [null, 'Systèmes'])}
    <h1>Systèmes</h1>
    <ul class="list card">${C.systems.chapters.map((ch) => {
      const n = C.quiz.questions.filter((q) => q.chapter === ch.id).length;
      const b = best[ch.id];
      return `<li><a href="#/sys/${esc(ch.id)}">${esc(ch.title)}<span class="small muted">${n} question(s)${b !== undefined ? ` · meilleur ${b}%` : ''}</span></a></li>`;
    }).join('')}</ul>
  `);
}

function viewSys(id, focus) {
  const ch = C.systems.chapters.find((x) => x.id === id);
  if (!ch) return viewNotFound();
  const n = C.quiz.questions.filter((q) => q.chapter === ch.id).length;
  render(`
    ${crumbs(['#/', 'Accueil'], ['#/sys', 'Systèmes'], [null, ch.title])}
    <h1>${esc(ch.title)}</h1>
    ${n ? `<div class="btns"><a class="btn primary" href="#/quiz/${esc(ch.id)}">Quiz : ${n} question(s)</a></div>` : ''}
    ${ch.summary ? `<div class="card prose essentiel"><h3>L'essentiel</h3>${md(ch.summary)}</div>` : ''}
    ${ch.source ? `<h2>${esc(ch.source)}</h2>` : ''}
    ${ch.sections.map((s, i) => {
      // Chapitres longs (manuel) : sections repliables ; contenu court : cartes ouvertes.
      const body = `${s.pages ? `<p class="small muted">Pages ${esc(s.pages)}</p>` : ''}${md(s.body)}`;
      return ch.summary || ch.sections.length > 6
        ? `<details class="card prose sec" id="s${i}"><summary>${esc(s.title)}</summary>${body}</details>`
        : `<div class="card prose"><h3>${esc(s.title)}</h3>${body}</div>`;
    }).join('')}
  `);
  if (focus) {
    const el = document.getElementById('s' + focus);
    if (el) { el.open = true; el.scrollIntoView(); }
  }
}

// ---------- Quiz ----------

function viewQuiz(scope) {
  let pool;
  let title;
  if (scope === 'all') {
    pool = C.quiz.questions;
    title = 'Quiz général';
  } else if (scope === 'errors') {
    const wrong = new Set(store.get('wrong', []));
    pool = C.quiz.questions.filter((q) => wrong.has(q.id));
    title = 'Revoir mes erreurs';
  } else {
    pool = C.quiz.questions.filter((q) => q.chapter === scope);
    title = 'Quiz : ' + (C.systems.chapters.find((c) => c.id === scope)?.title ?? scope);
  }
  if (!pool.length) {
    return render(`${crumbs(['#/', 'Accueil'], [null, title])}<h1>${esc(title)}</h1>
      <div class="card muted">Aucune question ici${scope === 'errors' ? ' : pas d\'erreur à revoir 👍' : '.'}</div>`);
  }

  const qs = shuffle(pool);
  let i = 0;
  let good = 0;

  const step = () => {
    if (i >= qs.length) return finish();
    const q = qs[i];
    // Mélange les choix en gardant la trace de la bonne réponse.
    const order = shuffle(q.choices.map((_, k) => k));
    render(`
      ${crumbs(['#/', 'Accueil'], [null, title])}
      <p class="small muted">Question ${i + 1} / ${qs.length} · ${good} bonne(s)</p>
      <div class="card">
        <div style="font-weight:600">${esc(q.q)}</div>
        <div class="choices">${order.map((k) => `<button class="choice" data-k="${k}">${esc(q.choices[k])}</button>`).join('')}</div>
        <div id="explain"></div>
      </div>
    `);
    app.querySelectorAll('.choice').forEach((b) => b.addEventListener('click', () => {
      const k = Number(b.dataset.k);
      const ok = k === q.answer;
      if (ok) good++;
      const wrong = new Set(store.get('wrong', []));
      if (ok) wrong.delete(q.id); else wrong.add(q.id);
      store.set('wrong', [...wrong]);
      app.querySelectorAll('.choice').forEach((x) => {
        x.disabled = true;
        if (Number(x.dataset.k) === q.answer) x.classList.add('right');
      });
      if (!ok) b.classList.add('wrong');
      document.getElementById('explain').innerHTML = `
        ${q.explain ? `<div class="note" style="margin-top:12px">${esc(q.explain)}</div>` : ''}
        <div class="btns"><button class="btn primary" id="next">${i + 1 < qs.length ? 'Suivante' : 'Résultat'}</button></div>`;
      document.getElementById('next').addEventListener('click', () => { i++; step(); });
    }));
  };

  const finish = () => {
    const pct = Math.round((good / qs.length) * 100);
    if (scope !== 'errors') {
      const best = store.get('best', {});
      best[scope] = Math.max(best[scope] ?? 0, pct);
      store.set('best', best);
    }
    render(`
      ${crumbs(['#/', 'Accueil'], [null, title])}
      <div class="card" style="text-align:center">
        <div class="score">${pct}%</div>
        <p>${good} / ${qs.length} bonnes réponses</p>
        <div class="btns" style="justify-content:center">
          <button class="btn primary" id="again">Recommencer</button>
          <a class="btn" href="#/quiz/errors">Revoir mes erreurs</a>
        </div>
      </div>
    `);
    document.getElementById('again').addEventListener('click', () => viewQuiz(scope));
  };

  step();
}

// ---------- Limitations ----------

function allLimitCards() {
  return C.limitations.groups.flatMap((g) => g.items.map((it) => ({
    id: 'lim:' + g.title + '/' + it.label,
    front: it.label,
    back: it.value,
    sub: g.title,
  })));
}

function viewLim() {
  render(`
    ${crumbs(['#/', 'Accueil'], [null, 'Limitations & chiffres'])}
    <h1>Limitations & chiffres</h1>
    <div class="btns">
      <button class="btn" id="study" aria-pressed="false">Masquer les valeurs</button>
      <a class="btn primary" href="#/drill/lim">Flashcards</a>
    </div>
    <div id="lims">${C.limitations.groups.map((g) => `
      <h2>${esc(g.title)}</h2>
      <div class="card"><table class="limits"><tbody>${g.items.map((it) => `
        <tr><td>${esc(it.label)}${it.ref ? `<span class="ref">${esc(it.ref)}</span>` : ''}</td><td class="v">${esc(it.value)}</td></tr>
      `).join('')}</tbody></table></div>`).join('')}
    </div>
  `);
  const study = document.getElementById('study');
  const tables = app.querySelectorAll('.limits');
  study.addEventListener('click', () => {
    const on = study.getAttribute('aria-pressed') !== 'true';
    study.setAttribute('aria-pressed', String(on));
    tables.forEach((t) => t.classList.toggle('study', on));
    app.querySelectorAll('.limits tr').forEach((tr) => tr.classList.remove('revealed'));
  });
  app.querySelectorAll('.limits td.v').forEach((td) => td.addEventListener('click', () => {
    td.parentElement.classList.toggle('revealed');
  }));
}

// ---------- Flashcards (Leitner, boîtes 0 à 5) ----------

function memoryCards() {
  return C.abnormal.procedures.filter((p) => p.memory?.length).map((p) => ({
    id: 'mem:' + p.id,
    front: p.title,
    sub: p.cas || '',
    backHtml: stepsHtml(p.memory),
  }));
}

function viewDrill(deck) {
  const cards = deck === 'memory' ? memoryCards() : allLimitCards();
  const title = deck === 'memory' ? 'Memory items' : 'Flashcards limitations';
  if (!cards.length) {
    return render(`${crumbs(['#/', 'Accueil'], [null, title])}<h1>${esc(title)}</h1><div class="card muted">Aucune carte.</div>`);
  }

  // Les cartes des boîtes basses passent en premier, ordre aléatoire dans chaque boîte.
  const box = store.get('leitner', {});
  const queue = shuffle(cards).sort((a, b) => (box[a.id] || 0) - (box[b.id] || 0));
  let i = 0;
  let known = 0;

  const show = () => {
    if (i >= queue.length) {
      render(`
        ${crumbs(['#/', 'Accueil'], [null, title])}
        <div class="card" style="text-align:center">
          <div class="score">${known} / ${queue.length}</div>
          <p>cartes sues du premier coup</p>
          <div class="btns" style="justify-content:center"><button class="btn primary" id="again">Nouvelle série</button></div>
        </div>`);
      document.getElementById('again').addEventListener('click', () => viewDrill(deck));
      return;
    }
    const c = queue[i];
    const level = box[c.id] || 0;
    render(`
      ${crumbs(['#/', 'Accueil'], [null, title])}
      <p class="small muted">Carte ${i + 1} / ${queue.length} · boîte ${level}/5</p>
      <div class="card flash" id="card">
        <div class="front">${esc(c.front)}</div>
        ${c.sub ? `<div class="small muted">${esc(c.sub)}</div>` : ''}
        <div class="back" hidden>${c.backHtml ?? esc(c.back)}</div>
        <div class="hint small muted">${deck === 'memory' ? 'Récite les memory items à voix haute, puis touche' : 'Touche'} pour révéler</div>
      </div>
      <div class="btns" id="grade" hidden style="justify-content:center">
        <button class="btn danger" data-g="0">À revoir</button>
        <button class="btn primary" data-g="1">Je savais</button>
      </div>
    `);
    document.getElementById('card').addEventListener('click', () => {
      app.querySelector('.back').hidden = false;
      app.querySelector('.hint').hidden = true;
      document.getElementById('grade').hidden = false;
    });
    app.querySelectorAll('#grade .btn').forEach((b) => b.addEventListener('click', () => {
      const ok = b.dataset.g === '1';
      if (ok) known++;
      box[c.id] = ok ? Math.min(5, level + 1) : 0;
      store.set('leitner', box);
      i++;
      show();
    }));
  };
  show();
}

// ---------- Cockpit interactif ----------
// Zones en % de l'image (content/cockpit.json). Images importées à part (IndexedDB).

const cockpitTargets = (view) => (view ? [view] : C.cockpit.views).flatMap((v) => v.hotspots.filter((h) => !h.go));

let cockpitMode = 'explore';

async function viewCockpitList() {
  const keys = new Set(await images.keys());
  const best = store.get('cockpitBest', {});
  const missing = C.cockpit.views.filter((v) => !keys.has(v.image)).length;
  render(`
    ${crumbs(['#/', 'Accueil'], [null, 'Cockpit interactif'])}
    <h1>Cockpit interactif</h1>
    ${missing ? `<div class="card small"><strong>Images non importées.</strong> Les zones s'affichent sur un fond neutre.
      Importe <code>pc24-cockpit.pack.json</code> dans <a href="#/settings">⚙︎ Réglages</a> pour voir le vrai cockpit.</div>` : ''}
    <ul class="list card">${C.cockpit.views.map((v) => {
      const n = v.hotspots.filter((h) => !h.go).length;
      return `<li><a href="#/cockpit/${esc(v.id)}">${esc(v.title)}<span class="small muted">${n ? `${n} commandes` : 'navigation'}${best[v.id] !== undefined ? ` · meilleur ${best[v.id]}%` : ''}</span></a></li>`;
    }).join('')}</ul>
  `);
}

async function viewCockpit(id, focus) {
  const v = C.cockpit.views.find((x) => x.id === id);
  if (!v) return viewNotFound();
  const targets = cockpitTargets(v);
  if (!targets.length) cockpitMode = 'explore';
  const src = await images.get(v.image);
  const [aw, ah] = v.aspect || [4, 3];

  render(`
    ${crumbs(['#/', 'Accueil'], ['#/cockpit', 'Cockpit'], [null, v.title])}
    <h1>${esc(v.title)}</h1>
    ${targets.length ? `<div class="chips">${[['explore', 'Explorer'], ['find', 'Trouve la commande'], ['name', 'Identifie']].map(([m, l]) => (
      `<button class="chip" data-mode="${m}" aria-pressed="${m === cockpitMode}">${l}</button>`
    )).join('')}</div>` : ''}
    <div class="ck-stage ${src ? '' : 'noimg'}" id="stage" style="aspect-ratio:${aw}/${ah};max-width:max(320px, calc((100dvh - 210px) * ${(aw / ah).toFixed(3)}))">
      ${src ? `<img src="${src}" alt="${esc(v.title)}" draggable="false">` : ''}
      ${v.hotspots.map((h) => `<button class="ck-hs${h.go ? ' go' : ''}" data-id="${esc(h.id)}"
        style="left:${h.x}%;top:${h.y}%;width:${h.w}%;height:${h.h}%" aria-label="${esc(h.label)}"><span>${esc(h.label)}</span></button>`).join('')}
    </div>
    <div class="ck-panel" id="panel"></div>
  `);

  const stage = document.getElementById('stage');
  const panel = document.getElementById('panel');
  const hsEl = (hid) => stage.querySelector(`.ck-hs[data-id="${CSS.escape(hid)}"]`);
  const clearMarks = () => {
    stage.querySelectorAll('.ck-hs').forEach((b) => b.classList.remove('sel', 'right', 'wrong', 'ask'));
    stage.querySelectorAll('.ck-tap').forEach((d) => d.remove());
  };
  app.querySelectorAll('.chip[data-mode]').forEach((b) => b.addEventListener('click', () => {
    cockpitMode = b.dataset.mode;
    viewCockpit(id);
  }));

  // --- Explorer : toucher une zone affiche son nom et ses positions.
  if (cockpitMode === 'explore') {
    stage.classList.add('explore');
    const show = (h) => {
      clearMarks();
      hsEl(h.id).classList.add('sel');
      panel.innerHTML = `<div class="card"><strong>${esc(h.label)}</strong>${h.info ? `<div class="muted">${esc(h.info)}</div>` : ''}</div>`;
    };
    panel.innerHTML = `<p class="small muted">${src ? 'Touche une commande pour voir son nom.' : 'Touche une zone.'}
      <button class="btn" id="zones" aria-pressed="false" style="min-height:32px;margin-left:8px">Afficher les zones</button></p>`;
    document.getElementById('zones')?.addEventListener('click', (e) => {
      const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
      e.currentTarget.setAttribute('aria-pressed', String(on));
      stage.classList.toggle('show', on);
    });
    stage.querySelectorAll('.ck-hs').forEach((b) => b.addEventListener('click', () => {
      const h = v.hotspots.find((x) => x.id === b.dataset.id);
      if (h.go) location.hash = '#/cockpit/' + h.go;
      else show(h);
    }));
    const f = v.hotspots.find((h) => h.id === focus);
    if (f) show(f);
    return;
  }

  // --- Modes entraînement : une série sur toutes les commandes de la vue.
  const queue = shuffle(targets);
  let i = 0;
  let good = 0;
  const finish = () => {
    const pct = Math.round((good / queue.length) * 100);
    const best = store.get('cockpitBest', {});
    best[v.id] = Math.max(best[v.id] ?? 0, pct);
    store.set('cockpitBest', best);
    clearMarks();
    panel.innerHTML = `<div class="card" style="text-align:center"><div class="score">${pct}%</div>
      <p>${good} / ${queue.length} du premier coup</p>
      <div class="btns" style="justify-content:center"><button class="btn primary" id="again">Recommencer</button></div></div>`;
    document.getElementById('again').addEventListener('click', () => viewCockpit(id));
  };
  const nextBtn = (ok, h) => `<div class="card ${ok ? '' : 'ck-bad'}"><strong>${ok ? '✓ Exact' : '✗ Non'} : ${esc(h.label)}</strong>
    ${h.info ? `<div class="muted">${esc(h.info)}</div>` : ''}
    <div class="btns"><button class="btn primary" id="next">${i + 1 < queue.length ? 'Suivante' : 'Résultat'}</button></div></div>`;
  const bindNext = () => document.getElementById('next').addEventListener('click', () => {
    i++;
    if (i < queue.length) ask(); else finish();
  });

  let answered = false;
  const ask = () => {
    answered = false;
    clearMarks();
    const h = queue[i];
    const head = `<p class="small muted">${i + 1} / ${queue.length} · ${good} bonne(s)</p>`;
    if (cockpitMode === 'find') {
      stage.classList.add('find');
      panel.innerHTML = `${head}<div class="card ck-prompt">Touche : <strong>${esc(h.label)}</strong></div>`;
    } else {
      stage.classList.add('name');
      hsEl(h.id).classList.add('ask');
      const others = shuffle(cockpitTargets().filter((x) => x.label !== h.label).map((x) => x.label));
      const choices = shuffle([h.label, ...[...new Set(others)].slice(0, 3)]);
      panel.innerHTML = `${head}<div class="card">Quelle est la commande encadrée ?
        <div class="choices">${choices.map((c) => `<button class="choice">${esc(c)}</button>`).join('')}</div></div>`;
      panel.querySelectorAll('.choice').forEach((b) => b.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        const ok = b.textContent === h.label;
        if (ok) good++;
        hsEl(h.id).classList.replace('ask', ok ? 'right' : 'wrong');
        panel.innerHTML = head + nextBtn(ok, h);
        bindNext();
      }));
    }
  };

  if (cockpitMode === 'find') {
    stage.addEventListener('click', (e) => {
      if (answered || i >= queue.length) return;
      const r = stage.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * 100;
      const py = ((e.clientY - r.top) / r.height) * 100;
      const h = queue[i];
      const tol = 1.5; // marge en %, pour le doigt
      const ok = px >= h.x - tol && px <= h.x + h.w + tol && py >= h.y - tol && py <= h.y + h.h + tol;
      answered = true;
      if (ok) good++;
      hsEl(h.id).classList.add('right');
      if (!ok) {
        const dot = document.createElement('div');
        dot.className = 'ck-tap';
        dot.style.left = px + '%';
        dot.style.top = py + '%';
        stage.appendChild(dot);
      }
      panel.innerHTML = `<p class="small muted">${i + 1} / ${queue.length} · ${good} bonne(s)</p>` + nextBtn(ok, h);
      bindNext();
    });
  }
  ask();
}

// ---------- Réglages ----------

async function viewSettings() {
  const custom = store.get('content', null);
  const imgKeys = await images.keys();
  const needed = new Set((C.cockpit?.views || []).map((v) => v.image));
  const have = imgKeys.filter((k) => needed.has(k)).length;
  const metas = MODULES.map((m) => [m, C[m]?._meta || {}]);
  render(`
    ${crumbs(['#/', 'Accueil'], [null, 'Réglages'])}
    <h1>Réglages</h1>

    <div class="card">
      <h3 style="margin-top:0">Contenu</h3>
      <p class="small muted">Source actuelle : <strong>${custom ? 'pack importé (sur cet appareil)' : 'fichiers fournis avec l\'app'}</strong></p>
      <ul class="small">${metas.map(([m, meta]) => (
        `<li>${esc(m)} : ${esc(meta.source || '?')}${meta.revision ? ` · rév. ${esc(meta.revision)}` : ''}${meta.sample ? ' · <strong style="color:var(--warn)">EXEMPLE</strong>' : ''}</li>`
      )).join('')}</ul>
      <div class="btns">
        <label class="btn primary">Importer un pack JSON<input type="file" id="file" accept="application/json,.json" hidden></label>
        <button class="btn" id="export">Exporter le contenu</button>
        ${custom ? '<button class="btn danger" id="drop">Revenir au contenu fourni</button>' : ''}
      </div>
      <p class="small muted" id="msg"></p>
      <p class="small muted">Le pack importé reste sur cet appareil (stockage du navigateur). Il n'est ni envoyé ni publié.</p>
    </div>

    <div class="card">
      <h3 style="margin-top:0">Images du cockpit</h3>
      <p class="small muted">${have} / ${needed.size} vue(s) avec image. Elles s'importent avec le même bouton (fichier <code>pc24-cockpit.pack.json</code>) et restent sur cet appareil.</p>
      ${imgKeys.length ? '<div class="btns"><button class="btn danger" id="dropimg">Supprimer les images</button></div>' : ''}
    </div>

    <div class="card">
      <h3 style="margin-top:0">Progression</h3>
      <p class="small muted">Flashcards, meilleurs scores, erreurs de quiz.</p>
      <div class="btns"><button class="btn danger" id="resetprog">Remettre à zéro</button></div>
    </div>

    <div class="card">
      <h3 style="margin-top:0">Thème</h3>
      <div class="btns">${['auto', 'light', 'dark'].map((t) => (
        `<button class="btn" data-theme-set="${t}" aria-pressed="${(store.get('theme', 'auto')) === t}">${{ auto: 'Auto', light: 'Clair', dark: 'Sombre' }[t]}</button>`
      )).join('')}</div>
    </div>

    <div class="card small muted">
      Outil de révision personnel. Il ne remplace pas l'AFM, la QRH ni la documentation approuvée de l'exploitant,
      et n'est approuvé par aucune autorité. En cas d'écart, c'est la documentation officielle qui fait foi.
    </div>
  `);

  const msg = document.getElementById('msg');
  document.getElementById('file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const pack = JSON.parse(await f.text());
      const err = validatePack(pack);
      if (err) { msg.textContent = '✗ ' + err; return; }
      const { images: imgs, ...rest } = pack;
      const mods = MODULES.filter((m) => rest[m]);
      // Fusion : un pack ne contenant qu'un module ne remplace pas les autres.
      if (mods.length && !store.set('content', { ...store.get('content', {}), ...rest })) {
        msg.textContent = '✗ Stockage impossible (navigation privée ou espace plein).';
        return;
      }
      if (imgs) {
        try { await images.putAll(imgs); } catch {
          msg.textContent = '✗ Impossible d\'enregistrer les images (navigation privée ?).';
          return;
        }
      }
      await loadContent();
      await viewSettings();
      const parts = [...mods, ...(imgs ? [`${Object.keys(imgs).length} image(s) cockpit`] : [])];
      document.getElementById('msg').textContent = '✓ Pack importé : ' + parts.join(', ');
    } catch (err) {
      msg.textContent = '✗ JSON invalide : ' + err.message;
    }
  });
  document.getElementById('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(C, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pc24-pack.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  document.getElementById('drop')?.addEventListener('click', async () => {
    if (!confirm('Supprimer le pack importé de cet appareil ?')) return;
    store.del('content');
    await loadContent();
    viewSettings();
  });
  document.getElementById('dropimg')?.addEventListener('click', async () => {
    if (!confirm('Supprimer les images du cockpit de cet appareil ?')) return;
    await images.clear();
    viewSettings();
  });
  document.getElementById('resetprog').addEventListener('click', () => {
    if (!confirm('Effacer toute la progression ?')) return;
    ['leitner', 'best', 'wrong', 'cockpitBest'].forEach((k) => store.del(k));
    msg.textContent = '✓ Progression effacée.';
  });
  app.querySelectorAll('[data-theme-set]').forEach((b) => b.addEventListener('click', () => {
    store.set('theme', b.dataset.themeSet);
    applyTheme();
    app.querySelectorAll('[data-theme-set]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
}

function applyTheme() {
  const t = store.get('theme', 'auto');
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

function viewNotFound() {
  render(`<h1>Introuvable</h1><p><a href="#/">Retour à l'accueil</a></p>`);
}

// ---------- Routeur ----------

function route() {
  const [, a = '', b = '', c = ''] = decodeURIComponent(location.hash.replace(/^#/, '')).split('/');
  const tab = { normal: 'normal', abn: 'abn', sys: 'sys', quiz: 'sys', lim: 'lim', cockpit: 'cockpit' }[a];
  document.querySelectorAll('.tabs a').forEach((x) => x.classList.toggle('active', x.dataset.tab === tab));

  switch (a) {
    case '': return viewHome();
    case 'normal': return b ? viewNormal(b) : viewNormalList();
    case 'abn': return b ? viewAbn(b) : viewAbnList();
    case 'sys': return b ? viewSys(b, c) : viewSysList();
    case 'quiz': return viewQuiz(b || 'all');
    case 'lim': return viewLim();
    case 'cockpit': return b ? viewCockpit(b, c) : viewCockpitList();
    case 'drill': return viewDrill(b === 'memory' ? 'memory' : 'lim');
    case 'search': return viewSearch(location.hash.split('/').slice(2).map(decodeURIComponent).join('/'));
    case 'settings': return viewSettings();
    default: return viewNotFound();
  }
}

// ---------- Démarrage ----------

applyTheme();
loadContent().then(() => {
  window.addEventListener('hashchange', route);
  route();
}).catch((err) => {
  render(`<h1>Erreur de chargement</h1><p class="muted">${esc(err.message)}</p>`);
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne indisponible, l'app marche quand même */ });
}

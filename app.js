// PC-24 PDP — révision personnelle. Aucune dépendance, aucun build.
// Le contenu vit dans content/*.json ; un pack importé (Réglages) le remplace,
// stocké uniquement sur l'appareil.

const MODULES = ['normal', 'abnormal', 'systems', 'quiz', 'limitations'];
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
  const sample = MODULES.some((m) => C[m]?._meta?.sample);
  document.getElementById('sample-banner').hidden = !sample;
}

function validatePack(pack) {
  if (!pack || typeof pack !== 'object') return 'Le fichier n\'est pas un objet JSON.';
  const found = MODULES.filter((m) => pack[m]);
  if (!found.length) return `Aucun module reconnu. Clés attendues : ${MODULES.join(', ')}.`;
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
      return '<ul>' + lines.map((l) => `<li>${inline(l.replace(/^\s*-\s+/, ''))}</li>`).join('') + '</ul>';
    }
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
    for (const sec of ch.sections) {
      if (hit(sec.title) || hit(sec.body)) hits.push(['Systèmes', `${ch.title} — ${sec.title}`, `#/sys/${ch.id}`]);
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
      <div class="card">${stepsHtml(p.steps)}</div>
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

function viewSys(id) {
  const ch = C.systems.chapters.find((x) => x.id === id);
  if (!ch) return viewNotFound();
  const n = C.quiz.questions.filter((q) => q.chapter === ch.id).length;
  render(`
    ${crumbs(['#/', 'Accueil'], ['#/sys', 'Systèmes'], [null, ch.title])}
    <h1>${esc(ch.title)}</h1>
    ${ch.sections.map((s) => `<div class="card prose"><h3>${esc(s.title)}</h3>${md(s.body)}</div>`).join('')}
    ${n ? `<div class="btns"><a class="btn primary" href="#/quiz/${esc(ch.id)}">Quiz : ${n} question(s)</a></div>` : ''}
  `);
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

// ---------- Réglages ----------

function viewSettings() {
  const custom = store.get('content', null);
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
      // Les modules absents du pack gardent le contenu fourni.
      if (!store.set('content', pack)) { msg.textContent = '✗ Stockage impossible (navigation privée ou espace plein).'; return; }
      await loadContent();
      viewSettings();
      document.getElementById('msg').textContent = '✓ Pack importé : ' + MODULES.filter((m) => pack[m]).join(', ');
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
  document.getElementById('resetprog').addEventListener('click', () => {
    if (!confirm('Effacer toute la progression ?')) return;
    ['leitner', 'best', 'wrong'].forEach((k) => store.del(k));
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
  const [, a = '', b = ''] = decodeURIComponent(location.hash.replace(/^#/, '')).split('/');
  const tab = { normal: 'normal', abn: 'abn', sys: 'sys', quiz: 'sys', lim: 'lim' }[a];
  document.querySelectorAll('.tabs a').forEach((x) => x.classList.toggle('active', x.dataset.tab === tab));

  switch (a) {
    case '': return viewHome();
    case 'normal': return b ? viewNormal(b) : viewNormalList();
    case 'abn': return b ? viewAbn(b) : viewAbnList();
    case 'sys': return b ? viewSys(b) : viewSysList();
    case 'quiz': return viewQuiz(b || 'all');
    case 'lim': return viewLim();
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

(() => {
'use strict';
const KEY = 'syllabustrack:data', THEME_KEY = 'syllabustrack:theme', VER = 1;
const SEMS = ['1', '2', '3', '4', '5', '6', '7', '8'];
const TITLES = { dashboard: 'Dashboard', subjects: 'My Subjects', detail: 'Subject Details', planner: 'Exam Planner', settings: 'Settings' };
const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  kids.flat(Infinity).filter(x => x != null && x !== false).forEach(x => n.append(x));
  return n;
};
const btn = (label, fn, cls = '') => el('button', { class: 'btn ' + cls, type: 'button', onclick: fn }, label);

let data = { version: VER, subjects: [] };
let view = 'dashboard', detailId = null;
const filt = { q: '', sem: '', status: '' };
const now = () => new Date().toISOString();

/* ---------- toast & dialogs ---------- */
let toastTimer;
function toast(msg, bad) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, 3500);
}
const confirmBox = (msg, ok = 'Delete') => new Promise(res => {
  const d = $('#confirmDlg');
  $('#cMsg').textContent = msg; $('#cOk').textContent = ok; d.returnValue = '';
  d.addEventListener('close', () => res(d.returnValue === 'yes'), { once: true });
  d.showModal();
});
let formCfg = null;
function openForm(cfg) {
  formCfg = cfg; $('#fTitle').textContent = cfg.title;
  const box = $('#fFields'); box.replaceChildren();
  cfg.fields.forEach(f => {
    const id = 'f_' + f.name;
    const inp = f.type === 'select'
      ? el('select', { id, name: f.name }, f.options.map(([v, l]) => el('option', { value: v }, l)))
      : el('input', { id, name: f.name, type: f.type || 'text', autocomplete: 'off', ...(f.list ? { list: f.list } : {}) });
    inp.value = f.value ?? '';
    box.append(el('div', { class: 'field' }, el('label', { for: id }, f.label + (f.required ? ' *' : '')), inp, el('small', { class: 'err', id: id + '_e' })));
  });
  $('#formDlg').showModal();
  box.querySelector('input,select').focus();
}

/* ---------- storage & validation ---------- */
const validDate = s => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number), dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
function validate(d) {
  const isS = x => typeof x === 'string' && x.trim() !== '';
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'File is not a valid data object';
  if (d.version !== VER) return 'Unsupported schema version';
  if (!Array.isArray(d.subjects)) return '"subjects" must be an array';
  const ids = new Set(), codes = new Set();
  const bad = id => { if (!isS(id) || ids.has(id)) return true; ids.add(id); return false; };
  for (const s of d.subjects) {
    if (!s || typeof s !== 'object' || bad(s.id) || !isS(s.name) || !isS(s.code)) return 'Invalid subject record';
    const c = s.code.toLowerCase();
    if (codes.has(c)) return 'Duplicate subject code: ' + s.code;
    codes.add(c);
    if (typeof s.dept !== 'string' || !SEMS.includes(s.semester) || !(s.exam === '' || validDate(s.exam))) return 'Invalid fields in subject ' + s.code;
    if (isNaN(Date.parse(s.created)) || isNaN(Date.parse(s.updated))) return 'Invalid timestamp in subject ' + s.code;
    if (!Array.isArray(s.units)) return 'Units must be an array in ' + s.code;
    for (const u of s.units) {
      if (!u || bad(u.id) || !isS(u.name) || u.subjectId !== s.id || !Array.isArray(u.topics)) return 'Invalid unit in ' + s.code;
      for (const t of u.topics) if (!t || bad(t.id) || !isS(t.name) || t.unitId !== u.id || typeof t.done !== 'boolean') return 'Invalid topic in ' + s.code;
    }
  }
  return null;
}
function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    if (!raw) return;
    const d = JSON.parse(raw), err = validate(d);
    if (err) throw new Error(err);
    data = d;
  } catch (e) {
    try { if (raw) localStorage.setItem(KEY + ':corrupt-backup', raw); } catch { /* ignore */ }
    toast('Saved data was unreadable (backed up). Starting empty.', true);
  }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; }
  catch (e) { toast('Could not save data: ' + e.message, true); return false; }
}
function commit() { save(); render(); }
function uid(p) {
  const used = new Set();
  data.subjects.forEach(s => { used.add(s.id); s.units.forEach(u => { used.add(u.id); u.topics.forEach(t => used.add(t.id)); }); });
  let id; do { id = p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); } while (used.has(id));
  return id;
}

/* ---------- calculations ---------- */
const pct = (d, t) => (t ? Math.round(d / t * 100) : 0);
const uStats = u => { const t = u.topics.length, d = u.topics.filter(x => x.done).length; return { total: t, done: d, pct: pct(d, t) }; };
function sStats(s) {
  let t = 0, d = 0;
  s.units.forEach(u => { const x = uStats(u); t += x.total; d += x.done; });
  return { units: s.units.length, total: t, done: d, pct: pct(d, t), status: t === 0 || d === 0 ? 'Not Started' : d === t ? 'Completed' : 'In Progress' };
}
const daysLeft = str => {
  const [y, m, d] = str.split('-').map(Number), n = new Date();
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5);
};
const fmtDate = str => { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };
const dayText = d => d === 0 ? 'Today' : d > 0 ? d + (d === 1 ? ' day left' : ' days left') : (-d) + (d === -1 ? ' day overdue' : ' days overdue');
function exams() {
  const all = data.subjects.filter(s => s.exam).map(s => ({ s, d: daysLeft(s.exam) }));
  return { up: all.filter(x => x.d >= 0).sort((a, b) => a.d - b.d), over: all.filter(x => x.d < 0).sort((a, b) => b.d - a.d) };
}

/* ---------- reusable UI ---------- */
const badge = st => el('span', { class: 'badge ' + st.toLowerCase().replace(' ', '-') }, st);
const bar = p => el('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': p, 'aria-valuemin': 0, 'aria-valuemax': 100 }, el('span', { style: `width:${p}%` }));
const empty = (msg, label = 'Add Subject', fn = () => subjectForm()) => el('div', { class: 'empty' }, el('p', {}, msg), btn(label, fn, 'primary'));
function card(s, actions) {
  const st = sStats(s);
  return el('article', { class: 'card' },
    el('div', { class: 'row' }, el('div', {}, el('h3', {}, s.name), el('p', { class: 'muted' }, `${s.code} · Semester ${s.semester}` + (s.dept ? ' · ' + s.dept : ''))), badge(st.status)),
    el('p', { class: 'muted' }, `${st.units} units · ${st.done}/${st.total} topics done` + (s.exam ? ' · Exam ' + fmtDate(s.exam) : '')),
    el('div', { class: 'row' }, bar(st.pct), el('strong', {}, st.pct + '%')),
    el('div', { class: 'actions' }, actions));
}
const del = (msg, fn) => confirmBox(msg).then(ok => { if (ok) { fn(); commit(); } });

/* ---------- subject / unit / topic actions ---------- */
function subjectForm(s) {
  openForm({
    title: s ? 'Edit Subject' : 'Add Subject',
    fields: [
      { name: 'name', label: 'Subject name', required: 1, value: s?.name },
      { name: 'code', label: 'Subject code', required: 1, value: s?.code },
      { name: 'dept', label: 'Department', list: 'depts', value: s?.dept },
      { name: 'semester', label: 'Semester', type: 'select', options: SEMS.map(x => [x, 'Semester ' + x]), value: s?.semester || '1' },
      { name: 'exam', label: 'Examination date', type: 'date', value: s?.exam }],
    validate: v => data.subjects.some(x => x !== s && x.code.toLowerCase() === v.code.toLowerCase()) ? { code: 'This subject code already exists' } : {},
    onSave: v => {
      if (s) { Object.assign(s, v); s.updated = now(); }
      else { const t = now(); data.subjects.push({ id: uid('s_'), ...v, created: t, updated: t, units: [] }); }
      commit(); toast('Subject saved');
    }
  });
}
function unitForm(s, u) {
  openForm({
    title: u ? 'Edit Unit' : 'Add Unit', fields: [{ name: 'name', label: 'Unit name', required: 1, value: u?.name }],
    onSave: v => { if (u) u.name = v.name; else s.units.push({ id: uid('u_'), name: v.name, subjectId: s.id, topics: [] }); s.updated = now(); commit(); }
  });
}
function topicForm(s, u, t) {
  openForm({
    title: t ? 'Edit Topic' : 'Add Topic', fields: [{ name: 'name', label: 'Topic name', required: 1, value: t?.name }],
    onSave: v => { if (t) t.name = v.name; else u.topics.push({ id: uid('t_'), name: v.name, unitId: u.id, done: false }); s.updated = now(); commit(); }
  });
}
function showDetail(id) { detailId = id; go('detail'); }

/* ---------- renderers ---------- */
function renderDashboard() {
  let T = 0, D = 0, U = 0;
  data.subjects.forEach(s => { const x = sStats(s); T += x.total; D += x.done; U += x.units; });
  const stats = [['Total Subjects', data.subjects.length], ['Total Units', U], ['Total Topics', T], ['Completed Topics', D], ['Pending Topics', T - D], ['Overall Progress', pct(D, T) + '%']];
  $('#stats').replaceChildren(...stats.map(([l, v]) => el('div', { class: 'card stat' }, el('span', { class: 'muted' }, l), el('strong', {}, String(v)))));
  $('#dashCards').replaceChildren(...(data.subjects.length ? data.subjects.map(s => card(s, [btn('View Details', () => showDetail(s.id))])) : [empty('No subjects yet. Add your first subject to start tracking.')]));
  const rec = [...data.subjects].sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated)).slice(0, 5);
  $('#recent').replaceChildren(...(rec.length ? rec.map(s => el('div', { class: 'item' }, el('span', {}, `${s.name} (${s.code})`), el('span', { class: 'muted' }, new Date(s.updated).toLocaleString()))) : [el('p', { class: 'muted' }, 'No subjects updated yet.')]));
  const up = exams().up.slice(0, 5);
  $('#upcoming').replaceChildren(...(up.length ? up.map(x => el('div', { class: 'item' }, el('span', {}, `${x.s.name} (${x.s.code})`), el('span', { class: 'muted' }, fmtDate(x.s.exam) + ' · ' + dayText(x.d)))) : [el('p', { class: 'muted' }, 'No upcoming examinations. Add an exam date to a subject.')]));
}
function clearFilters() {
  filt.q = ''; filt.sem = ''; filt.status = '';
  $('#fSearch').value = ''; $('#fSem').value = ''; $('#fStatus').value = '';
  renderSubjects();
}
function renderSubjects() {
  const q = filt.q.trim().toLowerCase();
  const list = data.subjects.filter(s => (!q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)) && (!filt.sem || s.semester === filt.sem) && (!filt.status || sStats(s).status === filt.status));
  $('#subjectList').replaceChildren(...(list.length
    ? list.map(s => card(s, [btn('View', () => showDetail(s.id)), btn('Edit', () => subjectForm(s)), btn('Delete', () => del(`Delete "${s.name}" and all its units and topics? This cannot be undone.`, () => { data.subjects = data.subjects.filter(x => x !== s); }), 'danger')]))
    : [data.subjects.length ? el('div', { class: 'empty' }, el('p', {}, 'No subjects match your search or filters.'), btn('Clear Filters', clearFilters)) : empty('No subjects yet. Add one to get started.')]));
}
function unitBlock(s, u) {
  const us = uStats(u);
  return el('details', { class: 'card unit', open: '' },
    el('summary', {}, el('strong', {}, u.name), el('span', { class: 'muted' }, `${us.done}/${us.total} · ${us.pct}%`)),
    bar(us.pct),
    el('ul', { class: 'topics' }, u.topics.map(t => el('li', {},
      el('label', {}, el('input', { type: 'checkbox', ...(t.done ? { checked: '' } : {}), onchange: e => { t.done = e.target.checked; s.updated = now(); commit(); } }), el('span', { class: t.done ? 'done' : '' }, t.name)),
      el('span', { class: 'actions' }, btn('Edit', () => topicForm(s, u, t), 'sm'), btn('Delete', () => del(`Delete topic "${t.name}"?`, () => { u.topics = u.topics.filter(x => x !== t); s.updated = now(); }), 'sm danger'))))),
    u.topics.length ? null : el('p', { class: 'muted' }, 'No topics yet.'),
    el('div', { class: 'actions' }, btn('Add Topic', () => topicForm(s, u), 'primary sm'), btn('Edit Unit', () => unitForm(s, u), 'sm'),
      btn('Delete Unit', () => del(`Delete unit "${u.name}" and its topics?`, () => { s.units = s.units.filter(x => x !== u); s.updated = now(); }), 'sm danger')));
}
function renderDetail() {
  const s = data.subjects.find(x => x.id === detailId);
  if (!s) { go('subjects'); return; }
  $('#detail').replaceChildren(
    btn('← Back to subjects', () => go('subjects')),
    el('div', { class: 'grid' }, card(s, [btn('Edit Subject', () => subjectForm(s)), btn('+ Add Unit', () => unitForm(s), 'primary')])),
    ...(s.units.length ? s.units.map(u => unitBlock(s, u)) : [el('div', { class: 'empty' }, el('p', {}, 'No units yet. Add a unit to start adding topics.'), btn('Add Unit', () => unitForm(s), 'primary'))]));
}
function renderPlanner() {
  const { up, over } = exams();
  const fill = (id, arr, msg) => $(id).replaceChildren(...(arr.length ? arr.map(x => el('div', { class: 'item' },
    el('span', {}, el('strong', {}, x.s.name), ` (${x.s.code})`),
    el('span', { class: 'muted' }, fmtDate(x.s.exam) + ' · ' + dayText(x.d)),
    el('span', { class: 'badge ' + (x.d < 0 ? 'overdue' : x.d === 0 ? 'in-progress' : '') }, x.d < 0 ? 'Overdue' : x.d === 0 ? 'Today' : 'Upcoming'))) : [el('p', { class: 'muted' }, msg)]));
  fill('#plUp', up, 'No upcoming exams. Add an examination date to a subject.');
  fill('#plOver', over, 'No overdue exams.');
}
function render() {
  ({ dashboard: renderDashboard, subjects: renderSubjects, detail: renderDetail, planner: renderPlanner, settings: () => {} })[view]();
}
function go(v) {
  view = v;
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('active', s.id === 'v-' + v));
  document.querySelectorAll('nav button').forEach(b => b.setAttribute('aria-current', String(b.dataset.view === (v === 'detail' ? 'subjects' : v))));
  $('#title').textContent = TITLES[v];
  document.body.classList.remove('nav-open');
  render(); window.scrollTo(0, 0);
}

/* ---------- theme ---------- */
function applyTheme(t) { document.documentElement.dataset.theme = t; $('#themeSel').value = t; $('#themeBtn').textContent = t === 'dark' ? '☀️' : '🌙'; }
function setTheme(t) { applyTheme(t); try { localStorage.setItem(THEME_KEY, t); } catch { toast('Could not save theme', true); } }

/* ---------- init (listeners attached once) ---------- */
function init() {
  load();
  let t = null; try { t = localStorage.getItem(THEME_KEY); } catch { /* ignore */ }
  applyTheme(t === 'dark' || t === 'light' ? t : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  $('#fSem').append(...SEMS.map(s => el('option', { value: s }, 'Semester ' + s)));
  document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));
  document.querySelectorAll('.js-add').forEach(b => b.addEventListener('click', () => subjectForm()));
  $('#menuBtn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  $('#backdrop').addEventListener('click', () => document.body.classList.remove('nav-open'));
  $('#themeBtn').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  $('#themeSel').addEventListener('change', e => setTheme(e.target.value));
  $('#fSearch').addEventListener('input', e => { filt.q = e.target.value; renderSubjects(); });
  $('#fSem').addEventListener('change', e => { filt.sem = e.target.value; renderSubjects(); });
  $('#fStatus').addEventListener('change', e => { filt.status = e.target.value; renderSubjects(); });
  $('#fClear').addEventListener('click', clearFilters);
  $('#fCancel').addEventListener('click', () => $('#formDlg').close());
  $('#form').addEventListener('submit', e => {
    e.preventDefault();
    const form = $('#form'), v = {}, errs = {};
    formCfg.fields.forEach(f => { v[f.name] = form.elements[f.name].value.trim(); if (f.required && !v[f.name]) errs[f.name] = f.label + ' is required'; });
    if (!Object.keys(errs).length) Object.assign(errs, formCfg.validate ? formCfg.validate(v) : {});
    formCfg.fields.forEach(f => { $('#f_' + f.name + '_e').textContent = errs[f.name] || ''; });
    if (Object.keys(errs).length) return;
    $('#formDlg').close(); formCfg.onSave(v);
  });
  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `syllabustrack-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    toast('Data exported');
  });
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onerror = () => toast('Could not read the file', true);
    r.onload = async () => {
      let d;
      try { d = JSON.parse(r.result); } catch { toast('Import rejected: not valid JSON', true); return; }
      const err = validate(d);
      if (err) { toast('Import rejected: ' + err, true); return; }
      if (!await confirmBox(`Replace all current data with ${d.subjects.length} imported subject(s)?`, 'Replace')) return;
      const old = data; data = d;
      if (save()) { detailId = null; go('dashboard'); toast('Import successful'); } else data = old;
    };
    r.readAsText(f);
  });
  $('#clearBtn').addEventListener('click', async () => {
    if (!await confirmBox('This permanently removes ALL subjects, units and topics saved in this browser. Your theme setting is kept.', 'Clear All Data')) return;
    try { localStorage.removeItem(KEY); } catch (e) { toast('Could not clear data: ' + e.message, true); return; }
    data = { version: VER, subjects: [] }; detailId = null; go('dashboard'); toast('All data cleared');
  });
  go('dashboard');
}
init();
})();

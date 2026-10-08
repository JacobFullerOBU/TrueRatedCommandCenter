'use strict';
const SITE = 'https://truerated.co';
const KEY = 'trueRatedCommandCenter.v1';
const VIEWS = ['Overview', 'Live', 'Metrics', 'Tasks', 'Content', 'Moderation', 'Uptime', 'Data'];
const PLATFORMS = ['Instagram', 'TikTok', 'X', 'YouTube', 'Facebook', 'Reddit', 'Email'];

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Number(n).toLocaleString();

function defaults() {
  const m = (name, unit, goal) => ({ id: uid(), name, unit, goal, entries: [] });
  return {
    metrics: [
      m('Total users', '', 1000), m('Reviews posted', '', 5000), m('Weekly active users', '', 300),
      m('Instagram followers', '', 2000), m('TikTok followers', '', 2000), m('Avg. rating', '★', 4.5),
    ],
    tasks: [], posts: [], reports: [], checks: [],
  };
}
let state = load();
function load() {
  try { return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return defaults(); }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { } }

// [category, priority, title] - starter plan tailored to a multi-category review site
const GROWTH_PLAN = [
  ['Foundation', 'High', 'Add Google Search Console for truerated.co and submit sitemap.xml'],
  ['Foundation', 'High', 'Add unique title + meta description + Open Graph image to every page (movie.html, reviewer-profile.html)'],
  ['Foundation', 'High', 'Make sharing a review produce a rich link preview (title, rating, cover) for iMessage/X/Discord'],
  ['Foundation', 'High', 'Add analytics (Plausible or GA4) and track: visits, signups, first review'],
  ['Foundation', 'Medium', 'Keep sitemap.xml updated with all movie/TV/game/book pages (auto-generate in the GitHub workflow)'],
  ['Activation', 'High', 'Add a "Review something in 30 seconds" prompt on the homepage for new visitors'],
  ['Activation', 'High', 'Write a welcome flow: after signup, ask for 3 favorites and suggest 5 titles to rate'],
  ['Activation', 'Medium', 'Promote the Letterboxd import on the homepage - it brings people with existing review history'],
  ['Activation', 'Medium', 'Email/notify users when someone follows them or likes their review'],
  ['Social', 'High', 'Post a "True Rated vs critic score" comparison on TikTok/Reels 3x per week'],
  ['Social', 'High', 'Use Surprise Me in short videos: "let the site pick tonight's movie"'],
  ['Social', 'Medium', 'Start a weekly "Hot take Friday" poll on X/Instagram stories linking to a title page'],
  ['Social', 'Medium', 'Share a weekly Top Reviewers leaderboard post to reward and recruit reviewers'],
  ['Communities', 'High', 'Post genuinely useful lists (not ads) in 5 relevant subreddits: r/movies, r/television, r/gaming, r/books, r/musicsuggestions'],
  ['Communities', 'Medium', 'Reach out to 20 micro-creators (1k-20k followers) and offer a featured reviewer profile'],
  ['Communities', 'Medium', 'Launch on Product Hunt, Indie Hackers and Hacker News "Show HN"'],
  ['Retention', 'Medium', 'Add a weekly digest: top reviews in the categories each user follows'],
  ['Retention', 'Medium', 'Add reviewer streaks/badges (first review, 10 reviews, 5 categories)'],
  ['Retention', 'Low', 'Seed pages with your own quality reviews so every title page isn't empty'],
  ['Measure', 'Medium', 'Every Sunday: use Live tab -> Log to Metrics, then pick next week's top 3 tasks'],
];

// ---------- helpers ----------
const latest = m => m.entries.length ? m.entries[m.entries.length - 1].value : null;
function delta(m) {
  const e = m.entries; if (e.length < 2) return null;
  return e[e.length - 1].value - e[e.length - 2].value;
}
function spark(entries) {
  if (entries.length < 2) return '<div class="empty">Log 2+ entries to see a trend</div>';
  const v = entries.slice(-30).map(e => e.value), min = Math.min(...v), max = Math.max(...v), r = max - min || 1;
  const pts = v.map((x, i) => [i / (v.length - 1) * 200, 52 - (x - min) / r * 48]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="0 0 200 56" preserveAspectRatio="none"><path class="area" d="${d} L200 56 L0 56Z"/><path d="${d}"/></svg>`;
}
function kpi(m) {
  const v = latest(m), d = delta(m), pct = v != null && m.goal ? Math.min(100, v / m.goal * 100) : 0;
  return `<div class="card kpi"><div class="label">${esc(m.name)}</div>
    <div class="value">${v == null ? '—' : fmt(v) + esc(m.unit)}</div>
    <div class="delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d == null ? '&nbsp;' : (d > 0 ? '▲ +' : d < 0 ? '▼ ' : '') + +d.toFixed(2)}</div>
    ${m.goal ? `<div class="bar"><i style="width:${pct}%"></i></div><div class="label">${pct.toFixed(0)}% of goal ${fmt(m.goal)}</div>` : ''}
    ${spark(m.entries)}</div>`;
}
function uptime() {
  const c = state.checks; if (!c.length) return null;
  return c.filter(x => x.ok).length / c.length * 100;
}

// ---------- live data (Firebase) ----------
const live = { api: null, user: null, isAdmin: false, stats: null, busy: false, error: '' };
async function liveInit() {
  if (live.api || live.loading) return;
  live.loading = true;
  try {
    const [{ init }, { firebaseConfig }] = await Promise.all([import('./live.js'), import('./config.js')]);
    live.api = await init(firebaseConfig);
    live.api.onUser((u, admin) => { live.user = u; live.isAdmin = admin; if (current() === 'Live') render(); });
  } catch (e) {
    live.error = 'Could not load Firebase (' + e.message + '). Serve this folder over http://localhost rather than opening the file directly.';
    live.loading = false;
    if (current() === 'Live') render();
  }
}
async function liveRefresh() {
  live.busy = true; live.error = ''; render();
  try { live.stats = await live.api.stats(); state.liveStats = live.stats; save(); }
  catch (e) { live.error = 'Read failed: ' + e.message + ' (your database rules may require an admin login).'; }
  live.busy = false; render();
}
function syncMetrics() {
  const s = live.stats; if (!s) return;
  const set = (name, v) => {
    const m = state.metrics.find(x => x.name === name); if (!m || v == null) return;
    m.entries = m.entries.filter(e => e.date !== today());
    m.entries.push({ date: today(), value: +v.toFixed(2) });
  };
  set('Total users', s.users); set('Reviews posted', s.total);
  set('Weekly active users', s.active7); set('Avg. rating', s.avgRating);
}
const bars = rows => {
  const max = Math.max(1, ...rows.map(r => r.value));
  return `<svg class="spark" viewBox="0 0 ${rows.length * 8} 56" preserveAspectRatio="none">${rows.map((r, i) =>
    `<rect x="${i * 8 + 1}" y="${56 - r.value / max * 52}" width="6" height="${r.value / max * 52 || .5}" fill="var(--accent)"><title>${r.date}: ${r.value}</title></rect>`).join('')}</svg>`;
};

// ---------- views ----------
const views = {
  Overview() {
    const open = state.tasks.filter(t => t.status !== 'Done');
    const upcoming = state.posts.filter(p => p.status !== 'Posted' && p.date >= today()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
    const pend = state.reports.filter(r => r.status === 'Open');
    const last = state.checks[state.checks.length - 1], up = uptime();
    return `<h1>Overview</h1><p class="sub">Everything about True Rated at a glance.</p>
    <div class="grid">
      <div class="card kpi"><div class="label">Site status</div>
        <div class="value">${last ? (last.ok ? '<span class="up">Online</span>' : '<span class="down">Down</span>') : '—'}</div>
        <div class="label">${last ? last.ms + ' ms · ' + up.toFixed(1) + '% uptime' : 'No checks yet'}</div></div>
      <div class="card kpi"><div class="label">Open tasks</div><div class="value">${open.length}</div>
        <div class="label">${open.filter(t => t.priority === 'High').length} high priority</div></div>
      <div class="card kpi"><div class="label">Reports to review</div><div class="value">${pend.length}</div></div>
      <div class="card kpi"><div class="label">Scheduled posts</div><div class="value">${upcoming.length}</div></div>
    </div>
    <h2 style="margin-top:24px">Growth &amp; goals</h2>
    <div class="grid">${state.metrics.map(kpi).join('')}</div>
    <h2 style="margin-top:24px">Next up</h2>
    <div class="grid">
      <div class="card"><h2>Upcoming posts</h2>${upcoming.map(p => `<div>${esc(p.date)} · <b>${esc(p.platform)}</b> ${esc(p.text.slice(0, 60))}</div>`).join('') || '<div class="empty">Nothing scheduled</div>'}</div>
      <div class="card"><h2>Priority tasks</h2>${open.filter(t => t.priority === 'High').slice(0, 5).map(t => `<div>${esc(t.title)}</div>`).join('') || '<div class="empty">No high-priority tasks</div>'}</div>
    </div>`;
  },

  Live() {
    const head = `<h1>Live from truerated.co</h1><p class="sub">Real numbers read straight from your Firebase database.</p>`;
    if (live.error && !live.api) return head + `<div class="card down">${esc(live.error)}</div>`;
    if (!live.api) return head + '<div class="empty">Loading…</div>';
    if (!live.user) return head + `<div class="card"><h2>Sign in with your admin account</h2>
      <form data-form="liveLogin" class="row"><input name="email" type="email" placeholder="Email" required>
      <input name="pw" type="password" placeholder="Password" required><button class="primary">Sign in</button></form>
      ${live.error ? `<p class="down">${esc(live.error)}</p>` : ''}</div>`;
    const s = live.stats;
    const bar = `<div class="row" style="margin-bottom:16px"><span class="pill ${live.isAdmin ? 'ok' : 'med'}">${esc(live.user.email)}${live.isAdmin ? ' · admin' : ' · not admin'}</span>
      <button class="primary" data-act="liveRefresh">${live.busy ? 'Loading…' : 'Refresh'}</button>
      <button data-act="liveSync" ${s ? '' : 'disabled'}>Log to Metrics</button>
      <button class="link" data-act="liveOut">Sign out</button>
      ${s ? `<span class="label">Updated ${new Date(s.fetchedAt).toLocaleTimeString()}</span>` : ''}</div>
      ${live.error ? `<p class="down">${esc(live.error)}</p>` : ''}`;
    if (!s) return head + bar + '<div class="empty">Press Refresh to load stats.</div>';
    const k = (l, v, sub) => `<div class="card kpi"><div class="label">${l}</div><div class="value">${v}</div><div class="label">${sub || '&nbsp;'}</div></div>`;
    const list = rows => rows.map(([n, c]) => `<tr><td>${esc(n)}</td><td>${c}</td></tr>`).join('');
    return head + bar + `<div class="grid">
      ${k('Users', fmt(s.users), `+${s.newUsers7} this week · +${s.newUsers30} this month`)}
      ${k('Reviews', fmt(s.total), `+${s.last7} this week · +${s.last30} this month`)}
      ${k('Active reviewers (7d)', s.active7, 'distinct people who posted')}
      ${k('Avg. rating', s.avgRating == null ? '—' : s.avgRating.toFixed(2), 'across all reviews')}
      ${k('Suggestions', s.suggestionCount, 'from the site form')}</div>
    <div class="grid" style="margin-top:16px">
      <div class="card"><h2>Reviews per day (30d)</h2>${bars(s.reviewsPerDay)}</div>
      <div class="card"><h2>Signups per day (30d)</h2>${bars(s.signupsPerDay)}</div>
      <div class="card"><h2>By category</h2><table>${list(s.categories)}</table></div>
      <div class="card"><h2>Most reviewed</h2><table>${list(s.topMedia)}</table></div>
      <div class="card wide"><h2>Latest suggestions</h2>${s.suggestions.map(x => `<div style="padding:4px 0;border-bottom:1px solid var(--line)">${esc(x.text)} <span class="label">${esc((x.timestamp || '').slice(0, 10))}</span></div>`).join('') || '<div class="empty">None</div>'}</div></div>`;
  },

  Metrics() {
    return `<h1>Metrics</h1><p class="sub">Log your numbers (daily or weekly) and track progress to goals.</p>
    <div class="card wide" style="margin-bottom:16px"><form data-form="entry" class="row">
      <select name="metric">${state.metrics.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
      <input name="value" type="number" step="any" placeholder="Value" required>
      <input name="date" type="date" value="${today()}" required>
      <button class="primary">Log entry</button>
      <button type="button" data-act="addMetric">+ New metric</button></form></div>
    <div class="grid">${state.metrics.map(m => `<div>${kpi(m)}
      <div class="row" style="margin-top:6px"><button class="link" data-act="setGoal" data-id="${m.id}">Edit goal</button>
      <button class="link" data-act="delMetric" data-id="${m.id}">Delete</button></div></div>`).join('')}</div>`;
  },

  Tasks() {
    const cols = ['To do', 'In progress', 'Done'];
    return `<h1>Tasks &amp; Roadmap</h1><p class="sub">Features, bugs, and growth work.</p>
    <div class="card wide" style="margin-bottom:16px"><form data-form="task" class="row">
      <input name="title" placeholder="New task…" required style="flex:1;min-width:200px">
      <select name="priority"><option>High</option><option selected>Medium</option><option>Low</option></select>
      <input name="due" type="date"><button class="primary">Add</button>
      <button type="button" data-act="loadPlan">Load growth plan</button></form></div>
    <div class="board">${cols.map(c => `<div class="col card"><h3>${c} (${state.tasks.filter(t => t.status === c).length})</h3>
      ${state.tasks.filter(t => t.status === c).map(t => `<div class="task">${esc(t.title)}
        <div class="meta">${t.cat ? esc(t.cat) + ' · ' : ''}<span class="pill ${t.priority === 'High' ? 'high' : t.priority === 'Medium' ? 'med' : ''}">${t.priority}</span>
        ${t.due ? ' due ' + esc(t.due) : ''}</div>
        <div class="row" style="margin-top:6px">
          ${c !== 'To do' ? `<button class="link" data-act="mvTask" data-id="${t.id}" data-to="${cols[cols.indexOf(c) - 1]}">←</button>` : ''}
          ${c !== 'Done' ? `<button class="link" data-act="mvTask" data-id="${t.id}" data-to="${cols[cols.indexOf(c) + 1]}">→</button>` : ''}
          <button class="link" data-act="delTask" data-id="${t.id}">✕</button></div></div>`).join('')}</div>`).join('')}</div>`;
  },

  Content() {
    const ps = [...state.posts].sort((a, b) => a.date.localeCompare(b.date));
    return `<h1>Content Calendar</h1><p class="sub">Plan social posts that drive people to Truerated.co.</p>
    <div class="card wide" style="margin-bottom:16px"><form data-form="post" class="row">
      <select name="platform">${PLATFORMS.map(p => `<option>${p}</option>`).join('')}</select>
      <input name="date" type="date" value="${today()}" required>
      <input name="text" placeholder="Post idea / caption" required style="flex:1;min-width:220px">
      <button class="primary">Schedule</button></form></div>
    <div class="card wide"><table><tr><th>Date</th><th>Platform</th><th>Content</th><th>Status</th><th></th></tr>
    ${ps.map(p => `<tr><td>${esc(p.date)}</td><td>${esc(p.platform)}</td><td>${esc(p.text)}</td>
      <td><span class="pill ${p.status === 'Posted' ? 'ok' : ''}">${p.status}</span></td>
      <td>${p.status !== 'Posted' ? `<button class="link" data-act="posted" data-id="${p.id}">Mark posted</button>` : ''}
      <button class="link" data-act="delPost" data-id="${p.id}">✕</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No posts yet</td></tr>'}
    </table></div>`;
  },

  Moderation() {
    return `<h1>Moderation</h1><p class="sub">Track flagged reviews and user reports.</p>
    <div class="card wide" style="margin-bottom:16px"><form data-form="report" class="row">
      <input name="target" placeholder="Review / profile (link or name)" required style="flex:1;min-width:200px">
      <input name="reason" placeholder="Reason (spam, abuse, fake…)" required style="flex:1;min-width:200px">
      <button class="primary">Log report</button></form></div>
    <div class="card wide"><table><tr><th>Date</th><th>Target</th><th>Reason</th><th>Status</th><th></th></tr>
    ${state.reports.map(r => `<tr><td>${esc(r.date)}</td><td>${esc(r.target)}</td><td>${esc(r.reason)}</td>
      <td><span class="pill ${r.status === 'Open' ? 'med' : 'ok'}">${r.status}</span></td>
      <td>${r.status === 'Open' ? `<button class="link" data-act="resolve" data-id="${r.id}">Resolve</button>` : ''}
      <button class="link" data-act="delReport" data-id="${r.id}">✕</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No reports 🎉</td></tr>'}
    </table></div>`;
  },

  Uptime() {
    const c = state.checks, up = uptime(), ok = c.filter(x => x.ok);
    const avg = ok.length ? Math.round(ok.reduce((s, x) => s + x.ms, 0) / ok.length) : null;
    return `<h1>Uptime Monitor</h1><p class="sub">Checks ${SITE} from this browser every minute while this tab is open.</p>
    <div class="grid" style="margin-bottom:16px">
      <div class="card kpi"><div class="label">Uptime</div><div class="value">${up == null ? '—' : up.toFixed(1) + '%'}</div></div>
      <div class="card kpi"><div class="label">Avg response</div><div class="value">${avg == null ? '—' : avg + ' ms'}</div></div>
      <div class="card kpi"><div class="label">Checks logged</div><div class="value">${c.length}</div>
        <button data-act="check">Check now</button> <button class="link" data-act="clearChecks">Clear</button></div></div>
    <div class="card wide"><h2>Last ${Math.min(c.length, 120)} checks</h2>
      <div class="dots">${c.slice(-120).map(x => `<i class="${x.ok ? '' : 'f'}" title="${new Date(x.t).toLocaleString()} · ${x.ok ? x.ms + ' ms' : 'failed'}"></i>`).join('') || '<div class="empty">No checks yet</div>'}</div></div>`;
  },

  Data() {
    return `<h1>Data</h1><p class="sub">Everything is stored in this browser. Export a backup regularly or move it to another device.</p>
    <div class="card"><div class="row"><button class="primary" data-act="export">Export JSON</button>
      <label><button type="button" data-act="import">Import JSON</button></label>
      <button class="link" data-act="reset">Reset everything</button></div></div>`;
  },
};

// ---------- actions ----------
async function checkSite() {
  const t0 = performance.now(); let ok = true;
  try {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10000);
    await fetch(SITE + '/?_=' + Date.now(), { mode: 'no-cors', cache: 'no-store', signal: ctl.signal });
    clearTimeout(to);
  } catch { ok = false; }
  state.checks.push({ t: Date.now(), ok, ms: Math.round(performance.now() - t0) });
  state.checks = state.checks.slice(-2000);
  save(); if (['Overview', 'Uptime'].includes(current())) render();
}

const actions = {
  addMetric() {
    const name = prompt('Metric name (e.g. Newsletter subscribers)'); if (!name) return;
    const goal = parseFloat(prompt('Goal value (optional)') || '') || 0;
    state.metrics.push({ id: uid(), name, unit: '', goal, entries: [] });
  },
  setGoal(d) {
    const m = state.metrics.find(x => x.id === d.id), g = prompt('Goal for ' + m.name, m.goal);
    if (g !== null) m.goal = parseFloat(g) || 0;
  },
  delMetric(d) { if (confirm('Delete this metric and its history?')) state.metrics = state.metrics.filter(m => m.id !== d.id); },
  mvTask(d) { state.tasks.find(t => t.id === d.id).status = d.to; },
  loadPlan() {
    const have = new Set(state.tasks.map(t => t.title));
    GROWTH_PLAN.filter(p => !have.has(p[2])).forEach(([cat, priority, title]) =>
      state.tasks.push({ id: uid(), title, priority, cat, due: '', status: 'To do' }));
  },
  delTask(d) { state.tasks = state.tasks.filter(t => t.id !== d.id); },
  posted(d) { state.posts.find(p => p.id === d.id).status = 'Posted'; },
  delPost(d) { state.posts = state.posts.filter(p => p.id !== d.id); },
  resolve(d) { state.reports.find(r => r.id === d.id).status = 'Resolved'; },
  delReport(d) { state.reports = state.reports.filter(r => r.id !== d.id); },
  check() { checkSite(); return false; },
  liveRefresh() { liveRefresh(); return false; },
  liveSync() { syncMetrics(); },
  liveOut() { live.api.signOut(); live.stats = null; return false; },
  clearChecks() { state.checks = []; },
  export() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    a.download = `truerated-hub-${today()}.json`; a.click(); return false;
  },
  import() {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.json';
    i.onchange = async () => {
      try { state = { ...defaults(), ...JSON.parse(await i.files[0].text()) }; save(); render(); }
      catch { alert('That file is not a valid backup.'); }
    };
    i.click(); return false;
  },
  reset() { if (confirm('Erase all hub data?')) state = defaults(); },
};

const forms = {
  entry(f) {
    const m = state.metrics.find(x => x.id === f.metric.value); if (!m) return;
    m.entries = m.entries.filter(e => e.date !== f.date.value);
    m.entries.push({ date: f.date.value, value: parseFloat(f.value.value) });
    m.entries.sort((a, b) => a.date.localeCompare(b.date));
  },
  async liveLogin(f) {
    live.error = '';
    try { await live.api.signIn(f.email.value, f.pw.value); liveRefresh(); }
    catch (e) { live.error = 'Sign-in failed: ' + e.message; render(); }
  },
  task: f => state.tasks.push({ id: uid(), title: f.title.value, priority: f.priority.value, due: f.due.value, status: 'To do' }),
  post: f => state.posts.push({ id: uid(), platform: f.platform.value, date: f.date.value, text: f.text.value, status: 'Planned' }),
  report: f => state.reports.push({ id: uid(), target: f.target.value, reason: f.reason.value, date: today(), status: 'Open' }),
};

// ---------- wiring ----------
const current = () => VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'Overview';
function render() {
  const v = current();
  document.getElementById('nav').innerHTML = VIEWS.map(n => `<a href="#${n}" class="${n === v ? 'active' : ''}">${n}</a>`).join('');
  document.getElementById('view').innerHTML = views[v]();
  if (v === 'Live') liveInit();
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (actions[b.dataset.act](b.dataset) !== false) { save(); render(); }
});
document.addEventListener('submit', e => {
  const f = e.target; if (!f.dataset.form) return;
  e.preventDefault(); const r = forms[f.dataset.form](f); if (r instanceof Promise) return; save(); render();
});
window.addEventListener('hashchange', render);
render();
checkSite();
setInterval(checkSite, 60000);

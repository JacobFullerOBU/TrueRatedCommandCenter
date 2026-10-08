// Live data from the True Rated Firebase Realtime Database (project mediareviews-3cf32).
// Same public web config the site itself ships; access is governed by the DB security rules.
const V = '12.0.0', CDN = `https://www.gstatic.com/firebasejs/${V}/`;

export async function init(firebaseConfig) {
  const [{ initializeApp, getApps }, authMod, dbMod] = await Promise.all([
    import(CDN + 'firebase-app.js'), import(CDN + 'firebase-auth.js'), import(CDN + 'firebase-database.js'),
  ]);
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app), db = dbMod.getDatabase(app);

  const read = async path => { const s = await dbMod.get(dbMod.ref(db, path)); return s.exists() ? s.val() : null; };

  return {
    onUser: cb => authMod.onAuthStateChanged(auth, async u => {
      let isAdmin = false;
      if (u) { try { isAdmin = (await read(`reviewers/${u.uid}/role`)) === 'admin'; } catch { } }
      cb(u, isAdmin);
    }),
    signIn: (email, pw) => authMod.signInWithEmailAndPassword(auth, email, pw),
    signOut: () => authMod.signOut(auth),

    async stats() {
      const [reviews, reviewers, suggestions] = await Promise.all([read('reviews'), read('reviewers'), read('suggestions')]);
      const now = Date.now(), DAY = 864e5, dayKey = t => new Date(t).toISOString().slice(0, 10);
      const days = Array.from({ length: 30 }, (_, i) => dayKey(now - (29 - i) * DAY));
      const rPerDay = Object.fromEntries(days.map(d => [d, 0])), uPerDay = { ...rPerDay };

      let total = 0, sum = 0, rated = 0, last7 = 0, last30 = 0;
      const active7 = new Set(), byMedia = {}, byCat = {}, mediaRatings = {}, quotes = {};
      for (const [mediaId, group] of Object.entries(reviews || {})) {
        for (const r of Object.values(group || {})) {
          total++;
          const n = parseFloat(r.rating); if (!isNaN(n)) { sum += n; rated++; (mediaRatings[mediaId] ||= []).push(n); }
          const q = quote(r);
          if (q && !isNaN(n)) (quotes[mediaId] ||= []).push({ text: q, rating: n, userId: r.userId || '', date: (r.timestamp || '').slice(0, 10) });
          byMedia[mediaId] = (byMedia[mediaId] || 0) + 1;
          const cat = mediaId.split('_')[0]; byCat[cat] = (byCat[cat] || 0) + 1;
          const t = Date.parse(r.timestamp); if (isNaN(t)) continue;
          if (now - t <= 7 * DAY) { last7++; active7.add(r.userId || r.user || 'anon'); }
          if (now - t <= 30 * DAY) { last30++; if (rPerDay[dayKey(t)] != null) rPerDay[dayKey(t)]++; }
        }
      }
      let users = 0, newUsers7 = 0, newUsers30 = 0;
      for (const u of Object.values(reviewers || {})) {
        users++;
        const t = Date.parse(u.createdAt); if (isNaN(t)) continue;
        if (now - t <= 7 * DAY) newUsers7++;
        if (now - t <= 30 * DAY) { newUsers30++; if (uPerDay[dayKey(t)] != null) uPerDay[dayKey(t)]++; }
      }
      const sugg = Object.values(suggestions || {}).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
      const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 8);
      return {
        fetchedAt: now, users, newUsers7, newUsers30, total, last7, last30, active7: active7.size,
        avgRating: rated ? sum / rated : null,
        reviewsPerDay: days.map(d => ({ date: d, value: rPerDay[d] })),
        signupsPerDay: days.map(d => ({ date: d, value: uPerDay[d] })),
        postPicks: postPicks(byMedia, mediaRatings, quotes, reviewers || {}),
        topMedia: top(byMedia), categories: top(byCat), suggestions: sugg.slice(0, 15), suggestionCount: sugg.length,
      };
    },
  };
}

// ---------- post picks (feeds the "Make a post" generator) ----------
const CATS = { movies: 'Movie', movie: 'Movie', tv: 'TV', tv_shows: 'TV', games: 'Game', books: 'Book', music: 'Music' };

// Plain, spoiler-free review text that reads well on a post (skips one-word and essay-length reviews).
function quote(r) {
  if (r.spoilers) return '';
  const raw = r.text || String(r.reviewText || '').replace(/<[^>]*>/g, ' ');
  const t = raw.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length >= 25 && t.length <= 400 ? t : '';
}

export function titleFromId(mediaId) {
  const cat = Object.keys(CATS).sort((a, b) => b.length - a.length).find(c => mediaId.startsWith(c + '_'));
  const slug = cat ? mediaId.slice(cat.length + 1) : mediaId;
  const title = slug.replace(/_+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase());
  return { title: title || mediaId, category: cat ? CATS[cat] : '' };
}

function postPicks(byMedia, mediaRatings, quotes, reviewers) {
  const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
  return Object.entries(byMedia)
    .filter(([id]) => mediaRatings[id]?.length && quotes[id]?.length)
    .sort((a, b) => b[1] - a[1] || avg(mediaRatings[b[0]]) - avg(mediaRatings[a[0]]))
    .slice(0, 10)
    .map(([id, count]) => ({
      id, count, ...titleFromId(id), avg: avg(mediaRatings[id]),
      // Mid-length reviews first: long enough to say something, short enough to fit on the image.
      reviews: quotes[id]
        .sort((a, b) => Math.abs(a.text.length - 140) - Math.abs(b.text.length - 140))
        .slice(0, 5)
        .map(({ userId, ...q }) => ({ ...q, name: reviewers[userId]?.name || 'a True Rated reviewer' })),
    }));
}

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
      const active7 = new Set(), byMedia = {}, byCat = {};
      for (const [mediaId, group] of Object.entries(reviews || {})) {
        for (const r of Object.values(group || {})) {
          total++;
          const n = parseFloat(r.rating); if (!isNaN(n)) { sum += n; rated++; }
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
        topMedia: top(byMedia), categories: top(byCat), suggestions: sugg.slice(0, 15), suggestionCount: sugg.length,
      };
    },
  };
}

// Instagram Graph API client (official API; needs a Business/Creator account linked to a Facebook Page).
const API = 'https://graph.facebook.com/v21.0/';

async function call(path, params, token) {
  const q = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${API}${path}?${q}`);
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return j;
}

export async function fetchInstagram({ token, userId }) {
  const profile = await call(userId, { fields: 'username,followers_count,follows_count,media_count' }, token);
  const media = (await call(`${userId}/media`, {
    fields: 'caption,media_type,permalink,timestamp,like_count,comments_count', limit: 50,
  }, token)).data || [];

  // Insights are optional: availability varies by account size/API version.
  const insights = {};
  try {
    const r = await call(`${userId}/insights`, { metric: 'reach,profile_views', period: 'day', metric_type: 'total_value' }, token);
    for (const m of r.data || []) insights[m.name] = m.total_value?.value ?? null;
  } catch { /* leave empty */ }

  const followers = profile.followers_count || 0;
  const posts = media.map(m => {
    const interactions = (m.like_count || 0) + (m.comments_count || 0);
    return { ...m, interactions, er: followers ? interactions / followers * 100 : 0, date: new Date(m.timestamp) };
  });
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const cutoff = Date.now() - 30 * 864e5, recent = posts.filter(p => p.date >= cutoff);

  const dow = Array.from({ length: 7 }, () => []), hour = {};
  for (const p of posts) { dow[p.date.getDay()].push(p.er); (hour[p.date.getHours()] ||= []).push(p.er); }
  const byType = {};
  for (const p of posts) (byType[p.media_type] ||= []).push(p.er);

  const slim = p => ({
    caption: (p.caption || '').slice(0, 90), url: p.permalink, likes: p.like_count || 0,
    comments: p.comments_count || 0, type: p.media_type, er: p.er, date: p.timestamp.slice(0, 10),
  });
  return {
    fetchedAt: Date.now(), username: profile.username, followers, following: profile.follows_count,
    mediaCount: profile.media_count, insights,
    posts30: recent.length, avgLikes: avg(recent.map(p => p.like_count || 0)),
    avgComments: avg(recent.map(p => p.comments_count || 0)), avgER: avg(recent.map(p => p.er)),
    byDay: dow.map(a => avg(a)), dayCounts: dow.map(a => a.length),
    byType: Object.entries(byType).map(([t, a]) => [t, avg(a), a.length]),
    bestHours: Object.entries(hour).map(([h, a]) => [+h, avg(a), a.length]).filter(x => x[2] >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3),
    top: [...posts].sort((a, b) => b.interactions - a.interactions).slice(0, 5).map(slim),
    recent: posts.slice(0, 10).map(slim),
  };
}

// "Make a post": turns a top title + one of its reviews into a 1080x1080 Instagram image and caption.
const SIZE = 1080, PAD = 90;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TAGS = {
  Movie: '#movies #moviereview #filmtwitter #cinema',
  TV: '#tvshows #tvseries #bingewatching #whattowatch',
  Game: '#gaming #videogames #gamereview #gamer',
  Book: '#books #bookstagram #bookreview #reading',
  Music: '#music #albumreview #newmusic #nowplaying',
};

const hourLabel = h => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;

// Best hour (and weekday) from the Instagram tab's stats. Falls back to 6pm when there's no history yet.
export function bestTime(ig) {
  const top = ig?.bestHours?.[0];
  const days = (ig?.byDay || []).map((er, i) => [i, er, ig.dayCounts?.[i] || 0]).filter(d => d[2] >= 2);
  const day = days.sort((a, b) => b[1] - a[1])[0];
  const hour = top ? top[0] : 18;
  return {
    hour, day: day ? day[0] : null, fromData: !!top,
    label: (day ? DAYS[day[0]] + ' at ' : '') + hourLabel(hour),
    why: top ? `your posts at ${hourLabel(hour)} average ${top[1].toFixed(2)}% engagement (${top[2]} posts)`
      : 'no Instagram history yet, so this is a common evening default. Connect the Instagram tab for a real pick',
  };
}

// Next calendar date (YYYY-MM-DD, local) that matches the suggested weekday, or today/tomorrow by hour.
export function nextSlot(t, now = new Date()) {
  const d = new Date(now);
  if (t.day != null) d.setDate(d.getDate() + ((t.day - d.getDay() + 7) % 7 || (now.getHours() >= t.hour ? 7 : 0)));
  else if (now.getHours() >= t.hour) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function caption(pick, review) {
  const q = review.text.length > 220 ? review.text.slice(0, 217).replace(/\s+\S*$/, '') + '…' : review.text;
  return [
    `${pick.title} is sitting at ${pick.avg.toFixed(1)}/10 on True Rated after ${pick.count} review${pick.count === 1 ? '' : 's'} ⭐`,
    '',
    `"${q}" (${review.name}, ${review.rating}/10)`,
    '',
    `Is that too high, too low, or spot on? Drop your rating below 👇`,
    `Then post your own review at truerated.co (link in bio).`,
    '',
    `#truerated ${TAGS[pick.category] || '#reviews #ratings'}`,
  ].join('\n');
}

// Wraps text to a max width, shrinking the font until it fits in maxLines.
function fit(ctx, text, { max, min, weight, width, maxLines, family = 'system-ui, Segoe UI, sans-serif' }) {
  for (let size = max; ; size -= 2) {
    ctx.font = `${weight} ${size}px ${family}`;
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? line + ' ' + word : word;
      if (ctx.measureText(next).width > width && line) { lines.push(line); line = word; } else line = next;
    }
    lines.push(line);
    if (lines.length <= maxLines || size <= min) {
      if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '…'); }
      return { lines, size };
    }
  }
}

export function drawPost(canvas, pick, review) {
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d'), W = SIZE - PAD * 2;

  const bg = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  bg.addColorStop(0, '#1b1f2b'); bg.addColorStop(1, '#0d0f16');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#f5a524'; ctx.fillRect(0, 0, SIZE, 14);
  ctx.textBaseline = 'alphabetic';

  // Brand + category
  ctx.font = '700 40px system-ui, Segoe UI, sans-serif';
  ctx.fillStyle = '#f5a524'; ctx.fillText('★', PAD, 130);
  ctx.fillStyle = '#e8eaf2'; ctx.fillText('True Rated', PAD + 50, 130);
  if (pick.category) {
    ctx.font = '600 28px system-ui, Segoe UI, sans-serif';
    const label = pick.category.toUpperCase(), w = ctx.measureText(label).width + 40;
    ctx.fillStyle = '#2b3042'; ctx.beginPath(); ctx.roundRect(SIZE - PAD - w, 92, w, 50, 25); ctx.fill();
    ctx.fillStyle = '#e8eaf2'; ctx.fillText(label, SIZE - PAD - w + 20, 127);
  }

  // Title
  let y = 250;
  const t = fit(ctx, pick.title, { max: 92, min: 54, weight: 800, width: W, maxLines: 2 });
  ctx.fillStyle = '#ffffff';
  for (const l of t.lines) { ctx.fillText(l, PAD, y); y += t.size * 1.1; }

  // Score
  y += 30;
  ctx.font = '800 120px system-ui, Segoe UI, sans-serif'; ctx.fillStyle = '#f5a524';
  const score = pick.avg.toFixed(1); ctx.fillText(score, PAD, y + 90);
  const sw = ctx.measureText(score).width;
  ctx.font = '600 44px system-ui, Segoe UI, sans-serif'; ctx.fillStyle = '#8d95a8';
  ctx.fillText('/10', PAD + sw + 12, y + 90);
  ctx.font = '500 30px system-ui, Segoe UI, sans-serif';
  ctx.fillText(`True Rated score · ${pick.count} review${pick.count === 1 ? '' : 's'}`, PAD, y + 140);
  y += 210;

  // Quote card
  const cardTop = y, cardH = SIZE - 150 - cardTop;
  ctx.fillStyle = '#ffffff10'; ctx.beginPath(); ctx.roundRect(PAD - 30, cardTop, W + 60, cardH, 24); ctx.fill();
  ctx.fillStyle = '#f5a524'; ctx.fillRect(PAD - 30, cardTop, 8, cardH);
  const q = fit(ctx, `“${review.text}”`, { max: 44, min: 28, weight: 500, width: W - 20, maxLines: Math.floor((cardH - 110) / 50) });
  ctx.fillStyle = '#e8eaf2';
  let qy = cardTop + 30 + q.size;
  for (const l of q.lines) { ctx.fillText(l, PAD + 10, qy); qy += q.size * 1.3; }
  ctx.font = '600 30px system-ui, Segoe UI, sans-serif'; ctx.fillStyle = '#8d95a8';
  ctx.fillText(`${review.name} · ${review.rating}/10`, PAD + 10, cardTop + cardH - 30);

  // Footer
  ctx.font = '600 34px system-ui, Segoe UI, sans-serif'; ctx.fillStyle = '#e8eaf2';
  ctx.fillText('Rate it yourself at truerated.co', PAD, SIZE - 70);
}

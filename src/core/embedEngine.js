/**
 * ─── src/core/embedEngine.js ──────────────────────────────────────────────────
 * GUARDIAN V2 - GLOBAL JSON RENDERER
 * المصدر: مراجعة المدير التقني لتحويل الكود من "جيد" إلى "عالمي"
 */

function applyRandomChoices(str) {
  if (!str || typeof str !== 'string') return str;
  // pattern {choose:option1|option2|option3}
  return str.replace(/\{choose:([^}]+)\}/g, (_match, list) => {
    const parts = list.split('|');
    if (parts.length === 0) return '';
    const pick = parts[Math.floor(Math.random() * parts.length)];
    return pick;
  });
}

function parse(text, placeholders) {
  if (!text || typeof text !== 'string') return text;
  let out = text;

  // apply {choose:...} randomizer first so choices are resolved once
  out = applyRandomChoices(out);

  for (const [key, value] of Object.entries(placeholders)) {
    // دعم تبديل القيم حتى لو كانت أرقاماً أو كائنات بسيطة مع حماية من null
    const replacement = value !== null && value !== undefined ? String(value) : '';
    // Escape special regex characters in the key to ensure {user.avatar} matches correctly
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\{${escapedKey}\\}`, 'g'), replacement);
  }
  return out;
}

// دالة عالمية لتصحيح صيغة الألوان
function resolveColor(color) {
    if (!color) return 0x2f3136; // default Discord color
    if (typeof color === 'string' && color.startsWith('#')) {
        return parseInt(color.replace('#', ''), 16);
    }
    return color;
}

export function render(data = {}, placeholders = {}) {
  const out = {};

  // normalize placeholders and inject extra context variables
  let ph = {};
  if (placeholders && typeof placeholders === 'object') {
    ph = { ...placeholders };

    // if a guild member object was passed directly, derive extras
    const isMember = placeholders.user && placeholders.guild && placeholders.joinedAt;
    if (isMember) {
      const member = placeholders;
      ph.user_nick = ph.user_nick || member.nickname || member.user?.username || '';
      ph.user_joindate = ph.user_joindate || (member.joinedAt ? member.joinedAt.toISOString() : '');
      ph.server_boostcount = ph.server_boostcount || (member.guild?.premiumSubscriptionCount || 0);
      ph.server = ph.server || (member.guild?.name || '');
      
      // user join position
      try {
        const members = Array.from(member.guild.members.cache.values());
        members.sort((a, b) => a.joinedAt - b.joinedAt);
        const joinPosition = members.findIndex(m => m.id === member.id) + 1;
        ph['join_pos'] = joinPosition.toString();
      } catch (_e) {
        ph['join_pos'] = 'Unknown';
      }
      
      // user avatar
      try {
        ph['user.avatar'] = member.displayAvatarURL({ extension: "png", size: 256, forceStatic: false }) || '';
      } catch (_e) {
        ph['user.avatar'] = '';
      }
      
      // account age
      try {
        const createdAt = member.user.createdAt;
        const now = new Date();
        const ageMs = now - createdAt;
        const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
        ph['user.created_at'] = `${ageDays} days`;
      } catch (_e) {
        ph['user.created_at'] = 'Unknown';
      }
    }
  }

  // المعالجة الأساسية مع دعم التبديل العالمي
  if (data.title)       out.title       = parse(data.title, ph);
  if (data.description) out.description = parse(data.description, ph);
  if (data.url)         out.url         = data.url;
  
  // معالجة اللون بشكل عالمي
  out.color = resolveColor(data.color);

  if (data.timestamp) {
    out.timestamp = data.timestamp === true ? new Date().toISOString() : data.timestamp;
  }

  if (data.author && data.author.name) {
    out.author = {
      name:    parse(data.author.name,    placeholders),
      iconURL: parse(data.author.iconURL, placeholders),
      url:     data.author.url,
    };
  }

  if (data.thumbnail && (data.thumbnail.url || typeof data.thumbnail === 'string')) {
    const thumbUrl = typeof data.thumbnail === 'string' ? data.thumbnail : data.thumbnail.url;
    out.thumbnail = { url: parse(thumbUrl, placeholders) };
  }

  if (data.image && (data.image.url || typeof data.image === 'string')) {
    const imgUrl = typeof data.image === 'string' ? data.image : data.image.url;
    out.image = { url: parse(imgUrl, placeholders) };
  }

  if (data.footer && data.footer.text) {
    out.footer = {
      text:    parse(data.footer.text,    placeholders),
      iconURL: parse(data.footer.iconURL, placeholders),
    };
  }

  if (data.fields && Array.isArray(data.fields) && data.fields.length > 0) {
    out.fields = data.fields
      .filter(f => f.name && f.value)
      .map(f => ({
        name: parse(f.name, ph),
        value: parse(f.value, ph),
        inline: !!f.inline,
      }));
  }

  // fail-safe: Discord limits embed descriptions to 4096 characters
  // if (out.description && out.description.length > 4096) {
  //   return { error: 'EMBED_DESCRIPTION_TOO_LONG' };
  // }

  return out;
}

export default { render };

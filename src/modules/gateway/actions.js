/**
 * ─── src/modules/gateway/actions.js ──────────────────────────────────────────
 * ALYA BOT — GATEWAY ACTIONS (IRONCLAD)
 * الجمع بين منطق v2 الكامل + إصلاحات v4 الصحيحة
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { validateRaidShield } from './checker.js';
import { parseColor } from '../../utils/parseColor.js';
import { render as renderEmbed } from '../../core/embedEngine.js';
import { BoundedMap } from '../../utils/cache.js';
import { parsePlaceholders } from '../../utils/placeholders.js';

// ── Cache: embeds ثابتة تُخزَّن، embeds ديناميكية (ID Card) لا تُخزَّن أبداً
const embedCache = new BoundedMap(100);

// default dynamic ID card message used after successful verification
export const DEFAULT_ID_CARD = `**✅ Digital ID Pass Issued**

> 👤 **Member:** {user}
> 🏅 **Join Position:** #{join_pos}
> 📅 **Account Age:** {account_age} days
> 📥 **Joined Server:** {joined_at}
> 🟢 **Status:** Verified`;

// ── Guard: يمنع معالجة نفس المستخدم مرتين في نفس الوقت (button spam)
// المفتاح مركّب guildId:userId لعزل الـ guilds عن بعضها
const _processingUsers = new Set();

/**
 * امسح embed cache لـ guild معيّنة عند تغيير الإعدادات
 */
export function clearEmbedCache(guildId) {
  if (!guildId) return;
  const prefix = `${guildId}:`;
  for (const key of embedCache.keys()) {
    if (typeof key === 'string' && key.startsWith(prefix)) {
      embedCache.delete(key);
    }
  }
}

/**
 * ابنِ embed من إعدادات الـ page مع دعم cache ذكي
 *
 * @param {Object} config       - GatewayConfig document من MongoDB
 * @param {string} overrideMsg  - نص بديل للـ description (يدعم placeholders)
 * @param {string} pageKey      - 'success' | 'alreadyVerified' | 'error' | 'dm' | 'prompt'
 * @param {GuildMember} member  - Discord GuildMember (اختياري)
 */
export async function createEmbed(config, overrideMsg = '', pageKey = '', member = null) {
  const gid = config.guildId || '';

  // embeds الـ ID Card تحتوي بيانات خاصة بالمستخدم — لا تُخزَّن في cache أبداً
  const isDynamic = pageKey === 'success' && overrideMsg && overrideMsg.includes('{');

  // مفتاح الـ cache لا يشمل overrideMsg الخام لمنع cache poisoning
  const cacheKey = `${gid}:${member?.id || ''}:${pageKey}`;

  if (!isDynamic && embedCache.has(cacheKey)) {
    return embedCache.get(cacheKey);
  }

  // اختر الـ template المناسبة
  let template = null;
  if (config.templates && Array.isArray(config.templates)) {
    template = config.templates.find(t => t.name === pageKey);
  }
  if (!template) {
    const pageMap = {
      success:         config.successUI,
      alreadyVerified: config.alreadyVerifiedUI,
      error:           config.errorUI,
      dm:              config.dmUI,
      prompt:          config.promptUI,
    };
    template = pageMap[pageKey] || {};
  }

  const data = await renderEmbed(template, member);

  if (data?.error === 'EMBED_DESCRIPTION_TOO_LONG') {
    throw new Error('EMBED_DESCRIPTION_TOO_LONG');
  }

  // resolve placeholders in the template itself (title/description) when we have a member
  if (member && data) {
    if (data.title) {
      data.title = await parsePlaceholders(data.title, member);
    }
    if (data.description) {
      data.description = await parsePlaceholders(data.description, member);
    }
  }

  // حل الـ placeholders في الـ override message
  if (overrideMsg && data) {
    data.description = member
      ? await parsePlaceholders(overrideMsg, member)
      : overrideMsg;
  }

  // تطبيع اللون
  if (data?.color) {
    try { data.color = parseColor(data.color, '#2ecc71'); } catch (_e) {}
  }

  // صورة الأفاتار كـ thumbnail للـ ID Card (success page فقط)
  if (pageKey === 'success' && member?.user) {
    const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: false });
    if (avatarURL?.startsWith('https://')) {
      data.thumbnail = { url: avatarURL };
    }
  }

  // خزّن الـ embeds الثابتة فقط
  if (!isDynamic) {
    embedCache.set(cacheKey, data);
  }

  return data;
}

/**
 * المنطق الأساسي للتحقق من عضو
 *
 * @param {GuildMember} member
 * @param {Object}      config  - GatewayConfig من MongoDB
 * @param {string}      method  - 'button' | 'trigger' | 'slash'
 * @returns {{ success, alreadyVerified, processing, message, dmFailed }}
 */
export async function verifyMember(member, config, method) {
  // ── Guard: منع معالجة نفس المستخدم مرتين (race condition / button spam) ──
  if (member?.id && member?.guild?.id) {
    const key = `${member.guild.id}:${member.id}`;
    if (_processingUsers.has(key)) return { processing: true };
    _processingUsers.add(key);
  }

  try {
    // ── فحوصات الأساس ──
    if (!member?.user || !member?.roles || !member?.guild) {
      return { success: false, message: 'Invalid member or guild object' };
    }

    if (!config.unverifiedRole) {
      return { success: false, message: 'Unverified role not configured' };
    }

    // ── هل الـ member محقَّق مسبقاً؟ ──
    if (!member.roles.cache.has(config.unverifiedRole)) {
      return {
        success: false,
        message: config.alreadyVerifiedMsg || 'You are already verified in this server!',
        alreadyVerified: true,
      };
    }

    // ── Raid Shield (Account Age) ──
    if (config.raidMode) {
      const shield = validateRaidShield(member.user, config);
      if (!shield.passed) {
        console.log(`[Gateway] Raid Shield blocked ${member.user.tag}: ${shield.reason}`);
        return { success: false, message: shield.reason, alreadyVerified: false };
      }
    }

    // ── تحقق من وجود الرتب في الـ guild قبل المحاولة ──
    const verifiedRole   = member.guild.roles.cache.get(config.verifiedRole);
    const unverifiedRole = member.guild.roles.cache.get(config.unverifiedRole);

    if (!verifiedRole) {
      console.error(`[Gateway] CRITICAL: verifiedRole ${config.verifiedRole} not found in guild ${member.guild.id}`);
      return { success: false, message: 'Verified role not found. Contact an administrator.' };
    }
    if (!unverifiedRole) {
      console.error(`[Gateway] CRITICAL: unverifiedRole ${config.unverifiedRole} not found in guild ${member.guild.id}`);
      return { success: false, message: 'Unverified role not found. Contact an administrator.' };
    }

    // ── Step 1: أضف الـ Verified role أولاً (إذا فشل الحذف بعدين المستخدم مش يضيع) ──
    try {
      if (!member.roles.cache.has(config.verifiedRole)) {
        await member.roles.add(config.verifiedRole);
      }
    } catch (err) {
      return { success: false, message: `Failed to add verified role: ${err.message}` };
    }

    // ── Step 2: احذف الـ Unverified role (non-fatal إذا فشل) ──
    try {
      if (member.roles.cache.has(config.unverifiedRole)) {
        await member.roles.remove(config.unverifiedRole);
      }
    } catch (err) {
      console.error('[Gateway] Failed to remove unverified role (non-fatal):', err.message);
    }

    // ── Step 3: أرسل DM للمستخدم ──
    let dmFailed = false;
    try {
      const dmEmbed = await createEmbed(config, '', 'dm', member);
      let user = member.user;

      // fallback: fetch الـ user إذا مش موجود
      if (!user && member.client) {
        try { user = await member.client.users.fetch(member.id); }
        catch (fetchErr) { console.error('[Gateway] Failed to fetch user for DM:', fetchErr.message); }
      }

      if (!user) {
        dmFailed = true;
        console.error('[Gateway] Unable to resolve user object for DM delivery');
      } else {
        try {
          await user.send({ embeds: [dmEmbed] });
          console.log(`[Gateway] DM sent to ${user.tag || user.id}`);
        } catch (dmErr) {
          dmFailed = true;
          const reason = dmErr.code === 50007
            ? 'DMs disabled by user'
            : (dmErr.message || JSON.stringify(dmErr));
          console.error(`[Gateway] DM failed for ${user.tag || user.id} (${dmErr.code ?? 'UNKNOWN'}): ${reason}`);
        }
      }
    } catch (embedErr) {
      dmFailed = true;
      console.error('[Gateway] Failed to create DM embed:', embedErr.message);
    }

    return { success: true, message: 'Verification successful', alreadyVerified: false, dmFailed };

  } catch (err) {
    return { success: false, message: `Verification error: ${err.message}` };

  } finally {
    // ضمان إزالة الـ key بغض النظر عن النتيجة
    if (member?.id && member?.guild?.id) {
      _processingUsers.delete(`${member.guild.id}:${member.id}`);
    }
  }
}

/**
 * أرسل embed في channel (helper مساعد)
 */
export async function sendChannelEmbed(channel, config, message, member = null) {
  try {
    if (!channel?.send) return { success: false, message: 'Invalid channel' };
    const embed = await createEmbed(config, message, '', member);
    await channel.send({ embeds: [embed] });
    return { success: true };
  } catch (err) {
    return { success: false, message: `Failed to send embed: ${err.message}` };
  }
}
/**
 * Lockdown DM verification gauntlet. Uses interactive collectors.
 * @param {GuildMember} member
 * @param {Object} config
 */
export async function startDMVerification(member, config) {
  if (!member || !member.user) return false;
  try {
    const user = member.user;
    let dmChannel;
    try {
      dmChannel = await user.createDM();
    } catch {
      // fallback via send
      dmChannel = await user.send('👋 Starting lockdown verification...').then(m => m.channel).catch(() => null);
    }
    if (!dmChannel) return false;

    // Phase 1: Color
    const colors = ['Red', 'Green', 'Blue'];
    const target = colors[Math.floor(Math.random() * colors.length)];
    const shuffled = [...colors].sort(() => Math.random() - 0.5);
    const row = new ActionRowBuilder().addComponents(
      shuffled.map(c =>
        new ButtonBuilder()
          .setCustomId(`lockdown_color_${c.toLowerCase()}`)
          .setLabel(c)
          .setStyle(ButtonStyle.Primary)
      )
    );
    let passed1 = false;
    try {
      const prompt1 = await dmChannel.send({ content: `🔐 **Phase 1:** Select the **${target}** button.`, components: [row] });
      passed1 = await new Promise(resolve => {
        const filter = i => i.user.id === user.id && i.customId.startsWith('lockdown_color_');
        let collector;
        try {
          collector = prompt1.createMessageComponentCollector({ filter, time: 60000, max: 1 });
        } catch (_e) {
          return resolve(false);
        }
        collector.on('collect', i => {
          i.deferUpdate().catch(() => {});
          const pick = i.customId.replace('lockdown_color_', '');
          resolve(pick === target.toLowerCase());
        });
        collector.on('end', col => { if (col.size === 0) resolve(false); });
      });
    } catch (e) {
      passed1 = false;
    }
    if (!passed1) {
      await dmChannel.send('❌ Incorrect selection or timeout. Verification failed.');
      return false;
    }

    // Phase 2: Numeric code – inline spaced digits
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const spaced = code.split('').join(' ');
    await dmChannel.send(`🔢 **Phase 2:** Your code is: **${spaced}**`);
    const passed2 = await new Promise(resolve => {
      const collector = dmChannel.createMessageCollector({ filter: m => m.author.id === user.id, time: 60000, max: 1 });
      collector.on('collect', m => resolve(m.content.trim() === code));
      collector.on('end', col => resolve(false));
    });
    if (!passed2) {
      await dmChannel.send('❌ Incorrect code or timeout. Verification failed.');
      return false;
    }

    // Phase 3: Emoji animal
    const animals = [
      { name: 'lion', emoji: '🦁' },
      { name: 'cat', emoji: '🐱' },
      { name: 'dog', emoji: '🐶' },
      { name: 'elephant', emoji: '🐘' },
      { name: 'penguin', emoji: '🐧' },
    ];
    const pick = animals[Math.floor(Math.random() * animals.length)];
    await dmChannel.send(`🐾 **Phase 3:** What animal is this emoji? ${pick.emoji} (Write the name in English)`);
    const passed3 = await new Promise(resolve => {
      const collector = dmChannel.createMessageCollector({ filter: m => m.author.id === user.id, time: 60000, max: 1 });
      collector.on('collect', m => resolve(m.content.trim().toLowerCase() === pick.name.toLowerCase()));
      collector.on('end', col => resolve(false));
    });
    if (!passed3) {
      await dmChannel.send('❌ Wrong animal or timeout. Verification failed.');
      return false;
    }

    // Finalize via verifyMember and send ID card back in DM
    const result = await verifyMember(member, config, 'lockdown');
    if (result.success) {
      const idCardEmbed = await createEmbed(config, DEFAULT_ID_CARD, 'success', member);
      await dmChannel.send({ embeds: [idCardEmbed] }).catch(() => {});
      return true;
    } else {
      await dmChannel.send(`❌ Final verification failed: ${result.message || 'unknown error'}`);
      return false;
    }
  } catch (err) {
    console.error('[Gateway] startDMVerification error:', err);
    try { await member.user.send('⚠️ An error occurred during the lockdown verification process.'); } catch {};
    return false;
  }
}
/**
 * أرسل رسالة التحقق الأولية للـ channel (Prompt)
 * بتشمل زر Verify للـ button method، وتعرض الـ trigger word للـ trigger method
 */
export async function sendVerificationPrompt(channel, config, method) {
  try {
    if (!channel?.send) return { success: false, message: 'Invalid channel' };

    const methodInitial = config.initialMessage?.[method] || {};
    let title = methodInitial.title || '🔐 Server Verification';
    let desc  = methodInitial.desc  || 'Click the button below to verify your account.';
    const image = methodInitial.image || '';

    // إعدادات Prompt UI تتغلب على الـ defaults
    if (config.promptUI?.title) title = config.promptUI.title;
    if (config.promptUI?.desc)  desc  = config.promptUI.desc;

    // حل الـ placeholders بسياق الـ guild (بدون member محدد)
    try {
      const guildCtx = { guild: channel.guild };
      title = await parsePlaceholders(title, guildCtx);
      desc  = await parsePlaceholders(desc,  guildCtx);
    } catch (_e) {}

    const embed = {
      title,
      description: desc,
      color: parseColor(config.promptUI?.color, '#2ecc71'),
      footer: { text: 'Alya Bot' },
    };

    const imgUrl = config.promptUI?.image?.trim() || image?.trim();
    if (imgUrl) embed.image = { url: imgUrl };

    const payload = { embeds: [embed] };

    // button method: أضف زر Verify
    if (method === 'button') {
      payload.components = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('gateway_verify')
            .setLabel('Verify')
            .setStyle(ButtonStyle.Primary)
        ),
      ];
    }

    // trigger method: اعرض الـ trigger word في الـ description
    if (method === 'trigger' && config.methods?.trigger?.triggerWord) {
      embed.description += `\n\n**Trigger Word:** \`${config.methods.trigger.triggerWord}\``;
    }

    await channel.send(payload);
    return { success: true };
  } catch (err) {
    return { success: false, message: `Failed to send prompt: ${err.message}` };
  }
}
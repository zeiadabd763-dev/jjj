/**
 * Gateway Actions Module
 * Core verification logic with styled embed responses
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { validateRaidShield, getAccountAgeDays } from './checker.js';
import { parseColor } from '../../utils/parseColor.js';
import { render as renderEmbed } from '../../core/embedEngine.js';
import { BoundedMap } from '../../utils/cache.js';
import { parsePlaceholders } from '../../utils/placeholders.js';

// simple in-memory cache for rendered embeds; keyed the same way as before
const embedCache = new BoundedMap(100);

// simple guard to avoid processing the same user concurrently (e.g. button spam)
// key includes guild id to ensure conflicts in multiple servers are tracked separately
const _processingUsers = new Set();

/**
 * Remove cached embeds associated with a particular guildId.  Used after
 * configuration changes so users immediately see the new UI.
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
 * Create a styled embed with custom config
 * @param {Object} config - Gateway config from database
 * @param {string} message - Message content
 * @param {boolean} isSuccess - Whether this is a success embed
 * @returns {Object} Embed object
 */
/**
 * Build an embed using page-specific UI
 * @param {Object} config - Gateway config from DB
 * @param {string} overrideMessage - Optional message to use for description
 * @param {string} pageKey - 'success' | 'alreadyVerified' | 'error' | 'dm' | 'prompt' | undefined
 */
export async function createEmbed(config, overrideMessage = '', pageKey = '', member = null) {
  const gid = config.guildId || config.guild || '';
  const cacheKey = `${gid}:${member?.id || ''}:${pageKey}:${overrideMessage}`;

  if (embedCache.has(cacheKey)) {
    return embedCache.get(cacheKey);
  }

  // render the JSON template and then store it
  let template = null;
  if (config.templates && Array.isArray(config.templates)) {
    template = config.templates.find((t) => t.name === pageKey);
  }
  if (!template) {
    const map = {
      success: config.successUI,
      alreadyVerified: config.alreadyVerifiedUI,
      error: config.errorUI,
      dm: config.dmUI,
      prompt: config.promptUI,
    };
    template = map[pageKey] || {};
  }

  const data = await renderEmbed(template, member);
  if (data && data.error === 'EMBED_DESCRIPTION_TOO_LONG') {
    // bubble up so callers can catch and react
    throw new Error('EMBED_DESCRIPTION_TOO_LONG');
  }
  if (overrideMessage && data) {
    data.description = overrideMessage;
  }
  if (data.color) {
    try {
      data.color = parseColor(data.color, '#2ecc71');
    } catch (_e) {}
  }

  embedCache.set(cacheKey, data);
  return data;
}

/**
 * Core verification function - handles all verification logic
 * @param {GuildMember} member - Guild member to verify
 * @param {Object} config - Gateway config from database
 * @param {string} method - Verification method (button, trigger, slash)
 * @returns {Object} { success: boolean, message: string, alreadyVerified: boolean }
 */
export async function verifyMember(member, config, method) {
  // race condition guard: if we're already handling this user (in this guild), bail out
  if (member && member.id && member.guild && member.guild.id) {
    const key = `${member.guild.id}:${member.id}`;
    if (_processingUsers.has(key)) {
      return { success: false, message: 'Verification already in progress for this user' };
    }
    _processingUsers.add(key);
  }

  try {
    // GUARDS & SAFETY: Verify existence of member, guild, roles, and channel
    if (!member || !member.user || !member.roles || !member.guild) {
      return { success: false, message: 'Invalid member or guild object' };
    }

    // Gateway should only act when the member currently has the configured unverified role
    if (!config.unverifiedRole) {
      return { success: false, message: 'Unverified role not configured' };
    }

    const hasUnverified = member.roles.cache.has(config.unverifiedRole);
    const hasVerifiedRole = member.roles.cache.has(config.verifiedRole);

    // If the member does not have the unverified role, do not run gateway flows
    if (!hasUnverified) {
      return { 
        success: false, 
        message: config.alreadyVerifiedMsg || 'You are already verified in this server!',
        alreadyVerified: true,
      };
    }

    // Step 0: Check Raid Shield (Account Age)
    if (config.raidMode) {
      const raidShieldCheck = validateRaidShield(member.user, config);
      if (!raidShieldCheck.passed) {
        console.log(`[Gateway] Raid Shield blocked ${member.user.tag}: ${raidShieldCheck.reason}`);
        return { 
          success: false, 
          message: raidShieldCheck.reason,
          alreadyVerified: false 
        };
      }
    }

    // Step 1: Check that both roles exist before attempting swap
    const verifiedRole = member.guild.roles.cache.get(config.verifiedRole);
    const unverifiedRole = member.guild.roles.cache.get(config.unverifiedRole);
    
    if (!verifiedRole) {
      console.error(`CRITICAL: Gateway roles not found in server settings. Verified role ${config.verifiedRole} missing in guild ${member.guild.id}`);
      return { success: false, message: 'Verified role not found in server. Please contact an administrator.' };
    }
    
    if (!unverifiedRole) {
      console.error(`CRITICAL: Gateway roles not found in server settings. Unverified role ${config.unverifiedRole} missing in guild ${member.guild.id}`);
      return { success: false, message: 'Unverified role not found in server. Please contact an administrator.' };
    }

    // Step 2: Add verified role first (ensures user ends up with the correct role even
    // if removal of the unverified role fails)
    try {
      if (!member.roles.cache.has(config.verifiedRole)) {
        await member.roles.add(config.verifiedRole);
      }
    } catch (err) {
      return { success: false, message: `Failed to add verified role: ${err.message}` };
    }

    // Step 3: Remove unverified role after successful addition
    try {
      if (member.roles.cache.has(config.unverifiedRole)) {
        await member.roles.remove(config.unverifiedRole);
      }
    } catch (err) {
      console.error('[Gateway] Failed to remove unverified role:', err.message);
      // non-fatal
    }

    // Step 3: Send styled DM with Chic UI (robust error handling)
    let dmFailed = false;
    try {
      const dmEmbed = await createEmbed(config, '', 'dm', member);

      let user = member && member.user ? member.user : null;
      if (!user && member && member.client) {
        try {
          user = await member.client.users.fetch(member.id);
        } catch (fetchErr) {
          console.error('[Gateway] Failed to fetch user for DM:', fetchErr.message || fetchErr);
        }
      }

      if (!user) {
        dmFailed = true;
        console.error('[Gateway] Unable to resolve user object for DM delivery');
      } else {
        try {
          await user.send({ embeds: [dmEmbed] });
          console.log(`[Gateway] DM sent successfully to ${user.tag || user.id}`);
        } catch (dmErr) {
          dmFailed = true;
          const dmCode = dmErr && (dmErr.code || dmErr.httpStatus) ? (dmErr.code || dmErr.httpStatus) : 'UNKNOWN';
          const dmReason = dmErr && dmErr.code === 50007 ? 'User has DMs disabled' : (dmErr && dmErr.message ? dmErr.message : JSON.stringify(dmErr));
          console.error(`[Gateway] DM delivery failed for ${user.tag || user.id} (Code: ${dmCode}): ${dmReason}`);
        }
      }
    } catch (embedErr) {
      console.error('[Gateway] Failed to create DM embed:', embedErr && embedErr.message ? embedErr.message : embedErr);
      dmFailed = true;
    }

    return { 
      success: true, 
      message: 'Verification successful',
      alreadyVerified: false,
      dmFailed
    };
  } catch (err) {
    return { success: false, message: `Verification error: ${err.message}` };
  } finally {
    // ensure we remove from processing set regardless of outcome
    if (member && member.id && member.guild && member.guild.id) {
      _processingUsers.delete(`${member.guild.id}:${member.id}`);
    }
  }
}

/**
 * Send an embed response in a channel
 * @param {TextChannel} channel - Channel to send to
 * @param {Object} config - Gateway config
 * @param {string} message - Message to display
 * @returns {Object} { success: boolean, message: string }
 */
export async function sendChannelEmbed(channel, config, message, member = null) {
  try {
    if (!channel || !channel.send) {
      return { success: false, message: 'Invalid channel' };
    }

    const embed = await createEmbed(config, message, '', member);
    await channel.send({ embeds: [embed] });
    return { success: true, message: 'Embed sent' };
  } catch (err) {
    return { success: false, message: `Failed to send embed: ${err.message}` };
  }
}

/**
 * Send verification prompt to channel
 * @param {TextChannel} channel - Channel to send to
 * @param {Object} config - Gateway config
 * @param {string} method - The method being used (button, trigger, slash, join)
 * @returns {Object} { success: boolean, message: string }
 */
export async function sendVerificationPrompt(channel, config, method) {
  try {
    if (!channel || !channel.send) {
      return { success: false, message: 'Invalid channel' };
    }

    // Get initial message customization for this method, fall back to defaults
    const methodInitial = config.initialMessage?.[method] || {};
    let title = methodInitial.title || '🔐 Server Verification';
    let desc = methodInitial.desc || 'Click the button below to verify your account.';
    const image = methodInitial.image || '';

    // For prompt customization override
    if (config.promptUI?.title) title = config.promptUI.title;
    if (config.promptUI?.desc) desc = config.promptUI.desc;

    // parse placeholders using guild context only (no specific member yet)
    try {
      const fakeMember = { guild: channel.guild };
      title = await parsePlaceholders(title, fakeMember);
      desc = await parsePlaceholders(desc, fakeMember);
    } catch (e) {
      // ignore placeholder errors
    }

    const embed = {
      title,
      description: desc,
      color: parseColor(config.promptUI?.color, '#2ecc71'),
      footer: { text: 'Guardian Bot v4.0' },
    };

    if (image && image.trim()) {
      embed.image = { url: image };
    }
    if (config.promptUI?.image && config.promptUI.image.trim()) {
      embed.image = { url: config.promptUI.image };
    }

    const payload = {
      embeds: [embed],
    };

    // For button method, attach button
    if (method === 'button') {
      const button = new ButtonBuilder()
        .setCustomId('gateway_verify_button')
        .setLabel('Verify')
        .setStyle(ButtonStyle.Primary);

      const actionRow = new ActionRowBuilder()
        .addComponents(button);

      payload.components = [actionRow];
    }

    // For trigger method, add instructions
    if (method === 'trigger') {
      embed.description += `\n\n**Trigger Word:** \`${config.methods.trigger.triggerWord}\``;
    }

    await channel.send(payload);

    return { success: true, message: 'Verification prompt sent' };
  } catch (err) {
    return { success: false, message: `Failed to send prompt: ${err.message}` };
  }
}

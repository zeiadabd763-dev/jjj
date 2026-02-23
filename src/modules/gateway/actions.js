/**
 * Gateway Actions Module
 * Core verification logic with styled embed responses
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { validateRaidShield, getAccountAgeDays } from './checker.js';

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
export function createEmbed(config, overrideMessage = '', pageKey = '') {
  let page = {};
  
  // Select page object based on pageKey
  if (pageKey === 'success') page = config.successUI || {};
  else if (pageKey === 'alreadyVerified') page = config.alreadyVerifiedUI || {};
  else if (pageKey === 'error') page = config.errorUI || {};
  else if (pageKey === 'dm') page = config.dmUI || {};
  else if (pageKey === 'prompt') page = config.promptUI || {};

  // Default fallback values per page type
  let defaultTitle = '🔐 Server Verification';
  let defaultDesc = 'Verification processed.';
  let defaultColor = '#2ecc71';

  if (pageKey === 'success') {
    defaultTitle = '✅ Success';
    defaultDesc = 'You have been verified! Welcome to the server.';
    defaultColor = '#2ecc71';
  } else if (pageKey === 'alreadyVerified') {
    defaultTitle = '⏭️ Already Verified';
    defaultDesc = 'You are already verified in this server!';
    defaultColor = '#ffa500';
  } else if (pageKey === 'error') {
    defaultTitle = '❌ Error';
    defaultDesc = 'Verification failed.';
    defaultColor = '#ff0000';
  } else if (pageKey === 'dm') {
    defaultTitle = '✅ Welcome';
    defaultDesc = 'You have been verified! Welcome to the server.';
    defaultColor = '#2ecc71';
  }

  const title = page.title || defaultTitle;
  const description = overrideMessage || page.desc || defaultDesc;
  const colorHex = page.color || defaultColor;
  const color = parseInt((colorHex || '#2ecc71').replace('#', ''), 16);

  const embed = {
    title,
    description,
    color,
    footer: { text: 'Guardian Bot v4.0' },
  };

  const imageUrl = page.image || '';
  if (imageUrl && imageUrl.trim()) {
    embed.image = { url: imageUrl };
  }

  return embed;
}

/**
 * Core verification function - handles all verification logic
 * @param {GuildMember} member - Guild member to verify
 * @param {Object} config - Gateway config from database
 * @param {string} method - Verification method (button, trigger, slash)
 * @returns {Object} { success: boolean, message: string, alreadyVerified: boolean }
 */
export async function verifyMember(member, config, method) {
  try {
    if (!member || !member.user || !member.roles) {
      return { success: false, message: 'Invalid member object' };
    }

    // Check if member is already verified
    const hasVerifiedRole = member.roles.cache.has(config.verifiedRole);
    if (hasVerifiedRole) {
      return { 
        success: false, 
        message: config.alreadyVerifiedMsg || 'You are already verified in this server!',
        alreadyVerified: true 
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

    // Step 1: Add verified role
    try {
      const verifiedRole = member.guild.roles.cache.get(config.verifiedRole);
      if (!verifiedRole) {
        return { success: false, message: `Verified role not found` };
      }
      if (!member.roles.cache.has(config.verifiedRole)) {
        await member.roles.add(config.verifiedRole);
      }
    } catch (err) {
      return { success: false, message: `Failed to add verified role: ${err.message}` };
    }

    // Step 2: Remove unverified role
    try {
      const unverifiedRole = member.guild.roles.cache.get(config.unverifiedRole);
      if (unverifiedRole && member.roles.cache.has(config.unverifiedRole)) {
        await member.roles.remove(config.unverifiedRole);
      }
    } catch (err) {
      console.error('[Gateway] Failed to remove unverified role:', err.message);
      // Non-fatal error
    }

    // Step 3: Send styled DM with Chic UI (robust error handling)
    let dmFailed = false;
    try {
      const dmEmbed = createEmbed(config, '', 'dm');

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
  }
}

/**
 * Send an embed response in a channel
 * @param {TextChannel} channel - Channel to send to
 * @param {Object} config - Gateway config
 * @param {string} message - Message to display
 * @returns {Object} { success: boolean, message: string }
 */
export async function sendChannelEmbed(channel, config, message) {
  try {
    if (!channel || !channel.send) {
      return { success: false, message: 'Invalid channel' };
    }

    const embed = createEmbed(config, message);
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

    const embed = {
      title,
      description: desc,
      color: parseInt((config.promptUI?.color || '#2ecc71').replace('#', ''), 16),
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

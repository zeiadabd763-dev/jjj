/**
 * Gateway Actions Module
 * Handles role management, DM notifications, and reactions
 */

/**
 * Add verified role and remove unverified role
 * @param {GuildMember} member - Guild member to verify
 * @param {Object} config - Gateway config from database
 * @returns {Object} { success: boolean, message: string }
 */
export async function grantRoles(member, config) {
  try {
    const { verifiedRole, unverifiedRole } = config;
    
    if (!member || !member.roles) {
      return { success: false, message: 'Invalid member object' };
    }

    // Add verified role
    if (verifiedRole) {
      try {
        const role = member.guild.roles.cache.get(verifiedRole);
        if (role && !member.roles.cache.has(verifiedRole)) {
          await member.roles.add(verifiedRole);
        } else if (!role) {
          return { success: false, message: `Verified role ${verifiedRole} not found` };
        }
      } catch (err) {
        return { success: false, message: `Failed to add verified role: ${err.message}` };
      }
    }

    // Remove unverified role (penalty role)
    if (unverifiedRole) {
      try {
        const role = member.guild.roles.cache.get(unverifiedRole);
        if (role && member.roles.cache.has(unverifiedRole)) {
          await member.roles.remove(unverifiedRole);
        }
      } catch (err) {
        return { success: false, message: `Failed to remove unverified role: ${err.message}` };
      }
    }

    return { success: true, message: 'Roles updated successfully' };
  } catch (err) {
    return { success: false, message: `Role update failed: ${err.message}` };
  }
}

/**
 * Send a customized DM to the user
 * @param {User} user - Discord user to DM
 * @param {string} message - DM content
 * @param {Object} config - Gateway config (optional for embed details)
 * @returns {Object} { success: boolean, message: string }
 */
export async function sendVerificationDM(user, message, config = {}) {
  try {
    if (!user || !user.send) {
      return { success: false, message: 'Cannot DM this user' };
    }

    const fullMessage = message || config.successDM || 'You have been verified! Welcome to the server.';

    await user.send({
      content: fullMessage,
    });

    return { success: true, message: 'DM sent successfully' };
  } catch (err) {
    // If DM fails, return a non-fatal error (user might have DMs disabled)
    const dmFailReason = err.code === 50007 ? 'User has DMs disabled' : err.message;
    return { success: false, message: `Failed to send DM: ${dmFailReason}` };
  }
}

/**
 * React with ✅ to a message (for Trigger method confirmation)
 * @param {Message} message - Discord message to react to
 * @returns {Object} { success: boolean, message: string }
 */
export async function reactWithCheckmark(message) {
  try {
    if (!message || !message.react) {
      return { success: false, message: 'Invalid message object' };
    }

    await message.react('✅');
    return { success: true, message: 'Reacted with ✅' };
  } catch (err) {
    return { success: false, message: `Failed to react: ${err.message}` };
  }
}

/**
 * Perform complete verification flow
 * @param {GuildMember} member - Member to verify
 * @param {Message|null} triggerMessage - Message that triggered verification (if using trigger method)
 * @param {Object} config - Gateway config
 * @returns {Object} { success: boolean, rolesToast: Object, dmToast: Object, reactionToast: Object }
 */
export async function performVerificationFlow(member, triggerMessage, config) {
  const results = {
    success: true,
    rolesToast: null,
    dmToast: null,
    reactionToast: null,
  };

  // Step 1: Grant/Remove roles
  results.rolesToast = await grantRoles(member, config);
  if (!results.rolesToast.success) {
    results.success = false;
  }

  // Step 2: Send DM
  if (member.user) {
    results.dmToast = await sendVerificationDM(member.user, null, config);
    // DM failure is non-fatal, so don't set success to false
  }

  // Step 3: React to trigger message if using trigger method
  if (config.method === 'trigger' && triggerMessage) {
    results.reactionToast = await reactWithCheckmark(triggerMessage);
    if (!results.reactionToast.success) {
      results.success = false;
    }
  }

  return results;
}

/**
 * Send a verification button/embed to a channel
 * @param {Channel} channel - Channel to send to
 * @param {Object} config - Gateway config
 * @returns {Object} { success: boolean, message: string }
 */
export async function sendVerificationPrompt(channel, config) {
  try {
    if (!channel || !channel.send) {
      return { success: false, message: 'Invalid channel' };
    }

    const embed = {
      color: 0x2ecc71,
      title: config.embedTitle || '🔐 Server Verification',
      description: config.embedDescription || 'Click the button below to verify your account and gain access to the server.',
      footer: { text: 'Guardian Bot v4.0' },
    };

    const components = [];

    // For button method, create a button
    if (config.method === 'button') {
      components.push({
        type: 1, // ActionRow
        components: [
          {
            type: 2, // Button
            style: 1, // Primary
            label: 'Verify',
            custom_id: 'gateway_verify_button',
          },
        ],
      });
    }

    // For trigger method, add instructions
    if (config.method === 'trigger') {
      embed.description += `\n\n**Type this to verify:** \`${config.triggerWord}\``;
    }

    const sent = await channel.send({
      embeds: [embed],
      components: components.length > 0 ? components : undefined,
    });

    return { success: true, message: 'Verification prompt sent' };
  } catch (err) {
    return { success: false, message: `Failed to send prompt: ${err.message}` };
  }
}

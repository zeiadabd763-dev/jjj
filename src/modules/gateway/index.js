/**
 * Gateway Module - Main Entry Point
 * Handles verification for 5 methods: Button, Reaction, Trigger (Word), Slash, and Join-check
 */

import GatewayConfig from './schema.js';
import {
  calculateTrustScore,
  checkTriggerWord,
  validateRaidShield,
  performVerificationCheck,
  getAccountAgeDays,
} from './checker.js';
import {
  grantRoles,
  sendVerificationDM,
  reactWithCheckmark,
  performVerificationFlow,
  sendVerificationPrompt,
} from './actions.js';

/**
 * Gateway Module Factory
 * @param {Client} client - Discord client
 * @returns {Object} Gateway module with handlers
 */
export default function GatewayModule(client) {
  return {
    /**
     * Handle button interactions
     */
    async handleInteraction(interaction) {
      try {
        const config = await GatewayConfig.findOne({ guildId: interaction.guildId });
        if (!config || !config.enabled) return;

        // Only handle gateway-related buttons
        if (!interaction.customId.startsWith('gateway_')) return;

        if (interaction.customId === 'gateway_verify_button') {
          await this.verifyUser(interaction.member, interaction, config, 'button');
          await interaction.deferReply({ ephemeral: true }).catch(() => {});
          await interaction.editReply({ content: '✓ Verification processed!' }).catch(() => {});
        }
      } catch (err) {
        console.error('[Gateway] Interaction handler error:', err);
        try {
          if (interaction.isRepliable() && !interaction.replied) {
            await interaction.reply({ content: 'An error occurred during verification.', ephemeral: true });
          }
        } catch (e) {
          // swallow
        }
      }
    },

    /**
     * Handle message events (for trigger word detection)
     */
    async handleMessage(message) {
      try {
        // Allow module to decide how to handle messages (including bot messages)
        const config = await GatewayConfig.findOne({ guildId: message.guildId });
        if (!config || !config.enabled) return;

        // Handle trigger word method
        if (config.method === 'trigger') {
          // Ignore empty messages
          const content = (message.content || '').toString();
          if (!content) return;

          if (checkTriggerWord(content, config.triggerWord)) {
            // First react with the configured emoji
            try {
              const emoji = config.reactionEmoji || '✅';
              await message.react(emoji).catch(() => {});
            } catch (err) {
              console.error('[Gateway] Failed to react to trigger message:', err.message);
            }

            // Then perform verification
            await this.verifyUser(message.member, message, config, 'trigger');
          }
        }
      } catch (err) {
        console.error('[Gateway] Message handler error:', err);
      }
    },

    /**
     * Handle reaction add events
     * @param {MessageReaction} reaction
     * @param {User} user
     */
    async handleReaction(reaction, user) {
      try {
        if (!reaction || !reaction.message) return;
        if (user?.bot) return;

        const message = reaction.message;
        const guildId = message.guildId;
        if (!guildId) return;

        const config = await GatewayConfig.findOne({ guildId });
        if (!config || !config.enabled) return;

        // Only handle reaction method
        if (config.method !== 'reaction') return;

        const emoji = config.reactionEmoji || '✅';
        const matches = (reaction.emoji && (reaction.emoji.name === emoji || reaction.emoji.toString() === emoji));
        if (!matches) return;

        // Ensure reaction happened in configured channel and on a bot message
        if (message.channelId !== config.channelId) return;
        if (!message.author || message.author.id !== client.user?.id) return;

        // Fetch member for the reacting user
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;
        const member = await guild.members.fetch(user.id).catch(() => null);
        if (!member) return;

        // Perform verification
        await this.verifyUser(member, message, config, 'reaction');
      } catch (err) {
        console.error('[Gateway] Reaction handler error:', err);
      }
    },

    /**
     * Core verification logic
     * Checks conditions, grants roles, sends DM, and handles reactions
     */
    async verifyUser(member, interaction, config, method) {
      try {
        if (!member || !member.user) {
          console.error('[Gateway] Invalid member object');
          return;
        }

        // Perform comprehensive verification check
        const check = performVerificationCheck(member.user, member, config);

        // If raid shield failed, deny verification
        if (!check.verified) {
          if (interaction.reply) {
            await interaction.reply({
              content: `❌ Verification failed: ${check.errors.join(', ')}`,
              ephemeral: true,
            });
          }
          return;
        }

        // Detect if second parameter is a Message (has content) or Interaction
        // Message objects have a 'content' property, Interaction objects don't
        const triggerMessage = (interaction && typeof interaction.content === 'string') ? interaction : null;
        
        // Execute verification flow: add roles, send DM, react if needed
        const flow = await performVerificationFlow(member, triggerMessage, config);

        // Log results
        if (method === 'trigger') {
          console.log(`[Gateway] User ${member.user.tag} verified via trigger word. Trust Score: ${check.trustScore}`);
        } else {
          console.log(`[Gateway] User ${member.user.tag} verified via ${method}. Trust Score: ${check.trustScore}`);
        }

        // Send success reply if this is an interaction
        if (interaction.reply && typeof interaction.reply === 'function') {
          await interaction.reply({
            content: `✅ Verification successful! Welcome to the server.`,
            ephemeral: true,
          });
        }
      } catch (err) {
        console.error('[Gateway] Verification error:', err);
      }
    },

    /**
     * Utility: Get gateway config for a guild
     */
    async getConfig(guildId) {
      try {
        return await GatewayConfig.findOne({ guildId });
      } catch (err) {
        console.error('[Gateway] Error fetching config:', err);
        return null;
      }
    },

    /**
     * Utility: Create or update gateway config
     */
    async setConfig(guildId, configData) {
      try {
        const config = await GatewayConfig.findOneAndUpdate(
          { guildId },
          { ...configData, guildId },
          { upsert: true, new: true }
        );
        return config;
      } catch (err) {
        console.error('[Gateway] Error updating config:', err);
        return null;
      }
    },

    /**
     * Command: Setup gateway for a guild
     * Usage in a slash command: /gateway setup <method> <verified_role> <unverified_role> <channel>
     */
    async setupCommand(guildId, method, verifiedRoleId, unverifiedRoleId, channelId, triggerWord = '', successDM = undefined, embedTitle = undefined, embedDescription = undefined) {
      try {
        const configData = {
          method,
          verifiedRole: verifiedRoleId,
          unverifiedRole: unverifiedRoleId,
          channelId,
          triggerWord,
          enabled: true,
        };

        // Add optional parameters if provided
        if (successDM) configData.successDM = successDM;
        if (embedTitle) configData.embedTitle = embedTitle;
        if (embedDescription) configData.embedDescription = embedDescription;

        const config = await this.setConfig(guildId, configData);

        // Send verification prompt to the channel
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
          const channel = guild.channels.cache.get(channelId);
          if (channel) {
            const promptResult = await sendVerificationPrompt(channel, config);

            // If using reaction method, we already attempted to add the reaction in sendVerificationPrompt
            if (config.method === 'reaction') {
              console.log('[Gateway] Reaction prompt created and reaction pre-added (if possible)');
            }
          }
        }

        return { success: true, config };
      } catch (err) {
        console.error('[Gateway] Setup error:', err);
        return { success: false, error: err.message };
      }
    },

    /**
     * Command: Disable gateway for a guild
     */
    async disableCommand(guildId) {
      try {
        const config = await GatewayConfig.findOneAndUpdate(
          { guildId },
          { enabled: false },
          { new: true }
        );
        return { success: true, config };
      } catch (err) {
        console.error('[Gateway] Disable error:', err);
        return { success: false, error: err.message };
      }
    },
  };
}

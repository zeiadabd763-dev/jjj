/**
 * Gateway Module - Multi-Method Concurrent Handler
 * Supports Button, Trigger, Slash, and Join methods simultaneously
 */

import GatewayConfig from './schema.js';
import { checkTriggerWord } from './checker.js';
import { verifyMember, sendVerificationPrompt, createEmbed } from './actions.js';

/**
 * Gateway Module Factory
 * @param {Client} client - Discord client
 * @returns {Object} Gateway module with handlers and commands
 */
export default function GatewayModule(client) {
  return {
    /**
     * Handle button interactions (concurrent with other methods)
     */
    async handleInteraction(interaction) {
      try {
        const config = await GatewayConfig.findOne({ guildId: interaction.guildId });
        if (!config || !config.enabled) {
          return;
        }

        // Check if button method is enabled
        if (interaction.customId === 'gateway_verify_button' && config.methods?.button?.enabled) {
          console.log(`[Gateway] Button pressed by ${interaction.user.tag}`);
          
          // Button is locked to its channel
          if (interaction.channelId !== config.methods.button.channel) {
            console.log(`[Gateway] Button in wrong channel, ignoring`);
            return;
          }

          const result = await verifyMember(interaction.member, config, 'button');

          if (result.alreadyVerified) {
            const embed = createEmbed(config, result.message, 'alreadyVerified');
            // Button success is EPHEMERAL (private)
            await interaction.reply({ embeds: [embed], ephemeral: true });
          } else if (result.success) {
            const embed = createEmbed(config, '✅ Verification successful! Welcome to the server.', 'success');
            // Button success is EPHEMERAL (private)
            await interaction.reply({ embeds: [embed], ephemeral: true });
            
            // Send DM
            if (result.dmFailed) {
              try {
                await interaction.followUp({
                  content: `⚠️ I couldn't send you a verification DM. Please open your Privacy Settings.`,
                  ephemeral: true,
                });
              } catch (followUpErr) {
                console.error('[Gateway] Failed to send DM failure notification:', followUpErr.message);
              }
            }
          } else {
            await interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
          }
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
     * Handle message events (trigger word) - concurrent with other methods
     */
    async handleMessage(message) {
      try {
        const config = await GatewayConfig.findOne({ guildId: message.guildId });
        if (!config || !config.enabled) {
          return;
        }

        // Check if trigger method is enabled
        if (!config.methods?.trigger?.enabled || !config.methods.trigger.triggerWord) {
          return;
        }

        // Trigger is locked to its channel
        if (message.channelId !== config.methods.trigger.channel) {
          return;
        }

        const content = (message.content || '').toString().trim().toLowerCase();
        const triggerWordLower = (config.methods.trigger.triggerWord || '').toString().trim().toLowerCase();
        
        if (!content) {
          return;
        }

        if (checkTriggerWord(content, triggerWordLower)) {
          console.log(`[Gateway] Trigger word matched for ${message.author.tag}`);
          
          try {
            await message.react('✅').catch(() => {});
          } catch (err) {
            console.error('[Gateway] Failed to react:', err.message);
          }

          const result = await verifyMember(message.member, config, 'trigger');
          
          if (result.alreadyVerified || result.success) {
            try {
              const pageKey = result.alreadyVerified ? 'alreadyVerified' : 'success';
              const msg = result.alreadyVerified ? (result.message || '') : '✅ Verification successful! Welcome to the server.';
              const channelEmbed = createEmbed(config, msg, pageKey);
              // Trigger success is PUBLIC
              await message.channel.send({ embeds: [channelEmbed] });
            } catch (sendErr) {
              console.error('[Gateway] Failed to send channel embed:', sendErr.message);
            }

            if (result.dmFailed) {
              try {
                await message.reply({
                  content: `❌ ${message.member.user.toString()}, I couldn't send you a DM. Please open your Privacy Settings.`,
                });
              } catch (replyErr) {
                console.error('[Gateway] Failed to send DM failure notification:', replyErr.message);
              }
            }
          } else {
            try {
              const errEmbed = createEmbed(config, result.message || 'Verification failed.', 'error');
              // Error is PUBLIC
              await message.channel.send({ embeds: [errEmbed] });
            } catch (errSend) {
              console.error('[Gateway] Failed to send error embed:', errSend.message);
            }
          }
        }
      } catch (err) {
        console.error('[Gateway] Message handler error:', err);
      }
    },

    /**
     * Handle member join (join method) - concurrent with other methods
     */
    async handleMemberAdd(member) {
      try {
        const config = await GatewayConfig.findOne({ guildId: member.guild.id });
        if (!config || !config.enabled || !config.methods?.join?.enabled) {
          return;
        }

        console.log(`[Gateway] Join method triggered for ${member.user.tag}`);

        const result = await verifyMember(member, config, 'join');
        
        if (result.success) {
          console.log(`[Gateway] ${member.user.tag} auto-verified on join`);
          // Join method doesn't send a message - it's silent
        } else if (!result.alreadyVerified) {
          console.log(`[Gateway] Join verification failed for ${member.user.tag}: ${result.message}`);
        }
      } catch (err) {
        console.error('[Gateway] Member add handler error:', err);
      }
    },

    /**
     * Setup a verification method (can add multiple methods)
     */
    async setupMethod(guildId, method, channelId = '', triggerWord = '', verifiedRoleId, unverifiedRoleId) {
      try {
        const config = await GatewayConfig.findOne({ guildId }) || {};

        // Use provided roles or keep existing ones
        const finalVerifiedRole = verifiedRoleId || config.verifiedRole;
        const finalUnverifiedRole = unverifiedRoleId || config.unverifiedRole;

        if (!finalVerifiedRole || !finalUnverifiedRole) {
          return { success: false, error: 'Verified and Unverified roles are required for initial setup' };
        }

        // Update the method configuration
        const updateData = {
          guildId,
          verifiedRole: finalVerifiedRole,
          unverifiedRole: finalUnverifiedRole,
          enabled: true,
        };

        if (method === 'button') {
          updateData[`methods.button.enabled`] = true;
          updateData[`methods.button.channel`] = channelId;
        } else if (method === 'trigger') {
          updateData[`methods.trigger.enabled`] = true;
          updateData[`methods.trigger.channel`] = channelId;
          updateData[`methods.trigger.triggerWord`] = triggerWord;
        } else if (method === 'slash') {
          updateData[`methods.slash.enabled`] = true;
          updateData[`methods.slash.channel`] = channelId;
        } else if (method === 'join') {
          updateData[`methods.join.enabled`] = true;
        }

        const newConfig = await GatewayConfig.findOneAndUpdate(
          { guildId },
          updateData,
          { upsert: true, new: true }
        );

        console.log(`[Gateway] Method '${method}' configured for guild ${guildId}`);

        // Send verification prompt to channel if it's button, trigger, or slash
        if ((method === 'button' || method === 'trigger' || method === 'slash') && channelId) {
          const guild = client.guilds.cache.get(guildId);
          if (guild) {
            const channel = guild.channels.cache.get(channelId);
            if (channel) {
              console.log(`[Gateway] Sending verification prompt to ${channel.name}`);
              await sendVerificationPrompt(channel, newConfig, method);
            }
          }
        }

        return { success: true, config: newConfig };
      } catch (err) {
        console.error('[Gateway] Setup error:', err);
        return { success: false, error: err.message };
      }
    },

    /**
     * Customize a response page (success, alreadyVerified, error, dm, prompt)
     */
    async customizePageCommand(guildId, page, title, description, colorHex, imageUrl) {
      try {
        const allowed = ['success', 'alreadyVerified', 'error', 'dm', 'prompt'];
        if (!allowed.includes(page)) {
          return { success: false, error: 'Invalid page' };
        }

        const updateData = {};
        
        // Map pages to database fields
        let fieldPrefix = '';
        if (page === 'success') fieldPrefix = 'successUI';
        else if (page === 'alreadyVerified') fieldPrefix = 'alreadyVerifiedUI';
        else if (page === 'error') fieldPrefix = 'errorUI';
        else if (page === 'dm') fieldPrefix = 'dmUI';
        else if (page === 'prompt') fieldPrefix = 'promptUI';

        if (title !== undefined && title !== null) updateData[`${fieldPrefix}.title`] = title;
        if (description !== undefined && description !== null) updateData[`${fieldPrefix}.desc`] = description;
        if (colorHex !== undefined && colorHex !== null) updateData[`${fieldPrefix}.color`] = colorHex;
        if (imageUrl !== undefined && imageUrl !== null) updateData[`${fieldPrefix}.image`] = imageUrl;

        const config = await GatewayConfig.findOneAndUpdate(
          { guildId },
          { $set: updateData },
          { new: true }
        );

        return { success: true, config };
      } catch (err) {
        console.error('[Gateway] Customize page error:', err);
        return { success: false, error: err.message };
      }
    },

    /**
     * Customize initial message (prompt) for a specific method
     */
    async customizeInitialMessageCommand(guildId, method, promptTitle, promptDesc) {
      try {
        const updateData = {};

        if (promptTitle !== undefined && promptTitle !== null) {
          updateData[`initialMessage.${method}.title`] = promptTitle;
        }
        if (promptDesc !== undefined && promptDesc !== null) {
          updateData[`initialMessage.${method}.desc`] = promptDesc;
        }

        const config = await GatewayConfig.findOneAndUpdate(
          { guildId },
          { $set: updateData },
          { new: true }
        );

        console.log(`[Gateway] Customized initial message for ${method}`);
        return { success: true, config };
      } catch (err) {
        console.error('[Gateway] Customize initial message error:', err);
        return { success: false, error: err.message };
      }
    },
  };
}

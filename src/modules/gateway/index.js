import GatewayConfig from './schema.js';
import { checkTriggerWord } from './checker.js';
import { verifyMember, createEmbed } from './actions.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export default function GatewayModule(client) {
  return {
    // message-based trigger word handler (legacy method)
    async handleMessage(message) {
      try {
        const config = await GatewayConfig.findOne({ guildId: message.guildId });
        if (!config?.enabled || !config.methods?.trigger?.enabled) return;
        if (message.channelId !== config.methods.trigger.channel) return;

        const content = message.content.trim().toLowerCase();
        if (!checkTriggerWord(content, config.methods.trigger.triggerWord.toLowerCase())) return;

        const result = await verifyMember(message.member, config, 'trigger');
        if (result.processing) return;

        if (result.alreadyVerified) {
          const alreadyEmbed = await createEmbed(config, result.message, 'alreadyVerified', message.member);
          return message.channel.send({ embeds: [alreadyEmbed] });
        }

        if (result.success) {
          const loadingEmbed = await createEmbed(config, '🔄 Processing...', 'success', message.member);
          const loadingMsg = await message.channel.send({ embeds: [loadingEmbed] });
          if (message.deletable) await message.delete().catch(() => {});
          await new Promise(r => setTimeout(r, 2000));
          const idCardMsg = `**✅ Verification Complete**\n\n> 👤 **Member:** {user}\n> 🏅 **Join Position:** #{join_pos}\n> 📅 **Account Age:** {account_age} days\n> 🟢 **Status:** Verified`;
          const idCardEmbed = await createEmbed(config, idCardMsg, 'success', message.member);
          await loadingMsg.edit({ embeds: [idCardEmbed] });
          return;
        }

        // failure case
        const errorEmbed = await createEmbed(config, result.message || 'Verification failed.', 'error', message.member);
        return message.channel.send({ embeds: [errorEmbed] });
      } catch (err) {
        console.error('[GatewayModule.handleMessage] Error:', err);
      }
    },

    // handle button/select interactions for verification
    async handleInteraction(interaction) {
      try {
        const config = await GatewayConfig.findOne({ guildId: interaction.guildId });
        if (!config?.enabled) return;

        let method = null;
        if (interaction.isButton() || interaction.isSelectMenu()) {
          method = 'button';
          if (!config.methods?.button?.enabled) return;
          if (interaction.channelId !== config.methods.button.channel) return;
        } else {
          return; // not relevant
        }

        const result = await verifyMember(interaction.member, config, method);
        if (result.processing) {
          if (interaction.isRepliable()) {
            await interaction.reply({ content: '⏳ Please wait...', ephemeral: true }).catch(() => {});
          }
          return;
        }

        if (result.alreadyVerified) {
          const embed = await createEmbed(config, result.message, 'alreadyVerified', interaction.member);
          return interaction.reply({ embeds: [embed] });
        }

        if (result.success) {
          const loadingEmbed = await createEmbed(config, '🔄 Processing...', 'success', interaction.member);
          await interaction.reply({ embeds: [loadingEmbed] });
          await new Promise(r => setTimeout(r, 2000));
          const idCardMsg = `**✅ Verification Complete**\n\n> 👤 **Member:** {user}\n> 🏅 **Join Position:** #{join_pos}\n> 📅 **Account Age:** {account_age} days\n> 🟢 **Status:** Verified`;
          const idCardEmbed = await createEmbed(config, idCardMsg, 'success', interaction.member);
          await interaction.editReply({ embeds: [idCardEmbed] });
          return;
        }

        const errorEmbed = await createEmbed(config, result.message || 'Verification failed.', 'error', interaction.member);
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      } catch (err) {
        console.error('[GatewayModule.handleInteraction] Error:', err);
      }
    },

    // admin helper: configure or update a verification method
    async setupMethod(
      guildId,
      method,
      channelId = '',
      triggerWord = '',
      verifiedRoleId,
      unverifiedRoleId
    ) {
      try {
        const opts = { upsert: true, new: true, setDefaultsOnInsert: true };
        let cfg = await GatewayConfig.findOneAndUpdate({ guildId }, { guildId }, opts);
        if (!cfg) cfg = new GatewayConfig({ guildId });

        if (verifiedRoleId) cfg.verifiedRole = verifiedRoleId;
        if (unverifiedRoleId) cfg.unverifiedRole = unverifiedRoleId;

        if (!cfg.methods) cfg.methods = {};
        if (!cfg.methods[method]) cfg.methods[method] = {};

        cfg.methods[method].enabled = true;
        if (channelId) cfg.methods[method].channel = channelId;
        if (method === 'trigger' && triggerWord !== undefined) {
          cfg.methods.trigger.triggerWord = triggerWord;
        }

        cfg.enabled = true;
        await cfg.save();

        // send initial prompt message if channel provided
        if (channelId && client.channels) {
          try {
            const chan = await client.channels.fetch(channelId).catch(() => null);
            if (chan && chan.isTextBased()) {
              const embed = await createEmbed(cfg, '', 'prompt');
              const msgOptions = { embeds: [embed] };
              if (method === 'button') {
                const row = new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                    .setCustomId('gateway_verify')
                    .setLabel('Verify')
                    .setStyle(ButtonStyle.Primary)
                );
                msgOptions.components = [row];
              }
              await chan.send(msgOptions).catch(() => {});
            }
          } catch (_e) {}
        }

        return { success: true, config: cfg };
      } catch (err) {
        console.error('[GatewayModule.setupMethod] Error:', err);
        return { success: false, error: err.message || 'Failed to set up method' };
      }
    },

    async customizePageCommand(guildId, page, title, description, color, imageUrl) {
      try {
        const cfg = await GatewayConfig.findOneAndUpdate(
          { guildId },
          { guildId },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        const key = `${page}UI`;
        if (!cfg[key]) cfg[key] = {};

        if (title !== undefined && title !== null) cfg[key].title = title;
        if (description !== undefined && description !== null) cfg[key].desc = description;
        if (color !== undefined && color !== null) cfg[key].color = color;
        if (imageUrl !== undefined && imageUrl !== null) cfg[key].image = imageUrl;

        await cfg.save();
        return { success: true, config: cfg };
      } catch (err) {
        console.error('[GatewayModule.customizePageCommand] Error:', err);
        return { success: false, error: err.message || 'Unable to customize page' };
      }
    },

    async customizeInitialMessageCommand(guildId, method, promptTitle, promptDesc) {
      try {
        const cfg = await GatewayConfig.findOneAndUpdate(
          { guildId },
          { guildId },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        if (!cfg.initialMessage) cfg.initialMessage = {};
        if (!cfg.initialMessage[method]) cfg.initialMessage[method] = {};

        if (promptTitle !== undefined && promptTitle !== null) cfg.initialMessage[method].title = promptTitle;
        if (promptDesc !== undefined && promptDesc !== null) cfg.initialMessage[method].desc = promptDesc;

        await cfg.save();
        return { success: true };
      } catch (err) {
        console.error('[GatewayModule.customizeInitialMessageCommand] Error:', err);
        return { success: false, error: err.message || 'Unable to update initial message' };
      }
    },
  };
}

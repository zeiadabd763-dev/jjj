import { SlashCommandBuilder } from 'discord.js';
import GatewayConfig from '../../modules/gateway/schema.js';
import { verifyMember, createEmbed } from '../../modules/gateway/actions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Run the verification flow.'),

  async execute(interaction) {
    try {
      const { guild, member } = interaction;

      if (!guild) {
        await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        return;
      }

      const config = await GatewayConfig.findOne({ guildId: guild.id });
      if (!config || !config.enabled) {
        await interaction.reply({ content: 'Verification is not configured for this server.', ephemeral: true });
        return;
      }

      // Only allow /verify if slash method is enabled
      if (!config.methods?.slash?.enabled) {
        await interaction.reply({
          content: '❌ The slash command verification method is not enabled on this server.',
          ephemeral: true,
        });
        return;
      }

      // STRICT CHANNEL LOCKDOWN: /verify slash command only works in the configured channel
      if (interaction.channelId !== config.methods.slash.channel) {
        const channel = guild.channels.cache.get(config.methods.slash.channel);
        const channelMention = channel ? `<#${config.methods.slash.channel}>` : '#unknown-channel';
        await interaction.reply({
          content: `❌ This command is only available in ${channelMention}`,
          ephemeral: true,
        });
        return;
      }

      // Perform verification
      const result = await verifyMember(member, config, 'slash');

      if (result.alreadyVerified) {
        const embed = createEmbed(config, result.message, 'alreadyVerified');
        await interaction.reply({
          embeds: [embed],
          ephemeral: false,
        });
      } else if (result.success) {
        const embed = createEmbed(config, '✅ Verification successful! Welcome to the server.', 'success');
        // Slash success in correct channel is PUBLIC
        await interaction.reply({
          embeds: [embed],
          ephemeral: false,
        });
        
        // If DM failed, send ephemeral notification
        if (result.dmFailed) {
          try {
            await interaction.followUp({
              content: `⚠️ I couldn't send you a verification DM. Please open your Privacy Settings and try again.`,
              ephemeral: true,
            });
          } catch (followUpErr) {
            console.error('[verify command] Failed to send DM failure notification:', followUpErr.message);
          }
        }
      } else {
        await interaction.reply({
          content: `❌ Verification failed: ${result.message}`,
          ephemeral: true,
        });
      }
    } catch (err) {
      console.error('[verify command] Error:', err);
      try {
        if (interaction.isRepliable() && !interaction.replied) {
          await interaction.reply({ content: 'An error occurred while attempting verification.', ephemeral: true });
        }
      } catch (e) {
        console.error('[verify command] Failed to send error reply:', e);
      }
    }
  },
};

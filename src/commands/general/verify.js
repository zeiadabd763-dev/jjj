import { SlashCommandBuilder } from 'discord.js';
import GatewayConfig from '../../modules/gateway/schema.js';
import { performVerificationFlow } from '../../modules/gateway/actions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Run the verification flow (if Slash method is enabled).'),

  async execute(interaction) {
    try {
      const { client, guild, member } = interaction;
      if (!guild) {
        await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        return;
      }

      const config = await GatewayConfig.findOne({ guildId: guild.id });
      if (!config || !config.enabled) {
        await interaction.reply({ content: 'Verification is not configured for this server.', ephemeral: true });
        return;
      }

      if (config.method !== 'slash') {
        await interaction.reply({ content: 'Slash verification is not enabled for this server.', ephemeral: true });
        return;
      }

      // Perform verification actions
      const flow = await performVerificationFlow(member, null, config);

      if (flow.success) {
        await interaction.reply({ content: '✅ Verification successful.', ephemeral: true });
      } else {
        await interaction.reply({ content: `❌ Verification failed: ${flow.rolesToast?.message || flow.reactionToast?.message || 'Unknown error'}`, ephemeral: true });
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

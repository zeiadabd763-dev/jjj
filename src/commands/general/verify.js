import { SlashCommandBuilder } from 'discord.js';
import GatewayConfig from '../../modules/gateway/schema.js';
import { verifyMember, createEmbed, DEFAULT_ID_CARD, startDMVerification, getLockdownResponse } from '../../modules/gateway/actions.js';

export default {
  data: new SlashCommandBuilder().setName('verify').setDescription('Run the verification flow.'),
  async execute(interaction) {
    try {
      const { guild, member } = interaction;
      const config = await GatewayConfig.findOne({ guildId: guild.id });
      if (!config?.enabled || !config.methods?.slash?.enabled)
        return interaction.reply({ content: '❌ Slash verification is disabled.', ephemeral: true });
      if (interaction.channelId !== config.methods.slash.channel)
        return interaction.reply({ content: `❌ Only works in <#${config.methods.slash.channel}>`, ephemeral: true });

      // handle lockdown levels
      const lockdownResult = await getLockdownResponse(member, config, 'slash');
      if (lockdownResult) {
        if (lockdownResult.lockdown === 1 || lockdownResult.lockdown === 2) {
          await startDMVerification(member, config);
          return interaction.reply({
            content: '⚠️ Security Lockdown Active. Check your DMs to complete advanced human verification.',
            ephemeral: true,
          });
        }
        if (lockdownResult.lockdown === 3) {
          return interaction.reply({ content: lockdownResult.message, ephemeral: true });
        }
      }

      const result = lockdownResult && !lockdownResult.lockdown ? lockdownResult : await verifyMember(member, config, 'slash');
      if (result.processing)
        return interaction.reply({ content: '⏳ Please wait...', ephemeral: true });

      if (result.alreadyVerified) {
        const embed = await createEmbed(config, result.message, 'alreadyVerified', member);
        return interaction.reply({ embeds: [embed], ephemeral: false });
      } else if (result.success) {
        const loadingEmbed = await createEmbed(config, '🔄 Processing...', 'success', member);
        await interaction.reply({ embeds: [loadingEmbed] });
        await new Promise(r => setTimeout(r, 2000));
        const idCardEmbed = await createEmbed(config, DEFAULT_ID_CARD, 'success', member);
        await interaction.editReply({ embeds: [idCardEmbed] });
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

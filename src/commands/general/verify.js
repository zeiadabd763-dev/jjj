import { SlashCommandBuilder } from 'discord.js';
import GatewayConfig from '../../modules/gateway/schema.js';
import { verifyMember, createEmbed } from '../../modules/gateway/actions.js';

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

      const result = await verifyMember(member, config, 'slash');
      if (result.processing)
        return interaction.reply({ content: '⏳ Please wait...', ephemeral: true });

      if (result.alreadyVerified) {
        const embed = await createEmbed(config, result.message, 'alreadyVerified', member);
        return interaction.reply({ embeds: [embed], ephemeral: false });
      } else if (result.success) {
        const loadingEmbed = await createEmbed(config, '🔄 Processing...', 'success', member);
        await interaction.reply({ embeds: [loadingEmbed] });
        await new Promise(r => setTimeout(r, 2000));
        const idCardMsg = `**✅ Verification Complete**\n\n> 👤 **Member:** {user}\n> 🏅 **Join Position:** #{join_pos}\n> 📅 **Account Age:** {account_age} days\n> 🟢 **Status:** Verified`;
        const idCardEmbed = await createEmbed(config, idCardMsg, 'success', member);
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

import { SlashCommandBuilder } from 'discord.js';
import { render } from '../../core/embedEngine.js';

export default {
  data: new SlashCommandBuilder()
    .setName('embed_preview')
    .setDescription('Preview an embed from a raw JSON string.')
    .addStringOption((option) =>
      option
        .setName('json')
        .setDescription('The JSON definition of the embed.')
        .setRequired(true),
    ),

  async execute(interaction) {
    try {
      const jsonStr = interaction.options.getString('json', true);
      let payload;

      try {
        payload = JSON.parse(jsonStr);
      } catch (parseErr) {
        return await interaction.reply({
          content: '❌ **Invalid JSON:** تأكد من كتابة الكود بصيغة JSON صحيحة.',
          ephemeral: true,
        });
      }

      // إضافة متغيرات أساسية لجعل المعاينة واقعية
      const placeholders = {
        user: interaction.user.username,
        server: interaction.guild.name,
        avatar: interaction.user.displayAvatarURL(),
      };

      const embed = render(payload, placeholders);
      
      await interaction.reply({ 
        embeds: [embed], 
        ephemeral: true 
      });

    } catch (err) {
      console.error('[COMMAND-ERROR] Preview Failed:', err);
      if (!interaction.replied) {
        await interaction.reply({
          content: '⚠️ حدث خطأ أثناء معالجة الإيمبد. تأكد من أن الحقول تتبع معايير ديسكورد.',
          ephemeral: true,
        });
      }
    }
  },
};

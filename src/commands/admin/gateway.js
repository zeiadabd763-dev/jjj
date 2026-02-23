/**
 * Gateway Admin Command - Multi-Method Concurrent Setup
 * All methods (Button, Trigger, Slash, Join) can be active simultaneously
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('gateway')
    .setDescription('Configure and manage gateway verification (supports all methods simultaneously)')
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Setup or update a verification method (can add multiple)')
        .addStringOption(option =>
          option
            .setName('method')
            .setDescription('Verification method to configure')
            .setRequired(true)
            .addChoices(
              { name: 'Button', value: 'button' },
              { name: 'Trigger Word', value: 'trigger' },
              { name: 'Slash Command (/verify)', value: 'slash' },
              { name: 'Join (automatic)', value: 'join' }
            )
        )
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Channel for this method (required for button, trigger, slash)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('trigger_word')
            .setDescription('Trigger word (only used for trigger method)')
            .setRequired(false)
        )
        .addRoleOption(option =>
          option
            .setName('verified_role')
            .setDescription('Role to give verified users (required for initial setup)')
            .setRequired(false)
        )
        .addRoleOption(option =>
          option
            .setName('unverified_role')
            .setDescription('Unverified/penalty role to remove (required for initial setup)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('customize_ui')
        .setDescription('Customize appearance of verification pages and messages')
        .addStringOption(option =>
          option
            .setName('page')
            .setDescription('Which page/message to customize')
            .setRequired(true)
            .addChoices(
              { name: 'Success (Response)', value: 'success' },
              { name: 'Already Verified (Response)', value: 'alreadyVerified' },
              { name: 'Error (Response)', value: 'error' },
              { name: 'DM (Direct Message)', value: 'dm' },
              { name: 'Prompt (Initial Message)', value: 'prompt' }
            )
        )
        .addStringOption(option =>
          option
            .setName('title')
            .setDescription('Embed title')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('description')
            .setDescription('Embed description')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('color')
            .setDescription('Hex color code (e.g., #2ecc71)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('image_url')
            .setDescription('Banner image URL')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('customize_logic')
        .setDescription('Configure method-specific settings (initial message text)')
        .addStringOption(option =>
          option
            .setName('method')
            .setDescription('Which method to customize prompts for')
            .setRequired(true)
            .addChoices(
              { name: 'Button', value: 'button' },
              { name: 'Trigger Word', value: 'trigger' },
              { name: 'Slash Command', value: 'slash' },
              { name: 'Join', value: 'join' }
            )
        )
        .addStringOption(option =>
          option
            .setName('prompt_title')
            .setDescription('Title for the initial verification message/prompt')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('prompt_description')
            .setDescription('Description for the initial verification message/prompt')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Display all configured methods and settings')
    ),

  async execute(interaction) {
    try {
      const { client, guild, options } = interaction;

      if (!interaction.memberPermissions?.has('Administrator')) {
        await interaction.reply({
          content: '❌ You need Administrator permissions to use this command.',
          ephemeral: true,
        });
        return;
      }

      if (!client.gateway) {
        await interaction.reply({
          content: '❌ Gateway module is not loaded.',
          ephemeral: true,
        });
        return;
      }

      const subcommand = options.getSubcommand();

      if (subcommand === 'setup') {
        const method = options.getString('method', true);
        const channel = options.getChannel('channel');
        const triggerWord = options.getString('trigger_word') || '';
        const verifiedRole = options.getRole('verified_role');
        const unverifiedRole = options.getRole('unverified_role');

        // Validate: join method doesn't need a channel
        if (method !== 'join' && !channel) {
          await interaction.reply({
            content: `❌ Channel is required for ${method} method.`,
            ephemeral: true,
          });
          return;
        }

        // Validate: trigger needs a trigger word
        if (method === 'trigger' && !triggerWord?.trim()) {
          await interaction.reply({
            content: '❌ Trigger word is required for trigger method.',
            ephemeral: true,
          });
          return;
        }

        const result = await client.gateway.setupMethod(
          guild.id,
          method,
          channel?.id || '',
          triggerWord,
          verifiedRole?.id,
          unverifiedRole?.id
        );

        if (result.success) {
          const methodNames = {
            button: '🔘 Button',
            trigger: '💬 Trigger Word',
            slash: '⚡ Slash (/verify)',
            join: '✨ Join (automatic)',
          };
          const details = [];
          if (channel) details.push(`**Channel:** <#${channel.id}>`);
          if (triggerWord) details.push(`**Trigger Word:** \`${triggerWord}\``);
          if (verifiedRole) details.push(`**Verified Role:** <@&${verifiedRole.id}>`);
          if (unverifiedRole) details.push(`**Unverified Role:** <@&${unverifiedRole.id}>`);

          await interaction.reply({
            content: `✅ **${methodNames[method]}** method configured!\n\n${details.join('\n')}${channel ? '\n✉️ Verification message sent to channel.' : ''}`,
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: `❌ Setup failed: ${result.error}`,
            ephemeral: true,
          });
        }
      } else if (subcommand === 'customize_ui') {
        const page = options.getString('page', true);
        const title = options.getString('title');
        const description = options.getString('description');
        const color = options.getString('color');
        const imageUrl = options.getString('image_url');

        const result = await client.gateway.customizePageCommand(
          guild.id,
          page,
          title,
          description,
          color,
          imageUrl
        );

        if (result.success) {
          const updates = [];
          if (title) updates.push(`**Title:** ${title}`);
          if (description) updates.push(`**Description:** ${description}`);
          if (color) updates.push(`**Color:** ${color}`);
          if (imageUrl) updates.push(`**Image:** ${imageUrl}`);

          await interaction.reply({
            content: `✅ **${page}** customization updated!\n\n${updates.join('\n') || 'No changes made.'}`,
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: `❌ Update failed: ${result.error}`,
            ephemeral: true,
          });
        }
      } else if (subcommand === 'customize_logic') {
        const method = options.getString('method', true);
        const promptTitle = options.getString('prompt_title');
        const promptDesc = options.getString('prompt_description');

        const result = await client.gateway.customizeInitialMessageCommand(
          guild.id,
          method,
          promptTitle,
          promptDesc
        );

        if (result.success) {
          const updates = [];
          if (promptTitle) updates.push(`**Prompt Title:** ${promptTitle}`);
          if (promptDesc) updates.push(`**Prompt Description:** ${promptDesc}`);

          await interaction.reply({
            content: `✅ **${method}** method prompt customized!\n\n${updates.join('\n') || 'No changes made.'}`,
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: `❌ Update failed: ${result.error}`,
            ephemeral: true,
          });
        }
      } else if (subcommand === 'status') {
        const GatewayConfig = (await import('../../modules/gateway/schema.js')).default;
        const config = await GatewayConfig.findOne({ guildId: guild.id });

        if (!config || !config.enabled) {
          await interaction.reply({
            content: '❌ Gateway is not configured for this server.\n\nUse `/gateway setup` to configure it.',
            ephemeral: true,
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(0x4f3ff0)
          .setTitle('🔐 Gateway Verification Status')
          .setDescription('All configured verification methods');

        const methodsList = [];
        if (config.methods?.button?.enabled) {
          methodsList.push(`🔘 **Button** - <#${config.methods.button.channel}>`);
        }
        if (config.methods?.trigger?.enabled) {
          methodsList.push(`💬 **Trigger** - <#${config.methods.trigger.channel}> (word: \`${config.methods.trigger.triggerWord}\`)`);
        }
        if (config.methods?.slash?.enabled) {
          methodsList.push(`⚡ **Slash (/verify)** - <#${config.methods.slash.channel}>`);
        }
        if (config.methods?.join?.enabled) {
          methodsList.push(`✨ **Join** - Automatic on member join`);
        }

        embed.addFields(
          {
            name: '🔄 Active Methods',
            value: methodsList.length > 0 ? methodsList.join('\n') : 'No methods configured',
            inline: false,
          },
          { name: '✅ Verified Role', value: `<@&${config.verifiedRole}>`, inline: true },
          { name: '❌ Unverified Role', value: `<@&${config.unverifiedRole}>`, inline: true }
        );

        embed.setFooter({ text: 'Use /gateway setup to add methods, /gateway customize_ui to style responses' })
          .setTimestamp();

        await interaction.reply({
          embeds: [embed],
          ephemeral: true,
        });
      }
    } catch (err) {
      console.error('[gateway command] Error:', err);
      try {
        if (interaction.isRepliable() && !interaction.replied) {
          await interaction.reply({
            content: '❌ An error occurred while executing this command.',
            ephemeral: true,
          });
        }
      } catch (replyErr) {
        console.error('[gateway command] Failed to send error reply:', replyErr);
      }
    }
  },
};

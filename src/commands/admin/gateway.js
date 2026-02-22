/**
 * Gateway Admin Command
 * Allows admins to configure the Gateway verification module
 */

import { SlashCommandBuilder } from 'discord.js';
import GatewayConfig from '../../modules/gateway/schema.js';

export default {
  data: new SlashCommandBuilder()
    .setName('gateway')
    .setDescription('Configure the gateway verification module')
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Setup gateway verification for your server')
        .addStringOption(option =>
          option
            .setName('method')
            .setDescription('Verification method')
            .setRequired(true)
            .addChoices(
              { name: 'Button', value: 'button' },
              { name: 'Trigger', value: 'trigger' },
              { name: 'Slash', value: 'slash' },
              { name: 'Join', value: 'join-check' }
            )
        )
        .addRoleOption(option =>
          option
            .setName('verified_role')
            .setDescription('Role to give verified users')
            .setRequired(true)
        )
        .addRoleOption(option =>
          option
            .setName('unverified_role')
            .setDescription('Penalty/unverified role to remove')
            .setRequired(true)
        )
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Channel where verification happens')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('trigger_word')
            .setDescription('Trigger word or password (for trigger method)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('success_dm')
            .setDescription('Custom DM message sent on successful verification')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('embed_title')
            .setDescription('Title for the verification embed')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('embed_description')
            .setDescription('Description for the verification embed')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('customize_ui')
        .setDescription('Customize the look and feel of verification embeds')
        .addStringOption(option =>
          option
            .setName('title')
            .setDescription('Title for verification embeds')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('description')
            .setDescription('Description text for verification embeds')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('color_hex')
            .setDescription('Hex color code (e.g., #2ecc71)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('image_url')
            .setDescription('URL for banner/thumbnail image')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('trigger_emoji')
            .setDescription('Emoji to react with on trigger word match')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('customize_logic')
        .setDescription('Customize verification behavior and responses')
        .addStringOption(option =>
          option
            .setName('already_verified_button')
            .setDescription('Message when user clicks button but is already verified')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('already_verified_trigger')
            .setDescription('Message when user types trigger word but is already verified')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('already_verified_slash')
            .setDescription('Message when user runs /verify but is already verified')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('disable')
        .setDescription('Disable gateway verification for your server')
    ),

  async execute(interaction) {
    try {
      const { client, guild, options } = interaction;

      // Check if user has admin permissions
      if (!interaction.memberPermissions?.has('Administrator')) {
        await interaction.reply({
          content: '❌ You need Administrator permissions to use this command.',
          ephemeral: true,
        });
        return;
      }

      // Check if gateway module is loaded
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
        const verifiedRole = options.getRole('verified_role', true);
        const unverifiedRole = options.getRole('unverified_role', true);
        const channel = options.getChannel('channel', true);
        const triggerWord = options.getString('trigger_word') || '';
        const successDM = options.getString('success_dm') || undefined;
        const embedTitle = options.getString('embed_title') || undefined;
        const embedDescription = options.getString('embed_description') || undefined;

        const result = await client.gateway.setupCommand(
          guild.id,
          method,
          verifiedRole.id,
          unverifiedRole.id,
          channel.id,
          triggerWord,
          successDM,
          embedTitle,
          embedDescription
        );

        if (result.success) {
          await interaction.reply({
            content: `✅ Gateway configured successfully!\n\n**Method:** ${method}\n**Channel:** <#${channel.id}>\n**Verified Role:** <@&${verifiedRole.id}>\n**Unverified Role:** <@&${unverifiedRole.id}>`,
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: `❌ Setup failed: ${result.error}`,
            ephemeral: true,
          });
        }
      } else if (subcommand === 'customize_ui') {
        const title = options.getString('title');
        const description = options.getString('description');
        const colorHex = options.getString('color_hex');
        const imageUrl = options.getString('image_url');
        const triggerEmoji = options.getString('trigger_emoji');

        const updateData = {};
        if (title) updateData.embedTitle = title;
        if (description) updateData.embedDescription = description;
        if (colorHex) updateData.embedColor = colorHex;
        if (imageUrl) updateData.embedImage = imageUrl;
        if (triggerEmoji) updateData.triggerEmoji = triggerEmoji;

        const config = await GatewayConfig.findOneAndUpdate(
          { guildId: guild.id },
          updateData,
          { new: true }
        );

        if (config) {
          await interaction.reply({
            content: '✅ Verification UI customized successfully!',
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: '❌ Gateway not configured for this server. Run `/gateway setup` first.',
            ephemeral: true,
          });
        }
      } else if (subcommand === 'customize_logic') {
        const alreadyVerifiedButton = options.getString('already_verified_button');
        const alreadyVerifiedTrigger = options.getString('already_verified_trigger');
        const alreadyVerifiedSlash = options.getString('already_verified_slash');

        const config = await GatewayConfig.findOne({ guildId: guild.id });
        if (!config) {
          await interaction.reply({
            content: '❌ Gateway not configured for this server. Run `/gateway setup` first.',
            ephemeral: true,
          });
          return;
        }

        // Update custom responses
        if (!config.customResponses) {
          config.customResponses = new Map();
        }

        if (alreadyVerifiedButton) {
          config.customResponses.set('already_verified_button', alreadyVerifiedButton);
        }
        if (alreadyVerifiedTrigger) {
          config.customResponses.set('already_verified_trigger', alreadyVerifiedTrigger);
        }
        if (alreadyVerifiedSlash) {
          config.customResponses.set('already_verified_slash', alreadyVerifiedSlash);
        }

        await config.save();

        await interaction.reply({
          content: '✅ Verification logic customized successfully!',
          ephemeral: true,
        });
      } else if (subcommand === 'disable') {
        const result = await client.gateway.disableCommand(guild.id);
        if (result.success) {
          await interaction.reply({
            content: '✅ Gateway has been disabled.',
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: `❌ Disable failed: ${result.error}`,
            ephemeral: true,
          });
        }
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

/**
 * Gateway Admin Command - Multi-Method Concurrent Setup
 * All methods (Button, Trigger, Slash, Join) can be active simultaneously
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import GatewayConfig from '../../modules/gateway/schema.js';
import { createEmbed } from '../../modules/gateway/actions.js';

// track ephemeral preview message IDs keyed by user:guild:page
const _uiPreviewMap = new Map();

export default {
  data: new SlashCommandBuilder()
    .setName('gateway')
    .setDescription('Configure and manage gateway verification (supports button, trigger, slash)')
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
              { name: 'Slash Command (/verify)', value: 'slash' }
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
            .setName('desc')
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
        .setDescription('Configure or tweak verification logic and roles')
        .addStringOption(option =>
          option
            .setName('method')
            .setDescription('Which method to customize prompts for or update settings on')
            .setRequired(true)
            .addChoices(
              { name: 'Button', value: 'button' },
              { name: 'Trigger Word', value: 'trigger' },
              { name: 'Slash Command', value: 'slash' }
            )
        )
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Change the channel associated with this method')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('trigger_word')
            .setDescription('Trigger word (only for trigger method)')
            .setRequired(false)
        )
        .addRoleOption(option =>
          option
            .setName('verified_role')
            .setDescription('Verified role to assign')
            .setRequired(false)
        )
        .addRoleOption(option =>
          option
            .setName('unverified_role')
            .setDescription('Unverified role to remove')
            .setRequired(false)
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
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('lockdown')
        .setDescription('Toggle lockdown mode ON or OFF')
        .addStringOption(option =>
          option
            .setName('state')
            .setDescription('ON or OFF')
            .setRequired(true)
            .addChoices(
              { name: 'ON', value: 'ON' },
              { name: 'OFF', value: 'OFF' }
            )
        )
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

        // Validate: methods other than 'join' require a channel
        if (!channel) {
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
        const description = options.getString('desc');
        const color = options.getString('color');
        const imageUrl = options.getString('image_url');

        // update the database (current implementation writes immediately)
        const result = await client.gateway.customizePageCommand(
          guild.id,
          page,
          title,
          description,
          color,
          imageUrl
        );

        // build a preview embed (color safety handled inside createEmbed via parseColor)

        // build a preview embed based on the resulting configuration
        let previewEmbed;
        if (result.success && result.config) {
          try {
            previewEmbed = await createEmbed(result.config, '', page, interaction.member);
          } catch (e) {
            console.error('[gateway command] Failed to build preview embed:', e);
          }
        }

        // manage preview message state
        const key = `${interaction.user.id}:${guild.id}:${page}`;
        let prevMsgId = _uiPreviewMap.get(key);
        let edited = false;

        if (prevMsgId && interaction.channel) {
          try {
            const prevMsg = await interaction.channel.messages.fetch(prevMsgId).catch(() => null);
            if (prevMsg) {
              const contentText = result.success
                ? `✅ **${page}** customization updated!`
                : `❌ Update failed: ${result.error}`;
              const editPayload = { content: contentText };
              if (previewEmbed) editPayload.embeds = [previewEmbed];
              await prevMsg.edit(editPayload);
              edited = true;
            }
          } catch (e) {
            // ignore fetch/edit errors, will send a new reply below
          }
        }

        if (!edited) {
          const replyOptions = previewEmbed ? { embeds: [previewEmbed] } : {};
          await interaction.reply({
            content: result.success ? `✅ **${page}** customization updated!` : `❌ Update failed: ${result.error}`,
            ...replyOptions,
            ephemeral: true,
          });
          // fetch the actual message object so we can track its id
          try {
            const sentMsg = await interaction.fetchReply();
            if (sentMsg && sentMsg.id) {
              _uiPreviewMap.set(key, sentMsg.id);
            }
          } catch (e) {
            // fetch may fail for ephemeral; ignore
          }
        }

        // optionally send additional status text if not using preview
        if (!previewEmbed) {
          if (result.success) {
            const updates = [];
            if (title) updates.push(`**Title:** ${title}`);
            if (description) updates.push(`**Description:** ${description}`);
            if (color) updates.push(`**Color:** ${color}`);
            if (imageUrl) updates.push(`**Image:** ${imageUrl}`);

            if (!edited) {
              await interaction.followUp({
                content: updates.join('\n') || 'No changes made.',
                ephemeral: true,
              });
            }
          } else if (!edited) {
            await interaction.followUp({
              content: `❌ Update failed: ${result.error}`,
              ephemeral: true,
            });
          }
        }
      } else if (subcommand === 'lockdown') {
        const state = options.getString('state', true);
        let cfg = await GatewayConfig.findOne({ guildId: guild.id });
        if (!cfg) cfg = new GatewayConfig({ guildId: guild.id });
        cfg.lockdownMode = state === 'ON';
        await cfg.save();
        await interaction.reply({
          content: `🔒 Lockdown mode is now **${cfg.lockdownMode ? 'ON' : 'OFF'}**.`,
          ephemeral: true,
        });
      } else if (subcommand === 'customize_logic') {
        const method = options.getString('method', true);
        const channelOpt = options.getChannel('channel');
        const triggerWord = options.getString('trigger_word');
        const verifiedRole = options.getRole('verified_role');
        const unverifiedRole = options.getRole('unverified_role');
        const promptTitle = options.getString('prompt_title');
        const promptDesc = options.getString('prompt_description');

        const replyParts = [];
        let overallSuccess = true;

        // if any logic-related options were provided, update via setupMethod
        if (channelOpt || triggerWord || verifiedRole || unverifiedRole) {
          const res1 = await client.gateway.setupMethod(
            guild.id,
            method,
            channelOpt?.id || '',
            triggerWord || '',
            verifiedRole?.id,
            unverifiedRole?.id
          );
          if (res1.success) {
            const details = [];
            if (channelOpt) details.push(`Channel → <#${channelOpt.id}>`);
            if (triggerWord) details.push(`Trigger Word → \`${triggerWord}\``);
            if (verifiedRole) details.push(`Verified Role → <@&${verifiedRole.id}>`);
            if (unverifiedRole) details.push(`Unverified Role → <@&${unverifiedRole.id}>`);
            replyParts.push(`⚙️ Logic updated: ${details.join(', ')}`);
          } else {
            overallSuccess = false;
            replyParts.push(`❌ Logic update failed: ${res1.error}`);
          }
        }

        // prompts customization
        if (promptTitle || promptDesc) {
          const res2 = await client.gateway.customizeInitialMessageCommand(
            guild.id,
            method,
            promptTitle,
            promptDesc
          );
          if (res2.success) {
            const upd = [];
            if (promptTitle) upd.push(`Title → ${promptTitle}`);
            if (promptDesc) upd.push(`Description → ${promptDesc}`);
            replyParts.push(`✏️ Prompt updated (${upd.join(', ')})`);
          } else {
            overallSuccess = false;
            replyParts.push(`❌ Prompt update failed: ${res2.error}`);
          }
        }

        if (replyParts.length === 0) {
          replyParts.push('No options provided; nothing to change.');
        }

        await interaction.reply({
          content: `${overallSuccess ? '✅' : '⚠️'} ${replyParts.join('\n')}`,
          ephemeral: true,
        });
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
        
        // show configured initial prompts if available
        const promptLines = [];
        if (config.initialMessage) {
          ['button', 'trigger', 'slash'].forEach(m => {
            const im = config.initialMessage[m] || {};
            if (im.title || im.desc) {
              promptLines.push(`**${m}**: ${im.title || '<no title>'}`);
            }
          });
        }
        if (promptLines.length > 0) {
          embed.addFields({ name: '✉️ Custom Prompts', value: promptLines.join('\n'), inline: false });
        }

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

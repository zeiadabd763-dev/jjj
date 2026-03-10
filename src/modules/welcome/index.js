import WelcomeConfig from './schema.js';
import { parseColor } from '../../utils/parseColor.js';
import { render as renderEmbed } from '../../core/embedEngine.js';

export default function WelcomeModule(client) {
  return {
    async buildEmbed(embedConfig, member, guild) {
      try {
        if (!embedConfig) return null;
        const template = {};
        if (embedConfig.title) template.title = embedConfig.title;
        if (embedConfig.description) template.description = embedConfig.description;
        if (embedConfig.color) template.color = embedConfig.color;
        if (embedConfig.author_name) {
          template.author = { name: embedConfig.author_name };
          if (embedConfig.author_icon) template.author.iconURL = embedConfig.author_icon;
        }
        if (embedConfig.footer_text) {
          template.footer = { text: embedConfig.footer_text };
          if (embedConfig.footer_image_url) template.footer.iconURL = embedConfig.footer_image_url;
        }
        if (embedConfig.thumbnail_url) {
          template.thumbnail = { url: embedConfig.thumbnail_url };
        } else if (embedConfig.thumbnail_toggle && member?.user) {
          template.thumbnail = { url: member.user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: false }) };
        }
        if (embedConfig.image_url) template.image = { url: embedConfig.image_url };

        const rendered = renderEmbed(template, member || {});
        if (rendered?.error === 'EMBED_DESCRIPTION_TOO_LONG') return null;
        if (rendered && rendered.color) {
          try { rendered.color = parseColor(rendered.color, '#4f3ff0'); } catch (_e) {}
        }
        return rendered;
      } catch (err) {
        return null;
      }
    },

    async handleMemberAdd(member) {
      try {
        let config = await WelcomeConfig.findOne({ guildId: member.guild.id });
        if (!config) {
          config = await WelcomeConfig.findOneAndUpdate(
            { guildId: member.guild.id },
            { guildId: member.guild.id, enabled: true },
            { upsert: true, new: true }
          );
        }
        if (!config?.enabled) return;

        if (config.autoRole) {
          try {
            const role = member.guild.roles.cache.get(config.autoRole);
            if (role && !member.roles.cache.has(role.id)) await member.roles.add(role.id);
          } catch (roleErr) {}
        }

        if (config.welcomeEmbed?.channel) {
          const channel = member.guild.channels.cache.get(config.welcomeEmbed.channel);
          if (channel?.isTextBased()) {
            const embed = await this.buildEmbed(config.welcomeEmbed, member, member.guild);
            if (embed) await channel.send({ embeds: [embed] });
          }
        }
      } catch (err) {}
    },

    async handleMemberRemove(member) {
      try {
        const config = await WelcomeConfig.findOne({ guildId: member.guild.id });
        if (!config?.enabled) return;
        if (config.goodbyeEmbed?.channel) {
          const channel = member.guild.channels.cache.get(config.goodbyeEmbed.channel);
          if (channel?.isTextBased()) {
            const embed = await this.buildEmbed(config.goodbyeEmbed, member, member.guild);
            if (embed) await channel.send({ embeds: [embed] });
          }
        }
      } catch (err) {}
    },

    async handleButtonInteraction(interaction) {
      try {
        const parts = interaction.customId.split('_');
        // format: welcome_{embedType}_{section}
        const embedType = parts[1];
        const section = parts[2];
        const cfg = await WelcomeConfig.findOne({ guildId: interaction.guildId });
        if (!cfg) {
          return interaction.reply({ content: 'Configuration not found.', ephemeral: true });
        }
        const embedConfig = embedType === 'welcome' ? cfg.welcomeEmbed || {} : cfg.goodbyeEmbed || {};

        const {
          ModalBuilder,
          TextInputBuilder,
          TextInputStyle,
          ActionRowBuilder,
        } = await import('discord.js');

        const modal = new ModalBuilder()
          .setCustomId(`welcome_modal_${embedType}_${section}`)
          .setTitle(`Edit ${embedType === 'welcome' ? 'Welcome' : 'Goodbye'} ${section}`);

        if (section === 'basicinfo') {
          const titleInput = new TextInputBuilder()
            .setCustomId('title')
            .setLabel('Title')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(embedConfig.title || '');
          const descInput = new TextInputBuilder()
            .setCustomId('description')
            .setLabel('Description')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setValue(embedConfig.description || '');
          const colorInput = new TextInputBuilder()
            .setCustomId('color')
            .setLabel('Color (hex)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(embedConfig.color || '');
          const thumbInput = new TextInputBuilder()
            .setCustomId('thumbnail_url')
            .setLabel('Thumbnail URL')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(embedConfig.thumbnail_url || '');

          modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(descInput),
            new ActionRowBuilder().addComponents(colorInput),
            new ActionRowBuilder().addComponents(thumbInput)
          );
        } else if (section === 'author') {
          const nameInput = new TextInputBuilder()
            .setCustomId('author_name')
            .setLabel('Author Name')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(embedConfig.author_name || '');
          const iconInput = new TextInputBuilder()
            .setCustomId('author_icon')
            .setLabel('Author Icon URL')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(embedConfig.author_icon || '');

          modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(iconInput)
          );
        } else if (section === 'footer') {
          const textInput = new TextInputBuilder()
            .setCustomId('footer_text')
            .setLabel('Footer Text')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(embedConfig.footer_text || '');
          const iconInput = new TextInputBuilder()
            .setCustomId('footer_image_url')
            .setLabel('Footer Icon URL')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(embedConfig.footer_image_url || '');

          modal.addComponents(
            new ActionRowBuilder().addComponents(textInput),
            new ActionRowBuilder().addComponents(iconInput)
          );
        } else if (section === 'images') {
          const imgInput = new TextInputBuilder()
            .setCustomId('image_url')
            .setLabel('Image URL')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue(embedConfig.image_url || '');

          modal.addComponents(new ActionRowBuilder().addComponents(imgInput));
        }

        await interaction.showModal(modal);
      } catch (err) {
        console.error('[WelcomeModule.handleButtonInteraction]', err);
      }
    },

    async handleModalSubmit(interaction) {
      try {
        const parts = interaction.customId.split('_');
        const embedType = parts[2];
        const section = parts[3];
        const cfg = await WelcomeConfig.findOne({ guildId: interaction.guildId });
        if (!cfg) return;
        const key = embedType === 'welcome' ? 'welcomeEmbed' : 'goodbyeEmbed';
        const embedConfig = cfg[key] || {};

        const fields = interaction.fields;
        if (section === 'basicinfo') {
          embedConfig.title = fields.getTextInputValue('title') || embedConfig.title;
          embedConfig.description = fields.getTextInputValue('description') || embedConfig.description;
          embedConfig.color = fields.getTextInputValue('color') || embedConfig.color;
          embedConfig.thumbnail_url = fields.getTextInputValue('thumbnail_url') || embedConfig.thumbnail_url;
        } else if (section === 'author') {
          embedConfig.author_name = fields.getTextInputValue('author_name') || embedConfig.author_name;
          embedConfig.author_icon = fields.getTextInputValue('author_icon') || embedConfig.author_icon;
        } else if (section === 'footer') {
          embedConfig.footer_text = fields.getTextInputValue('footer_text') || embedConfig.footer_text;
          embedConfig.footer_image_url = fields.getTextInputValue('footer_image_url') || embedConfig.footer_image_url;
        } else if (section === 'images') {
          embedConfig.image_url = fields.getTextInputValue('image_url') || embedConfig.image_url;
        }

        cfg[key] = embedConfig;
        await cfg.save();
        await interaction.reply({ content: '✅ Updated.', ephemeral: true });
      } catch (err) {
        console.error('[WelcomeModule.handleModalSubmit]', err);
      }
    },

    async setup(guildId, channelId, autoRoleId) {
      try {
        const cfg = await WelcomeConfig.findOneAndUpdate(
          { guildId },
          {
            guildId,
            enabled: true,
            welcomeChannel: channelId,
            autoRole: autoRoleId,
            'welcomeEmbed.channel': channelId,
          },
          { upsert: true, new: true }
        );
        return { success: true, config: cfg };
      } catch (err) {
        console.error('[WelcomeModule.setup] Error:', err);
        return { success: false, error: err.message || 'Setup failed' };
      }
    },

    async setupGoodbye(guildId, channelId) {
      try {
        const cfg = await WelcomeConfig.findOneAndUpdate(
          { guildId },
          { guildId, enabled: true, 'goodbyeEmbed.channel': channelId },
          { upsert: true, new: true }
        );
        return { success: true, config: cfg };
      } catch (err) {
        console.error('[WelcomeModule.setupGoodbye] Error:', err);
        return { success: false, error: err.message || 'Setup failed' };
      }
    },
  };
}

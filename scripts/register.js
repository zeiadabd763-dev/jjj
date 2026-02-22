import { config } from 'dotenv';
config();
import { REST } from 'discord.js';
import loadCommands from '../src/loaders/commands.js';

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        const clientId = process.env.CLIENT_ID;
        const guildId = process.env.GUILD_ID;

        if (!clientId || !guildId) {
            throw new Error('CLIENT_ID and GUILD_ID are required in environment variables');
        }

        // Load commands
        const client = { commands: new Map() };
        await loadCommands(client);

        const commands = Array.from(client.commands.values()).map(cmd => {
            // Support both SlashCommandBuilder (has .data property) and old format
            if (cmd.data) {
                // New format: SlashCommandBuilder
                return cmd.data.toJSON();
            } else {
                // Old format: simple object with name and description
                return {
                    name: cmd.name,
                    description: cmd.description || 'No description provided',
                };
            }
        });

        console.log(`[REGISTER] Clearing OLD commands for Guild ${guildId}...`);
        // Delete all existing commands in the guild
        await rest.put(`/applications/${clientId}/guilds/${guildId}/commands`, { body: [] });
        console.log('[REGISTER] ✓ Old commands cleared');

        console.log(`[REGISTER] Registering ${commands.length} new command(s)...`);
        console.log('[REGISTER] Commands:', commands.map(c => c.name).join(', '));
        await rest.put(`/applications/${clientId}/guilds/${guildId}/commands`, { body: commands });
        console.log('[REGISTER] ✓ Commands registered successfully');

        console.log('\n[SUCCESS] Registration completed!');
        process.exit(0);
    } catch (err) {
        console.error('[ERROR] Register script failed:', err);
        process.exit(1);
    }
})();

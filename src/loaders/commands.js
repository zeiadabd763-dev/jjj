import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { REST, Routes } from 'discord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function loadCommands(client) {
    const commandsPath = path.join(__dirname, '../commands');
    const commandsJson = [];
    
    async function scanDirectory(dir) {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const resPath = path.join(dir, entry.name);
            if (entry.isDirectory()) await scanDirectory(resPath);
            else if (entry.name.endsWith('.js')) {
                const commandModule = await import(pathToFileURL(resPath).href);
                const command = commandModule.default;
                if (command?.data?.name) {
                    // فحص بسيط لو الاسم مكرر قبل ما نبعت لديسكورد
                    if (client.commands.has(command.data.name)) {
                        console.error(`\x1b[31m[ERROR] Duplicate command name found: ${command.data.name} in ${entry.name}\x1b[0m`);
                        continue;
                    }
                    client.commands.set(command.data.name, command);
                    commandsJson.push(command.data.toJSON());
                }
            }
        }
    }

    await scanDirectory(commandsPath);

    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID;
    const guildId = process.env.GUILD_ID;

    if (token && clientId && guildId && commandsJson.length > 0) {
        const rest = new REST({ version: '10' }).setToken(token);
        try {
            await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandsJson });
            console.log('\x1b[32m[System] Commands synced successfully!\x1b[0m');
        } catch (error) {
            console.error(`\x1b[31m[Sync Error] ${error.message}\x1b[0m`);
        }
    }
}

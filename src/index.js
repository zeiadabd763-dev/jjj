import { Client, GatewayIntentBits, Collection } from "discord.js";
import dotenv from "dotenv";
import { connectDatabase } from "./core/database.js";
import loadModules from "./loaders/modules.js";
import loadEvents from "./loaders/events.js";
import loadCommands from "./loaders/commands.js";

dotenv.config();

const client = new Client({
      intents: [
            GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMembers,
                    GatewayIntentBits.GuildMessages,
                        GatewayIntentBits.GuildMessageReactions,
      ],
});

client.commands = new Collection();

async function bootstrap() {
      await connectDatabase();
        await loadModules(client);
          await loadEvents(client);
            await loadCommands(client);
              await client.login(process.env.DISCORD_TOKEN);
}

bootstrap();
export default client;

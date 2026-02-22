import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function loadEvents(client) {
      const eventsPath = path.join(__dirname, "../events");
        if (!fs.existsSync(eventsPath)) return;

          const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith(".js"));

            for (const file of eventFiles) {
                    const filePath = pathToFileURL(path.join(eventsPath, file)).href;
                        const eventModule = await import(filePath);
                            const event = eventModule.default;

                                if (event && event.name) {
                                          if (event.once) {
                                                    client.once(event.name, (...args) => event.execute(...args));
                                          } else {
                                                    client.on(event.name, (...args) => event.execute(...args));
                                          }
                                }
            }
              console.log(`[INFO] Loaded ${eventFiles.length} events successfully.`);
}

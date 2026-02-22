import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function loadModules(client) {
      const modulesPath = path.join(__dirname, "../modules");
        if (!fs.existsSync(modulesPath)) {
                  console.log("[INFO] No modules folder found. Skipping.");
                        return;
        }

          const folders = fs.readdirSync(modulesPath).filter(f => fs.statSync(path.join(modulesPath, f)).isDirectory());
            
              for (const folder of folders) {
                      try {
                                  const indexPath = pathToFileURL(path.join(modulesPath, folder, "index.js")).href;
                                            const mod = await import(indexPath);
                                                      
                                                                if (mod.default && typeof mod.default === "function") {
                                                                                  client[folder] = mod.default(client);
                                                                } else if (mod.default) {
                                                                                  client[folder] = mod.default;
                                                                }
                      } catch (err) {
                                  console.error(`[ERROR] Failed to load module ${folder}:`, err.message);
                      }
              }
                console.log(`[INFO] Loaded ${folders.length} modules successfully.`);
}

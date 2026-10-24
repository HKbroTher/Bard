import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { Store } from "./db.js";
import { createLlmClient } from "./llm.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 3001);
const store = new Store(resolve(process.env.DB_PATH || resolve(here, "../../data/mail-assistant.db")));
const llm = createLlmClient();
const app = createApp(store, llm, resolve(here, "../../web/dist"));

app.listen(port, () => {
  console.log(`Mail Assistant API on http://localhost:${port}`);
  console.log(llm.mock ? "LLM: mock mode (set ANTHROPIC_API_KEY to use Claude)" : `LLM: ${llm.model}`);
});

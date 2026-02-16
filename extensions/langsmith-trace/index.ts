import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { createLangSmithService } from "./src/service.js";

const plugin = {
  id: "langsmith-trace",
  name: "LangSmith Tracing",
  description: "Trace agent execution with LangSmith",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    api.registerService(createLangSmithService(api));
  },
};

export default plugin;

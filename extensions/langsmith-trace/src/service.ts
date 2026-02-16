import { RunTree } from "langsmith";
import type { OpenClawPluginApi, OpenClawPluginService } from "openclaw/plugin-sdk";

// Map runId to LangSmith RunTree
const runs = new Map<string, RunTree>();
// Map sessionId to runId
const sessionRuns = new Map<string, string>();

export function createLangSmithService(api: OpenClawPluginApi): OpenClawPluginService {
  return {
    id: "langsmith-trace",
    start(ctx) {
        const logger = ctx.logger;

        if (!process.env.LANGSMITH_API_KEY) {
            logger.warn("LANGSMITH_API_KEY not set, LangSmith tracing will be skipped");
            return;
        }

        // Use LANGCHAIN_TRACING_V2=true if not set, as it is standard for LangSmith
        if (!process.env.LANGCHAIN_TRACING_V2) {
             process.env.LANGCHAIN_TRACING_V2 = "true";
        }

        api.on("llm_input", async (evt) => {
            try {
                const run = new RunTree({
                    name: "OpenClaw Agent Run",
                    run_type: "chain",
                    inputs: {
                        prompt: evt.prompt,
                        systemPrompt: evt.systemPrompt,
                        historyMessages: evt.historyMessages,
                    },
                    extra: {
                        sessionId: evt.sessionId,
                        provider: evt.provider,
                        model: evt.model,
                        runId: evt.runId, // OpenClaw internal runId
                        metadata: {
                           agentId: evt.runId
                        }
                    }
                });

                await run.postRun();

                runs.set(evt.runId, run);
                sessionRuns.set(evt.sessionId, evt.runId);

                logger.debug(`Started LangSmith run for ${evt.runId}`);
            } catch (err) {
                logger.error(`Failed to start LangSmith run: ${err}`);
            }
        });

        api.on("agent_end", async (evt, agentCtx) => {
             if (!agentCtx.sessionId) return;

             const runId = sessionRuns.get(agentCtx.sessionId);
             if (!runId) return;

             const run = runs.get(runId);
             if (!run) return;

             if (!evt.success && evt.error) {
                 try {
                     await run.patchRun({
                         error: evt.error,
                     });
                 } catch (err) {
                     logger.error(`Failed to patch LangSmith run with error: ${err}`);
                 }
             }
        });

        api.on("llm_output", async (evt) => {
            try {
                const run = runs.get(evt.runId);
                if (run) {
                    await run.end({
                        outputs: {
                            assistantTexts: evt.assistantTexts,
                            usage: evt.usage
                        }
                    });
                    await run.patchRun();

                    runs.delete(evt.runId);
                    if (sessionRuns.get(evt.sessionId) === evt.runId) {
                        sessionRuns.delete(evt.sessionId);
                    }

                    logger.debug(`Ended LangSmith run for ${evt.runId}`);
                }
            } catch (err) {
                 logger.error(`Failed to end LangSmith run: ${err}`);
            }
        });
    }
  };
}

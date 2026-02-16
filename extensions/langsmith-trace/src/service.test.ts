import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLangSmithService } from "./service.js";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

// Mock LangSmith RunTree
const mockRunTreeInstance = {
    postRun: vi.fn(),
    end: vi.fn(),
    patchRun: vi.fn(),
};

vi.mock("langsmith", () => {
    return {
        RunTree: class {
            constructor() {
                return mockRunTreeInstance;
            }
        },
    };
});

describe("LangSmith Service", () => {
    let api: Partial<OpenClawPluginApi>;
    let hooks: Record<string, Function> = {};
    let logger: any;

    beforeEach(() => {
        hooks = {};
        logger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };

        api = {
            on: vi.fn((event, handler) => {
                hooks[event] = handler;
            }),
            logger,
        } as unknown as Partial<OpenClawPluginApi>;

        process.env.LANGSMITH_API_KEY = "test-key";
        vi.clearAllMocks();
    });

    it("should start a run on llm_input", async () => {
        const service = createLangSmithService(api as OpenClawPluginApi);
        service.start({ logger } as any);

        const llmInputHook = hooks["llm_input"];
        expect(llmInputHook).toBeDefined();

        await llmInputHook({
            runId: "run-1",
            sessionId: "session-1",
            prompt: "hello",
            systemPrompt: "system",
            historyMessages: [],
            provider: "openai",
            model: "gpt-4",
        }, {
            sessionId: "session-1"
        });

        expect(mockRunTreeInstance.postRun).toHaveBeenCalled();
        // Since runId is passed in extra, we can't verify constructor args easily here without spying on RunTree class itself,
        // but we can verify side effects.
        // Wait, I can spy on the mock class if I assign it to a variable.
    });

    it("should end a run on llm_output", async () => {
        const service = createLangSmithService(api as OpenClawPluginApi);
        service.start({ logger } as any);

        const llmInputHook = hooks["llm_input"];
        const llmOutputHook = hooks["llm_output"];

        // Start run
        await llmInputHook({
            runId: "run-1",
            sessionId: "session-1",
            prompt: "hello",
            systemPrompt: "system",
            historyMessages: [],
            provider: "openai",
            model: "gpt-4",
        }, {
            sessionId: "session-1"
        });

        // End run
        await llmOutputHook({
            runId: "run-1",
            sessionId: "session-1",
            provider: "openai",
            model: "gpt-4",
            assistantTexts: ["world"],
            usage: { total: 10 }
        }, {
            sessionId: "session-1"
        });

        expect(mockRunTreeInstance.end).toHaveBeenCalledWith(expect.objectContaining({
            outputs: {
                assistantTexts: ["world"],
                usage: { total: 10 }
            }
        }));
        expect(mockRunTreeInstance.patchRun).toHaveBeenCalled();
    });

    it("should patch run with error on agent_end if failed", async () => {
        const service = createLangSmithService(api as OpenClawPluginApi);
        service.start({ logger } as any);

        const llmInputHook = hooks["llm_input"];
        const agentEndHook = hooks["agent_end"];

        // Start run
        await llmInputHook({
            runId: "run-1",
            sessionId: "session-1",
            prompt: "hello",
            systemPrompt: "system",
            historyMessages: [],
            provider: "openai",
            model: "gpt-4",
        }, {
            sessionId: "session-1"
        });

        // Agent end with error
        await agentEndHook({
            success: false,
            error: "Something went wrong"
        }, {
            sessionId: "session-1"
        });

        expect(mockRunTreeInstance.patchRun).toHaveBeenCalledWith({
            error: "Something went wrong"
        });
    });
});

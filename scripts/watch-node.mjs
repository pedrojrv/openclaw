#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";

const args = process.argv.slice(2);
const env = { ...process.env };
const cwd = process.cwd();
const compiler = "tsdown";
const watchSession = `${Date.now()}-${process.pid}`;
env.OPENCLAW_WATCH_MODE = "1";
env.OPENCLAW_WATCH_SESSION = watchSession;
if (args.length > 0) {
  env.OPENCLAW_WATCH_COMMAND = args.join(" ");
}

const command = [process.execPath, "openclaw.mjs", ...args].join(" ");

const compilerProcess = spawn(
  "pnpm",
  ["exec", compiler, "--watch", "--on-success", command],
  {
    cwd,
    env,
    stdio: "inherit",
  },
);

let exiting = false;

function cleanup(code = 0) {
  if (exiting) {
    return;
  }
  exiting = true;
  compilerProcess.kill("SIGTERM");
  process.exit(code);
}

process.on("SIGINT", () => cleanup(130));
process.on("SIGTERM", () => cleanup(143));

compilerProcess.on("exit", (code) => {
  if (exiting) {
    return;
  }
  cleanup(code ?? 1);
});

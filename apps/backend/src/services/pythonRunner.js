import { spawn } from "node:child_process";
import { config } from "../config.js";

export const runPythonJson = (scriptUrl, payload, timeoutMs = 12000) =>
  new Promise((resolve, reject) => {
    const child = spawn(config.pythonPath, [scriptUrl.pathname], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        NSE_ANNOUNCEMENTS_URL: config.nseAnnouncementsUrl,
        NSE_REFERER_URL: config.nseRefererUrl,
        BSE_ANNOUNCEMENTS_URL: config.bseAnnouncementsUrl,
        BSE_REFERER_URL: config.bseRefererUrl,
        BSE_ATTACHMENT_ROOT: config.bseAttachmentRoot
      }
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Python service timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString("utf8") || `Python service exited ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(stdout).toString("utf8") || "{}"));
      } catch (error) {
        reject(new Error(`Invalid Python JSON response: ${error.message}`));
      }
    });

    child.stdin.end(JSON.stringify(payload || {}));
  });

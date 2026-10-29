import "dotenv/config";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));

// LMS menjalankan satu backend ASGI; worker dokumen mengikuti siklus hidup backend tersebut.
const localPython = resolve(root, "services/rag/.venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const python = process.env.RAG_PYTHON_EXECUTABLE || (existsSync(localPython) ? localPython : "python");
const child = spawn(python, [
  "-m", "uvicorn", "tutor_rag.api.application:app",
  "--app-dir", "src", "--host", "127.0.0.1",
  "--port", process.env.RAG_SERVICE_PORT || "8001",
], {
  cwd: resolve(root, "services/rag"),
  stdio: "inherit",
  env: { ...process.env, PYTHONUNBUFFERED: "1" },
});
child.on("error", (error) => { console.error(`RAG process tidak dapat dijalankan: ${error.message}`); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

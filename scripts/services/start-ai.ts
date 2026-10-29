import "dotenv/config";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Script npm dijalankan dari root LMS; launcher ini hanya mengelola proses backend Python.
const root = process.cwd();
const localPython = resolve(
  root,
  "services/rag/.venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const python =
  process.env.RAG_PYTHON_EXECUTABLE ||
  (existsSync(localPython) ? localPython : "python");
// Mode development memantau kode Python supaya endpoint baru tidak tertahan di proses lama.
const reloadArguments = process.argv.includes("--reload")
  ? ["--reload", "--reload-dir", "src"]
  : [];
const child = spawn(
  python,
  [
    "-m",
    "uvicorn",
    "tutor_rag.api.application:app",
    "--app-dir",
    "src",
    "--host",
    "127.0.0.1",
    "--port",
    process.env.RAG_SERVICE_PORT || "8001",
    ...reloadArguments,
  ],
  {
    cwd: resolve(root, "services/rag"),
    stdio: "inherit",
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  },
);

child.on("error", (error) => {
  console.error(`Backend AI tidak dapat dijalankan: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => child.kill(signal));

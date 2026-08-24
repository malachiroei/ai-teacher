import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const character = process.argv[2] || "all";
const child = spawn(process.execPath, [path.join(here, "snapshot-tutors.mjs"), character], {
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 1));

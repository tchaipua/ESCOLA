const { cpSync, existsSync, mkdirSync } = require("node:fs");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const standaloneDirectory = resolve(root, ".next", "standalone");

if (!existsSync(standaloneDirectory)) {
  throw new Error(
    "Saída standalone ausente. Confirme output: 'standalone' no next.config.ts.",
  );
}

const publicDirectory = resolve(root, "public");
if (existsSync(publicDirectory)) {
  cpSync(publicDirectory, resolve(standaloneDirectory, "public"), {
    recursive: true,
    force: true,
  });
}

const staticDirectory = resolve(root, ".next", "static");
const standaloneStaticDirectory = resolve(
  standaloneDirectory,
  ".next",
  "static",
);
mkdirSync(standaloneStaticDirectory, { recursive: true });
cpSync(staticDirectory, standaloneStaticDirectory, {
  recursive: true,
  force: true,
});

console.log("Standalone assets prepared.");

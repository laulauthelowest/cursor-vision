#!/usr/bin/env node
/**
 * release.mjs – Automatisches Release-Script für Cursor Vision
 *
 * Was es tut:
 * 1. Tests ausführen – bricht ab wenn Tests fehlschlagen
 * 2. Versionsnummer in module.json + package.json hochzählen (patch: 1.0.0 → 1.0.1)
 * 3. Änderungen committen
 * 4. Git-Tag erstellen
 * 5. Alles pushen → GitHub Actions baut ZIP und erstellt Release automatisch
 *
 * Nutzung:
 *   npm run release           → patch (1.0.0 → 1.0.1)
 *   npm run release minor     → minor (1.0.0 → 1.1.0)
 *   npm run release major     → major (1.0.0 → 2.0.0)
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

function run(cmd, options = {}) {
  console.log(`  → ${cmd}`);
  return execSync(cmd, { cwd: ROOT, stdio: options.silent ? "pipe" : "inherit", ...options });
}

function bumpVersion(version, type) {
  const [major, minor, patch] = version.split(".").map(Number);
  if (type === "major") return `${major + 1}.0.0`;
  if (type === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`; // patch (default)
}

// ── Hauptlogik ───────────────────────────────────────────────────────────────

const bumpType = process.argv[2] ?? "patch";
if (!["patch", "minor", "major"].includes(bumpType)) {
  console.error(`❌ Ungültiger Bump-Typ: "${bumpType}". Erlaubt: patch, minor, major`);
  process.exit(1);
}

console.log("\n🔍 Prüfe ob alle Änderungen committed sind...");
const status = run("git status --porcelain --untracked-files=no", { silent: true }).toString().trim();
if (status) {
  console.error("❌ Es gibt uncommittete Änderungen. Bitte erst committen:");
  console.error(status);
  process.exit(1);
}

console.log("\n🧪 Tests ausführen...");
try {
  run("npm test");
} catch {
  console.error("\n❌ Tests fehlgeschlagen – Release abgebrochen.");
  process.exit(1);
}

console.log("\n📦 Versionsnummer hochzählen...");

// module.json aktualisieren
const moduleJsonPath = resolve(ROOT, "module.json");
const moduleJson = JSON.parse(readFileSync(moduleJsonPath, "utf8"));
const oldVersion = moduleJson.version;
const newVersion = bumpVersion(oldVersion, bumpType);
moduleJson.version = newVersion;
writeFileSync(moduleJsonPath, JSON.stringify(moduleJson, null, 2) + "\n");
console.log(`  module.json: ${oldVersion} → ${newVersion}`);

// package.json aktualisieren
const packageJsonPath = resolve(ROOT, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
packageJson.version = newVersion;
writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");
console.log(`  package.json: ${oldVersion} → ${newVersion}`);

console.log("\n📝 Committen...");
run(`git add module.json package.json`);
run(`git commit -m "chore: release v${newVersion}"`);

console.log("\n🏷️  Tag erstellen...");
run(`git tag v${newVersion}`);

console.log("\n🚀 Pushen...");
run(`git push`);
run(`git push origin v${newVersion}`);

console.log(`
✅ Fertig! v${newVersion} wurde gepusht.

GitHub Actions baut jetzt automatisch die ZIP und erstellt den Release.
Status: https://github.com/laulauthelowest/cursor-vision/actions
`);

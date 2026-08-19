
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";


const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(scriptDir, "..");

function getImportSpec(line) {
  const m = line.match(/^import\s+(?:type\s+)?(?:[\w*{}\s,]+from\s+)?["']([^"']+)["']/);
  return m ? m[1] : null;
}

function classifyImport(line) {
  const spec = getImportSpec(line);
  if (!spec) return "packages";
  if (spec.startsWith("node:")) return "node";
  if (spec.startsWith("@/") || spec.startsWith(".") || spec.startsWith("..")) return "internal";
  return "packages";
}

function isImportLine(line) {
  return line.startsWith("import ") || line.startsWith("import\t");
}

function formatFile(filePath) {
  const original = readFileSync(filePath, "utf8");
  const lines = original.split("\n");

  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;

  const imports = [];
  while (i < lines.length) {
    if (isImportLine(lines[i])) {
      imports.push(lines[i]);
      i++;
      continue;
    }
    if (lines[i].trim() === "") {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      if (j < lines.length && isImportLine(lines[j])) {
        i = j;
        continue;
      }
      break;
    }
    break;
  }

  while (i < lines.length && lines[i].trim() === "") i++;

  const body = lines.slice(i).join("\n");

  if (imports.length === 0) {
    const trimmedBody = body.replace(/^\n+/, "");
    const formatted = `\n${trimmedBody}`;
    if (formatted !== original && formatted !== original + "\n") {
      writeFileSync(filePath, formatted.endsWith("\n") ? formatted : formatted + "\n");
      return true;
    }
    return false;
  }

  const node = [];
  const packages = [];
  const internal = [];
  for (const line of imports) {
    const group = classifyImport(line);
    if (group === "node") node.push(line);
    else if (group === "packages") packages.push(line);
    else internal.push(line);
  }

  const groups = [node, packages, internal].filter((group) => group.length > 0);
  const parts = [];
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    if (groupIndex > 0) parts.push("");
    parts.push(...groups[groupIndex]);
  }
  parts.push("", "");
  parts.push(body.replace(/^\n+/, ""));

  let formatted = `\n${parts.join("\n")}`;
  if (!formatted.endsWith("\n")) formatted += "\n";

  if (formatted !== original) {
    writeFileSync(filePath, formatted);
    return true;
  }
  return false;
}

const SOURCE_EXTENSIONS = new Set([".ts", ".js", ".mjs"]);
const SOURCE_DIRS = ["src", "test", "scripts"];
const SKIP_DIR_NAMES = new Set(["dist", "node_modules"]);

function collectSourceFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry)) continue;
      results.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry))) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = SOURCE_DIRS.flatMap((dir) => collectSourceFiles(path.join(rootDir, dir)));

let changed = 0;
for (const file of files) {
  if (formatFile(file)) {
    changed++;
    console.log("formatted:", path.relative(rootDir, file));
  }
}
console.log(`done: ${changed}/${files.length} files updated`);

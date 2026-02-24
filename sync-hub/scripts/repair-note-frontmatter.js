#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { ensureNoteFrontmatter } from '../src/note-frontmatter.js';

function parseArgs(argv) {
  const args = { root: '', backup: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root' && argv[i + 1]) {
      args.root = argv[++i];
    } else if (a === '--no-backup') {
      args.backup = false;
    } else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage:\n  node sync-hub/scripts/repair-note-frontmatter.js --root <path> [--no-backup]\n\nExamples:\n  node sync-hub/scripts/repair-note-frontmatter.js --root ./sync-hub/data/workspaces/gato-main\n  node sync-hub/scripts/repair-note-frontmatter.js --root /var/lib/freecast-sync/workspaces/gato-main`);
}

function* walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '_deleted') continue;
      yield* walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      yield full;
    }
  }
}

function main() {
  const { root, backup } = parseArgs(process.argv);
  if (!root) {
    printHelp();
    process.exit(1);
  }
  const absRoot = path.resolve(root);
  if (!fs.existsSync(absRoot) || !fs.statSync(absRoot).isDirectory()) {
    console.error(`Root not found or not a directory: ${absRoot}`);
    process.exit(1);
  }

  let scanned = 0;
  let changedCount = 0;
  let backupCount = 0;

  for (const file of walk(absRoot)) {
    scanned += 1;
    const original = fs.readFileSync(file, 'utf8');
    const { content, changed } = ensureNoteFrontmatter(original);
    if (!changed) continue;

    if (backup) {
      const bakPath = `${file}.bak`;
      if (!fs.existsSync(bakPath)) {
        fs.writeFileSync(bakPath, original, 'utf8');
        backupCount += 1;
      }
    }
    fs.writeFileSync(file, content, 'utf8');
    changedCount += 1;
    console.log(`Repaired: ${path.relative(absRoot, file)}`);
  }

  console.log(`Done. scanned=${scanned} changed=${changedCount} backups=${backupCount} root=${absRoot}`);
}

main();

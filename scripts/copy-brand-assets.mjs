/**
 * Copy the brand assets this app uses out of @kokka-company/design and into
 * public/.
 *
 * The design package is the source of truth; nothing under public/brand/ or
 * the favicon set should be hand-edited. Re-run after bumping the package:
 *
 *   node scripts/copy-brand-assets.mjs
 *
 * The favicons in particular are optically corrected at 16/32/48px — the K's
 * hairlines fall below one pixel there — so they must be taken as generated
 * rather than rasterised from the SVG.
 */
import { mkdir, copyFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = join(root, "node_modules", "@kokka-company", "design");
const publicDir = join(root, "public");

/** [source relative to the package, destination relative to public/] */
const ASSETS = [
  ["logos/svg/lockup-horizontal-white.svg", "brand/lockup-horizontal-white.svg"],
  ["logos/svg/lockup-horizontal-darker.svg", "brand/lockup-horizontal-darker.svg"],
  ["logos/svg/k-mark-white.svg", "brand/k-mark-white.svg"],
  ["logos/svg/k-mark-darker.svg", "brand/k-mark-darker.svg"],

  ["logos/favicon/favicon.ico", "favicon.ico"],
  ["logos/favicon/icon-32.png", "icon-32.png"],
  ["logos/favicon/icon-192.png", "icon-192.png"],
  ["logos/favicon/icon-512.png", "icon-512.png"],
  ["logos/favicon/icon-512-maskable.png", "icon-512-maskable.png"],
  ["logos/favicon/apple-touch-icon.png", "apple-touch-icon.png"],
];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(pkg))) {
  // Not fatal: `npm install` runs this before the package may be present, and
  // a contributor without a read:packages token should still get a working
  // tree rather than a failed install.
  console.warn(
    "[brand] @kokka-company/design is not installed — skipping asset copy.\n" +
      "[brand] See .npmrc: you need a classic PAT with read:packages.",
  );
  process.exit(0);
}

let copied = 0;
for (const [from, to] of ASSETS) {
  const source = join(pkg, from);
  const destination = join(publicDir, to);

  if (!(await exists(source))) {
    console.warn(`[brand] missing in package, skipped: ${from}`);
    continue;
  }

  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  copied += 1;
}

console.log(`[brand] copied ${copied} asset(s) into public/`);

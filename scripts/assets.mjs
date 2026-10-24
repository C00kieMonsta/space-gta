/**
 * Builds a game into hashed assets and a separate HTML shell: the shell as
 * shells/<slug>.html, every other file as assets/<slug>/<name>.<hash>.<ext>, with the
 * shell's `./name` references and the stylesheets' `url(./name)` references rewritten to
 * the hashed names. Hosts serve the shell at /play/<code> and immutable files under
 * /play/assets/. Host scripts can be added through the extraAssets option.
 *
 * The build also refuses a game the play page's CSP would break: an inline script, an
 * inline style attribute, an event handler attribute, or a file fetched from another host.
 *
 * The pure parts are exported for the spec; the build runs only when invoked directly.
 */
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

export const SHELL = "index.html";
export const ASSETS = "assets";
export const SHELLS = "shells";
export const clientDirectory = fileURLToPath(
  new URL("../client/", import.meta.url)
);

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
/** `./name` after a src, an href or inside url(). */
const LOCAL_REF = /(\bhref="|\bsrc="|url\()\.\/([^")]+)/g;

export function hashedName(name, content) {
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 8);
  const ext = extname(name);
  return `${name.slice(0, name.length - ext.length)}.${hash}${ext}`;
}

/** Every `./name` becomes what the map says; a name the folder does not have is an error. */
export function rewriteRefs(text, names, where) {
  return text.replace(LOCAL_REF, (_match, lead, name) => {
    const to = names.get(name);
    if (!to) {
      throw new Error(
        `${where} refers to ./${name}, which is not in the game folder`
      );
    }
    return `${lead}${to}`;
  });
}

/** The reasons a shell or a stylesheet would not run under the play page's CSP. */
export function cspProblems(shell, sheets) {
  const problems = [];
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(shell))
    problems.push("an inline script");
  if (/\sstyle="/i.test(shell)) problems.push("a style attribute");
  if (/\son[a-z]+="/i.test(shell)) problems.push("an event handler attribute");
  if (/\b(?:src|href)="(?:https?:)?\/\//i.test(shell)) {
    problems.push("a script, stylesheet or link from another host");
  }
  for (const [name, css] of sheets) {
    if (/url\(\s*["']?(?:https?:)?\/\//i.test(css)) {
      problems.push(`${name} loads from another host`);
    }
  }
  return problems;
}

export function buildGame(srcDir, outDir, slug, options = {}) {
  const files = readdirSync(srcDir).filter(
    (file) => !file.startsWith(".") && statSync(join(srcDir, file)).isFile()
  );
  const contents = new Map(
    files.map((file) => [file, readFileSync(join(srcDir, file))])
  );
  for (const [name, content] of Object.entries(options.extraAssets || {})) {
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(name) || name.includes(".."))
      throw new Error(`Invalid host asset name: ${name}`);
    contents.set(name, Buffer.from(content));
  }
  if (!contents.has(SHELL)) throw new Error(`${slug}: no ${SHELL}`);
  const assets = [...contents.keys()].filter(
    (file) => file !== SHELL && file !== "README.md"
  );
  const sheets = assets.filter((file) => extname(file) === ".css");
  const leaves = assets.filter((file) => extname(file) !== ".css");
  const original = contents.get(SHELL).toString();
  const shellSource = options.transformShell
    ? options.transformShell(original)
    : original;
  const problems = cspProblems(
    shellSource,
    sheets.map((file) => [file, contents.get(file).toString()])
  );
  if (problems.length) {
    throw new Error(
      `${slug}: the play page's CSP would block ${problems.join(", ")}`
    );
  }

  const outAssets = join(outDir, ASSETS, slug);
  mkdirSync(outAssets, { recursive: true });
  const hashed = new Map();
  const emit = (name, content) => {
    const to = hashedName(name, content);
    writeFileSync(join(outAssets, to), content);
    hashed.set(name, to);
  };
  // Leaves first: a stylesheet's hash must cover the hashed names it points at.
  for (const file of leaves) emit(file, contents.get(file));
  if (shellSource.includes('src="./simulation.js"')) {
    const bundle = buildSync({
      entryPoints: [
        fileURLToPath(new URL("../src/simulation.ts", import.meta.url))
      ],
      bundle: true,
      platform: "browser",
      format: "iife",
      globalName: "KarmanSim",
      target: "es2020",
      write: false,
      minify: true
    });
    emit("simulation.js", Buffer.from(bundle.outputFiles[0].contents));
  }
  const beside = new Map([...hashed].map(([name, to]) => [name, `./${to}`]));
  for (const file of sheets) {
    const css = contents.get(file).toString();
    emit(file, Buffer.from(rewriteRefs(css, beside, `${slug}/${file}`)));
  }
  const fromShell = new Map(
    [...hashed].map(([name, to]) => [name, `${ASSETS}/${slug}/${to}`])
  );
  const shell = rewriteRefs(shellSource, fromShell, `${slug}/${SHELL}`);
  mkdirSync(join(outDir, SHELLS), { recursive: true });
  writeFileSync(join(outDir, SHELLS, `${slug}.html`), shell);
  return {
    slug,
    files: [...hashed.values()],
    shellBytes: Buffer.byteLength(shell)
  };
}

export function buildAll(gamesDir, outDir) {
  rmSync(outDir, { recursive: true, force: true });
  const slugs = readdirSync(gamesDir).filter(
    (entry) =>
      SLUG.test(entry) &&
      entry !== "dist" &&
      statSync(join(gamesDir, entry)).isDirectory()
  );
  return slugs.map((slug) => buildGame(join(gamesDir, slug), outDir, slug));
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const built = buildGame(clientDirectory, resolve("dist/game"), "karman-line");
  process.stdout.write(
    `${built.slug}: ${built.files.length} assets, shell ${built.shellBytes} bytes\n`
  );
}

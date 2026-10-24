import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

type Build = typeof import("../scripts/assets.mjs", {
  with: { "resolution-mode": "import" }
});

// The backend compiles to CommonJS and the script is an ES module, so it is loaded here.
let hashedName: Build["hashedName"];
let rewriteRefs: Build["rewriteRefs"];
let cspProblems: Build["cspProblems"];
let buildGame: Build["buildGame"];

beforeAll(async () => {
  const build = await import("../scripts/assets.mjs");
  hashedName = build.hashedName;
  rewriteRefs = build.rewriteRefs;
  cspProblems = build.cspProblems;
  buildGame = build.buildGame;
});

describe("hashedName", () => {
  it("puts eight hex characters of the content before the extension", () => {
    expect(hashedName("game.js", "a")).toMatch(/^game\.[a-f0-9]{8}\.js$/);
    expect(hashedName("game.js", "a")).not.toBe(hashedName("game.js", "b"));
    expect(hashedName("font.woff2", "x")).toMatch(/\.woff2$/);
  });
});

describe("rewriteRefs", () => {
  it("rewrites src, href and url() references and nothing else", () => {
    const names = new Map([
      ["game.js", "assets/g/game.1.js"],
      ["a.css", "assets/g/a.2.css"]
    ]);
    const out = rewriteRefs(
      '<link href="./a.css"><script src="./game.js"></script><a href="https://x.y/">x</a>',
      names,
      "g"
    );
    expect(out).toBe(
      '<link href="assets/g/a.2.css"><script src="assets/g/game.1.js"></script><a href="https://x.y/">x</a>'
    );
    expect(
      rewriteRefs(
        "src:url(./f.woff2)",
        new Map([["f.woff2", "./f.3.woff2"]]),
        "g"
      )
    ).toBe("src:url(./f.3.woff2)");
  });

  it("refuses a reference to a file the folder does not have", () => {
    expect(() =>
      rewriteRefs('<script src="./nope.js">', new Map(), "g")
    ).toThrow(/nope\.js/);
  });
});

describe("cspProblems", () => {
  it("names everything the play page's CSP would block", () => {
    const shell =
      '<script>x()</script><div style="a:b"></div><b onclick="y()"></b><script src="https://cdn/x.js"></script>';
    expect(
      cspProblems(shell, [["a.css", "@font-face{src:url(https://fonts/x)}"]])
    ).toEqual([
      "an inline script",
      "a style attribute",
      "an event handler attribute",
      "a script, stylesheet or link from another host",
      "a.css loads from another host"
    ]);
  });

  it("accepts local scripts, sheets and fonts", () => {
    expect(
      cspProblems('<link href="./a.css"><script src="./g.js"></script>', [
        ["a.css", "@font-face{src:url(./f.woff2)}"]
      ])
    ).toEqual([]);
  });
});

describe("buildGame", () => {
  it("hashes the assets, rewrites the shell and the stylesheet, and keeps the shell out of assets", () => {
    const src = mkdtempSync(join(tmpdir(), "game-src-"));
    const out = mkdtempSync(join(tmpdir(), "game-out-"));
    writeFileSync(
      join(src, "index.html"),
      '<link href="./a.css"><script src="./g.js"></script>'
    );
    writeFileSync(join(src, "a.css"), "@font-face{src:url(./f.woff2)}");
    writeFileSync(join(src, "g.js"), "void 0");
    writeFileSync(join(src, "f.woff2"), "wOF2");
    const built = buildGame(src, out, "demo");
    const assets = readdirSync(join(out, "assets", "demo")).sort();
    expect(assets).toHaveLength(3);
    expect(
      assets.every((name) => /\.[a-f0-9]{8}\.(css|js|woff2)$/.test(name))
    ).toBe(true);
    expect(readdirSync(out).sort()).toEqual(["assets", "shells"]);
    const shell = readFileSync(join(out, "shells", "demo.html"), "utf8");
    const css = assets.find((name) => name.endsWith(".css")) ?? "";
    const js = assets.find((name) => name.endsWith(".js")) ?? "";
    const font = assets.find((name) => name.endsWith(".woff2")) ?? "";
    expect(shell).toBe(
      `<link href="assets/demo/${css}"><script src="assets/demo/${js}"></script>`
    );
    expect(readFileSync(join(out, "assets", "demo", css), "utf8")).toBe(
      `@font-face{src:url(./${font})}`
    );
    expect(built.files.sort()).toEqual(assets);
  });

  it("refuses a game the CSP would break", () => {
    const src = mkdtempSync(join(tmpdir(), "game-bad-"));
    const out = mkdtempSync(join(tmpdir(), "game-bad-out-"));
    writeFileSync(join(src, "index.html"), "<script>boom()</script>");
    expect(() => buildGame(src, out, "bad")).toThrow(/inline script/);
  });
});

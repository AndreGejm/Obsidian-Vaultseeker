import esbuild from "esbuild";
import process from "node:process";
import builtins from "builtin-modules";

const production = process.argv[2] === "production";
const nodeBuiltins = builtins.flatMap((builtin) => [builtin, `node:${builtin}`]);

await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/autocomplete", "@codemirror/collab", "@codemirror/commands", "@codemirror/language", "@codemirror/lint", "@codemirror/search", "@codemirror/state", "@codemirror/view", "@lezer/common", "@lezer/highlight", "@lezer/lr", ...nodeBuiltins],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: "dist/main.js"
});

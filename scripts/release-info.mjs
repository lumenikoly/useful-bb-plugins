import { appendFileSync, readFileSync } from "node:fs";

const tag = process.argv[2];
const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)-v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag ?? "");
if (!match) throw new Error("Expected a tag such as project-themes-v0.1.0");
const [, name, version] = match;
const collection = JSON.parse(readFileSync(new URL("../.bb/plugins.json", import.meta.url), "utf8"));
const entry = collection.plugins.find((plugin) => plugin.name === name);
if (!entry || entry.source !== `./plugins/${name}`) throw new Error(`Unknown plugin: ${name}`);
const manifest = JSON.parse(readFileSync(new URL(`../plugins/${name}/package.json`, import.meta.url), "utf8"));
if (manifest.version !== version) throw new Error(`Tag version ${version} differs from package version ${manifest.version}`);
const info = { name, version, package: manifest.name, directory: `plugins/${name}`, tag };
if (process.env.GITHUB_OUTPUT) {
  for (const [key, value] of Object.entries(info)) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}
console.log(JSON.stringify(info, null, 2));

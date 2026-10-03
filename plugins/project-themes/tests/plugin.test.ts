import assert from "node:assert/strict";
import test from "node:test";
import { createFakePluginHost, experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";
import plugin from "../src/server.ts";
import { defaultTheme, themeCss } from "../src/theme.ts";

test("themes stay isolated, validate input and survive reload; reset affects one project", async () => {
  const host = createFakePluginHost({
    pluginId: "project-themes",
    sdk: { projects: { get: async ({ projectId }) => {
      if (!projectId.startsWith("proj_")) throw new Error("Unknown project");
      return { id: projectId } as never;
    } } },
  });
  let { harness } = host;
  plugin(host.bb);
  const sage = defaultTheme();
  sage.threads = true;
  const rose = defaultTheme();
  rose.color = "#BE9AA5";
  await Promise.all([
    harness.behavior.callRpc("save", { projectId: "proj_one", theme: sage }),
    harness.behavior.callRpc("save", { projectId: "proj_two", theme: rose }),
  ]);
  ({ harness } = await harness.lifecycle.reload(plugin));
  const listed = await harness.behavior.callRpc("list", null) as { themes: Record<string, typeof sage> };
  assert.equal(Object.keys(listed.themes).length, 2);
  assert.equal(listed.themes.proj_one.threads, true);
  assert.equal(listed.themes.proj_two.color, "#be9aa5");
  await assert.rejects(harness.behavior.callRpc("save", { projectId: 'proj_"]{}', theme: sage }));
  await assert.rejects(harness.behavior.callRpc("save", { projectId: "proj_one", theme: { ...sage, color: "red; color: transparent" } }));
  await assert.rejects(harness.behavior.callRpc("save", { projectId: "missing", theme: sage }));
  await harness.behavior.callRpc("reset", { projectId: "proj_one" });
  const reset = await harness.behavior.callRpc("list", null) as typeof listed;
  assert.deepEqual(Object.keys(reset.themes), ["proj_two"]);
  await harness.lifecycle.dispose();
});

test("disabled surfaces produce no CSS; project navigation only changes the active background and browser", () => {
  const first = defaultTheme();
  first.threads = first.background = first.browser = false;
  assert.equal(themeCss({ proj_one: first }, "proj_one"), "");
  first.threads = first.background = first.browser = true;
  const own = themeCss({ proj_one: first }, "proj_one");
  assert.match(own, /\/projects\/proj_one\/threads\//);
  assert.match(own, /--background:/);
  assert.match(own, /secondary-panel-tab-strip/);
  const other = themeCss({ proj_one: first }, "proj_two");
  assert.match(other, /\/projects\/proj_one\/threads\//);
  assert.doesNotMatch(other, /--background:|secondary-panel-tab-strip/);
  assert.doesNotMatch(themeCss({ 'bad"]{}': first }, null), /bad/);
});

test("plugin imports only public SDK surfaces", async () => {
  const scan = experimental_scanPublicSdkOnly(new URL("..", import.meta.url).pathname, { allow: [/^react$/, /^jsdom$/] });
  assert.deepEqual(scan.violations, []);
  assert.deepEqual(scan.privateDependencies, []);
});

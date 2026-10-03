import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { defaultTheme } from "../src/theme.ts";
import { mountAppearance, publishAppearance } from "../src/appearance.ts";

test("content-script cleanup restores icons and CSS and ignores late image loads", () => {
  const dom = new JSDOM('<html><head><link rel="icon" href="/original.png"></head><body></body></html>');
  for (const name of ["window", "document", "Event", "MutationObserver", "HTMLLinkElement"] as const) {
    Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
  }
  const loads: (() => void)[] = [];
  Object.defineProperty(globalThis, "Image", { configurable: true, value: class {
    onload = () => {};
    width = 32; height = 32;
    set src(_value: string) { loads.push(() => this.onload()); }
  } });
  const context = { drawImage() {}, fillRect() {}, globalCompositeOperation: "", fillStyle: "" };
  dom.window.HTMLCanvasElement.prototype.getContext = (() => context) as never;
  dom.window.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,owned";
  const theme = defaultTheme();
  theme.browser = theme.background = true;
  const controller = new AbortController();
  publishAppearance({ themes: { proj_one: theme }, projectId: "proj_one" });
  const dispose = mountAppearance(controller.signal);
  loads.shift()!();
  const icon = dom.window.document.querySelector("link")!;
  assert.equal(icon.getAttribute("href"), "data:image/png;base64,owned");
  assert.match(dom.window.document.querySelector("style")!.textContent!, /--background:/);
  publishAppearance({ themes: { proj_one: theme }, projectId: "proj_two" });
  assert.equal(icon.getAttribute("href"), "/original.png");
  const css = dom.window.document.querySelector("style")!.textContent!;
  assert.match(css, /\/projects\/proj_one\/threads\//);
  assert.doesNotMatch(css, /--background:|secondary-panel-tab-strip/);
  publishAppearance({ themes: {}, projectId: null });
  assert.equal(dom.window.document.querySelector("style")!.textContent, "");
  publishAppearance({ themes: { proj_one: theme }, projectId: "proj_one" });
  controller.abort();
  loads.forEach((load) => load());
  dispose();
  assert.equal(icon.getAttribute("href"), "/original.png");
  assert.equal(dom.window.document.querySelector("style"), null);
  dom.window.close();
});

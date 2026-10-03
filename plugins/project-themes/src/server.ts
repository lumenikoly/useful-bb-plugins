import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const projectIdSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/).max(128);
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/).transform((value) => value.toLowerCase());
const surfaceSchema = z.object({ enabled: z.boolean(), color: colorSchema }).strict();
export const themeSchema = z.object({
  color: colorSchema, threads: z.boolean(), browser: z.boolean(), background: z.boolean(),
}).strict();
// Read settings saved by the first version without losing project switches.
const storedThemeSchema = z.union([themeSchema, z.object({
  threads: surfaceSchema, browser: surfaceSchema, background: surfaceSchema,
}).strict().transform((theme) => ({
  color: theme.threads.color, threads: theme.threads.enabled,
  browser: theme.browser.enabled, background: theme.background.enabled,
}))]);
export const rpcContract = defineRpcContract({
  list: { input: z.null(), output: z.object({ themes: z.record(projectIdSchema, themeSchema) }) },
  save: { input: z.object({ projectId: projectIdSchema, theme: themeSchema }).strict(), output: themeSchema },
  reset: { input: z.object({ projectId: projectIdSchema }).strict(), output: z.null() },
});

export default function plugin(bb: BbPluginApi) {
  bb.rpc.register(rpcContract, {
    list: async () => {
      const keys = await bb.storage.kv.list("theme:");
      const entries = await Promise.all(keys.map(async (key) => {
        const id = projectIdSchema.safeParse(key.slice(6));
        const theme = storedThemeSchema.safeParse(await bb.storage.kv.get(key));
        return id.success && theme.success ? [[id.data, theme.data] as const] : [];
      }));
      return { themes: Object.fromEntries(entries.flat()) };
    },
    save: async ({ projectId, theme }) => {
      await bb.sdk.projects.get({ projectId });
      await bb.storage.kv.set(`theme:${projectId}`, theme);
      bb.realtime.publish("themes-changed", { projectId });
      return theme;
    },
    reset: async ({ projectId }) => {
      await bb.sdk.projects.get({ projectId });
      await bb.storage.kv.delete(`theme:${projectId}`);
      bb.realtime.publish("themes-changed", { projectId });
      return null;
    },
  });
}

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import {
  definePluginApp, experimental_useSidebarThreads, useBbContext,
  useRealtime, useRealtimeConnectionState, useRpc,
} from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import { mountAppearance, publishAppearance } from "./appearance";
import { defaultTheme, PALETTE, SURFACES, tint, type ProjectTheme, type Themes } from "./theme";
import "./app.css";

function useThemes() {
  const rpc = useRpc<typeof rpcContract>();
  const [themes, setThemes] = useState<Themes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const refetch = useCallback(async () => {
    const request = ++revision.current;
    try {
      const result = await rpc.call("list");
      if (request !== revision.current) return;
      setThemes(result.themes);
      setError(null);
    } catch {
      if (request === revision.current) setError("Не удалось загрузить цвета. Повторите попытку.");
    }
  }, [rpc]);
  useEffect(() => { void refetch(); return () => { revision.current++; }; }, [refetch]);
  useRealtime("themes-changed", refetch);
  const connection = useRealtimeConnectionState();
  useEffect(() => { if (connection === "connected") void refetch(); }, [connection, refetch]);
  return { rpc, themes, error, refetch };
}

function AppearanceSync() {
  const { themes } = useThemes();
  const { projectId } = useBbContext();
  const { projects } = experimental_useSidebarThreads();
  useEffect(() => {
    const defaults = Object.fromEntries(projects.map((project) => [project.id, defaultTheme(project.id)]));
    if (projectId && !defaults[projectId]) defaults[projectId] = defaultTheme(projectId);
    publishAppearance({ themes: themes === null ? {} : { ...defaults, ...themes }, projectId });
  }, [themes, projectId, projects]);
  useEffect(() => () => { publishAppearance({ themes: {}, projectId: null }); }, []);
  return null;
}

function ThemeEditor({ projectId, initialTheme, configured, rpc, refetch }: {
  projectId: string; initialTheme: ProjectTheme; configured: boolean;
  rpc: ReturnType<typeof useThemes>["rpc"]; refetch: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(initialTheme);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const id = useId();
  const persisted = JSON.stringify(initialTheme);
  const previous = useRef(persisted);
  useEffect(() => {
    const last = previous.current;
    previous.current = persisted;
    // Sync remote changes when the form is clean; keep unsaved edits intact.
    setDraft((current) => JSON.stringify(current) === last ? JSON.parse(persisted) as ProjectTheme : current);
  }, [persisted]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialTheme);
  function change(patch: Partial<ProjectTheme>) {
    setDraft((current) => ({ ...current, ...patch }));
    setMessage("");
    setError("");
  }
  async function persist(reset = false) {
    setPending(true);
    setError("");
    try {
      if (reset) {
        await rpc.call("reset", { projectId });
        setDraft(defaultTheme(projectId));
      } else await rpc.call("save", { projectId, theme: draft });
      await refetch();
      setMessage(reset ? "Цвета проекта сброшены." : "Цвета сохранены.");
    } catch {
      setError("Не удалось сохранить цвета. Изменения остались в форме — попробуйте ещё раз.");
    } finally { setPending(false); }
  }
  return <>
    <fieldset className="pt-editor" disabled={pending}>
      <legend className="pt-sr-only">Цвета элементов</legend>
      <div className="pt-project-color">
        <span className="pt-label">Цвет проекта</span>
        <div className="pt-colors" role="group" aria-label="Цвет проекта">
          <div className="pt-swatches">
            {PALETTE.map(({ name, color }) => <button type="button" className="pt-swatch" style={{ "--pt-swatch": color } as CSSProperties} key={color} aria-label={`Цвет проекта: ${name}`} aria-pressed={draft.color === color} title={name} onClick={() => change({ color })} />)}
          </div>
          <label className="pt-custom">
            <input type="color" value={draft.color} aria-label="Свой цвет проекта" onChange={(event) => change({ color: event.target.value })} />
            <span>Свой цвет</span><span className="pt-hex">{draft.color.toUpperCase()}</span>
          </label>
        </div>
      </div>
      {SURFACES.map(({ id: surfaceId, title, description }) => <div className="pt-surface" key={surfaceId}>
        <div className="pt-surface-heading">
          <div><label className="pt-label" htmlFor={`${id}-${surfaceId}`}>{title}</label><p className="pt-hint">{description}</p></div>
          <input id={`${id}-${surfaceId}`} className="pt-toggle" type="checkbox" role="switch" checked={draft[surfaceId]} onChange={(event) => change({ [surfaceId]: event.target.checked })} aria-label={`Окрашивать: ${title}`} />
        </div>
      </div>)}
    </fieldset>
    <div className="pt-preview" aria-label="Предпросмотр цветов" style={{
      background: draft.background ? tint(draft.color, "var(--canvas)", 7) : "var(--background)",
    }}>
      <div className="pt-preview-sidebar"><span className="pt-preview-label">Треды</span><div className="pt-preview-thread" style={{ background: draft.threads ? tint(draft.color, "var(--sidebar)", 20) : "var(--sidebar-accent)" }}>Ваш проект</div></div>
      <div className="pt-preview-main"><span className="pt-preview-tab" style={{ background: draft.browser ? tint(draft.color, "var(--sidebar)", 22) : "var(--sidebar)" }}><span className="pt-preview-dot" style={{ background: draft.browser ? draft.color : "var(--muted-foreground)" }} />Browser</span><span className="pt-preview-label">Предпросмотр</span></div>
    </div>
    <div className="pt-footer">
      <button type="button" className="pt-button pt-save" disabled={pending || !dirty} onClick={() => void persist()}>{pending ? "Сохранение…" : "Сохранить"}</button>
      <button type="button" className="pt-button pt-reset" disabled={pending || (!configured && !dirty)} onClick={() => void persist(true)}>Сбросить</button>
      <span className="pt-hint" role="status">{dirty ? "Есть несохранённые изменения" : message || "Изменения применяются после сохранения"}</span>
    </div>
    {error && <p className="pt-error" role="alert">{error}</p>}
  </>;
}

function ThemeSettings() {
  const { rpc, themes, error, refetch } = useThemes();
  const { projects, status } = experimental_useSidebarThreads();
  const context = useBbContext();
  const [selection, setSelection] = useState("");
  const projectId = projects.some((project) => project.id === selection) ? selection : projects.some((project) => project.id === context.projectId) ? context.projectId : projects[0]?.id;
  const id = useId();
  return <section className="pt-settings">
    <p className="pt-intro">У каждого проекта — свой мягкий акцент. Выберите, какие элементы окрашивать.</p>
    {error || status === "error" ? <div className="pt-error" role="alert">{error || "Не удалось загрузить проекты."} <button className="pt-link" onClick={() => { if (status === "error") window.location.reload(); else void refetch(); }}>Повторить</button></div> : null}
    {themes === null || status === "loading" ? <p className="pt-hint" role="status">Загрузка проектов и цветов…</p> : projects.length === 0 ? <p className="pt-hint">Создайте проект в bb, чтобы настроить его цвета.</p> : <>
      <label className="pt-label" htmlFor={id}>Проект</label>
      <select id={id} className="pt-select" value={projectId ?? ""} onChange={(event) => setSelection(event.target.value)}>{projects.map((project) => <option value={project.id} key={project.id}>{project.isPersonal ? "Личные треды" : project.name}</option>)}</select>
      {projectId && <ThemeEditor key={projectId} projectId={projectId} initialTheme={themes[projectId] ?? defaultTheme(projectId)} configured={!!themes[projectId]} rpc={rpc} refetch={refetch} />}
    </>}
  </section>;
}

export default definePluginApp((app) => {
  app.slots.settingsSection({ id: "project-colors", title: "Цвета проектов", component: ThemeSettings });
  app.slots.experimental_appOverlay({ id: "appearance-sync", component: AppearanceSync });
  app.contentScripts.register({ id: "project-appearance", mount: ({ signal }) => mountAppearance(signal) });
});

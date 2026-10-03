import { themeCss, type Themes } from "./theme.ts";

const APPEARANCE_EVENT = "bb:project-themes:appearance";
type Appearance = { themes: Themes; projectId: string | null };
let appearance: Appearance = { themes: {}, projectId: null };
export function publishAppearance(next: Appearance) {
  appearance = next;
  window.dispatchEvent(new Event(APPEARANCE_EVENT));
}
/** Owns one stylesheet and only the favicon hrefs it changes. */
export function mountAppearance(signal: AbortSignal): () => void {
  const style = document.createElement("style");
  style.dataset.projectThemes = "";
  document.head.append(style);
  const icons = new Map<HTMLLinkElement, { original: string; owned: string | null }>();
  let revision = 0;
  let disposed = false;
  function restoreIcons() {
    for (const [link, state] of icons) {
      if (state.owned !== null && link.getAttribute("href") === state.owned) link.setAttribute("href", state.original);
    }
    icons.clear();
  }
  function update() {
    if (disposed || signal.aborted) return;
    const version = ++revision;
    const { themes, projectId } = appearance;
    const css = themeCss(themes, projectId);
    if (style.textContent !== css) style.textContent = css;
    const theme = projectId ? themes[projectId] : undefined;
    if (!theme?.browser || !/^#[0-9a-f]{6}$/i.test(theme.color)) { restoreIcons(); return; }
    for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')) {
      const href = link.getAttribute("href");
      if (!href) continue;
      let state = icons.get(link);
      if (!state) { state = { original: href, owned: null }; icons.set(link, state); }
      else if (href !== state.owned) state.original = href;
      const image = new Image();
      image.onload = () => {
        if (disposed || signal.aborted || version !== revision || !link.isConnected) return;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 32;
        const context = canvas.getContext("2d");
        if (!context) return;
        try {
          context.drawImage(image, 0, 0, 32, 32);
          context.globalCompositeOperation = "source-in";
          context.fillStyle = theme.color;
          context.fillRect(0, 0, 32, 32);
          context.globalCompositeOperation = "source-over";
          // BB's unread dot is at (28, 6) in a 32px favicon.
          context.drawImage(image, image.width * .75, 0, image.width * .25, image.height * .32, 24, 0, 8, 10);
          state.owned = canvas.toDataURL("image/png");
          link.setAttribute("href", state.owned);
        } catch { /* Keep the host favicon if an asset cannot be read. */ }
      };
      image.src = state.original;
    }
  }
  const observer = new MutationObserver((changes) => {
    if (changes.some((change) => {
      const link = change.target;
      return link instanceof HTMLLinkElement && link.rel === "icon" && link.getAttribute("href") !== icons.get(link)?.owned;
    })) update();
  });
  observer.observe(document.head, { subtree: true, attributes: true, attributeFilter: ["href"] });
  window.addEventListener(APPEARANCE_EVENT, update);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    revision++;
    observer.disconnect();
    window.removeEventListener(APPEARANCE_EVENT, update);
    signal.removeEventListener("abort", dispose);
    style.remove();
    restoreIcons();
  };
  signal.addEventListener("abort", dispose, { once: true });
  update();
  return dispose;
}

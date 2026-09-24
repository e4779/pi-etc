// pi-web-plugin.js — Diagrams plugin for PI WEB (apiVersion 4).
//
// 1) contentRenderer: draws ```drawio fences and .drawio files inline
//    (chat, Files preview) inside a sandboxed iframe that runs the
//    official viewer-static build.
// 2) workspace panel: renders diagrams/*.mmd (mermaid) and
//    diagrams/*.drawio from the workspace, live-polling every 4s.

const MERMAID_URL = new URL("./vendor/mermaid.min.js", import.meta.url).href;
const VIEWER_URL = new URL("./vendor/viewer-static.min.js", import.meta.url).href;
const RENDERER_URL = new URL("./vendor/renderer.html", import.meta.url).href;
const POLL_MS = 4000;
const DIAGRAM_EXT = /\.(mmd|drawio)$/i;

// ---------- vendor loaders (panel side) ----------

const scriptPromises = new Map();
function loadScript(src) {
  let p = scriptPromises.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => {
        scriptPromises.delete(src);
        reject(new Error("Failed to load " + src));
      };
      document.head.appendChild(el);
    });
    scriptPromises.set(src, p);
  }
  return p;
}

let mermaidReady = false;
async function ensureMermaid() {
  await loadScript(MERMAID_URL);
  const mermaid = window.mermaid;
  if (!mermaid) throw new Error("mermaid global missing after script load");
  if (!mermaidReady) {
    mermaid.initialize({ startOnLoad: false, securityLevel: "loose", theme: "neutral" });
    mermaidReady = true;
  }
  return mermaid;
}

async function ensureViewer() {
  await loadScript(VIEWER_URL);
  if (!window.GraphViewer) throw new Error("GraphViewer global missing after script load");
  // Shadow-boundary shim: PI WEB renders panels inside shadow roots, and
  // mxUtils.convertPoint climbs parentNode chains across that boundary,
  // handing the non-Element ShadowRoot to getComputedStyle (TypeError on
  // every mouse event). Returning null for non-Elements is safe: callers
  // treat it as "no style info" and stop climbing.
  const mx = window.mxUtils;
  if (mx && typeof mx.getCurrentStyle === "function" && !mx.__piWebShadowShim) {
    const origGetCurrentStyle = mx.getCurrentStyle;
    mx.getCurrentStyle = function (node) {
      if (node != null && node.nodeType !== 1) return null;
      return origGetCurrentStyle.apply(this, arguments);
    };
    mx.__piWebShadowShim = true;
  }
  return window.GraphViewer;
}

// ---------- workspace scanning (panel) ----------

async function listDiagrams(files) {
  const out = new Map();
  for (const dir of ["diagrams", ""]) {
    try {
      const listing = await files.listFiles(dir);
      for (const entry of listing.entries ?? []) {
        if (entry.type === "file" && DIAGRAM_EXT.test(entry.name)) out.set(entry.path, entry);
      }
    } catch {
      // optional directory — ignore
    }
  }
  return [...out.values()].sort((a, b) => a.path.localeCompare(b.path));
}

const stampOf = (entry) => entry ? entry.path + ":" + (entry.size ?? "?") + ":" + (entry.modifiedAt ?? "?") : "";

// ---------- chat/Files renderer element (drawio) ----------

class DrawioPreview extends HTMLElement {
  set input(v) { this._input = v; if (this.isConnected) this._go(); }
  set rendererUrl(v) { this._url = v; if (this.isConnected) this._go(); }

  connectedCallback() {
    this.style.display = "block";
    if (!this._iframe) {
      const f = document.createElement("iframe");
      f.title = "Drawio diagram";
      f.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox");
      f.setAttribute("referrerpolicy", "no-referrer");
      f.style.cssText = "display:block;width:100%;border:0;background:#ffffff;height:340px";
      this.appendChild(f);
      this._iframe = f;
      this._loaded = false;
      this._handler = (e) => {
        if (e.source !== this._iframe?.contentWindow) return;
        const d = e.data;
        if (!d || typeof d !== "object" || !("type" in d)) return;
        const inp = this._input;
        if (d.type === "drawio-ready") {
          this._loaded = true;
          this._post();
        } else if (d.type === "drawio-rendered" && typeof d.height === "number" && Number.isFinite(d.height)) {
          f.style.height = Math.min(1600, Math.max(120, d.height + 24)) + "px";
        } else if (d.type === "drawio-error") {
          try { inp?.fail?.(new Error(String(d.message ?? "drawio render failed"))); } catch { /* best effort */ }
        }
      };
      window.addEventListener("message", this._handler);
      f.addEventListener("load", () => { this._loaded = true; this._post(); });
      f.src = this._url ?? "";
    }
  }

  disconnectedCallback() {
    if (this._handler) window.removeEventListener("message", this._handler);
    this._handler = null;
    this._iframe = null;
    this._loaded = false;
  }

  _go() { this._post(); }

  _post() {
    const inp = this._input;
    if (!this._loaded || !this._iframe?.contentWindow || !inp || inp.signal?.aborted) return;
    this._iframe.contentWindow.postMessage({ type: "drawio-render", xml: inp.text ?? "" }, "*");
  }
}

if (typeof window !== "undefined" && window.customElements) {
  if (!window.customElements.get("pi-web-drawio-preview")) window.customElements.define("pi-web-drawio-preview", DrawioPreview);
}

// ---------- workspace panel element ----------

class DiagramsViewer extends HTMLElement {
  constructor() {
    super();
    this._ctx = null;
    this._booted = false;
    this._files = [];
    this._listJson = "";
    this._selected = null;
    this._renderedStamp = "";
    this._renderSeq = 0;
    this._timer = null;
  }

  set ctx(value) {
    const changed = !this._ctx || !value ||
      this._ctx.machine?.id !== value.machine?.id ||
      this._ctx.workspace?.id !== value.workspace?.id;
    this._ctx = value;
    if (changed && this.isConnected) {
      this._booted = false;
      void this._bootstrap();
    }
  }

  get ctx() { return this._ctx; }

  connectedCallback() {
    if (!this._select) this._buildDom();
    if (this._ctx && !this._booted) void this._bootstrap();
  }

  disconnectedCallback() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  _wsKey() {
    const c = this._ctx;
    return c ? (c.machine?.id ?? "?") + ":" + (c.workspace?.id ?? "?") : "?";
  }

  _buildDom() {
    this.style.cssText = "display:block;padding:4px;padding-top:8px;box-sizing:border-box";
    this.innerHTML = [
      '<section class="toolbar">',
      '  <strong>Diagrams</strong>',
      '  <select style="flex:1;min-width:0" aria-label="Diagram file"></select>',
      '  <button type="button" title="Refresh">\u21bb</button>',
      '</section>',
      '<section class="viewer" style="margin-top:8px">',
      '  <p class="muted hint">loading\u2026</p>',
      '  <div class="stage"></div>',
      '</section>',
    ].join("\n");
    this._select = this.querySelector("select");
    this._hint = this.querySelector(".hint");
    this._stage = this.querySelector(".stage");
    this._stage.style.cssText = "width:100%;max-height:72vh;min-height:120px;overflow:auto;background:#ffffff;border-radius:6px";
    this._select.addEventListener("change", () => {
      this._selected = this._select.value || null;
      void this._renderSelected(true);
    });
    this.querySelector("button").addEventListener("click", () => void this._refresh(true));
  }

  async _bootstrap() {
    this._booted = true;
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => void this._refresh(false), POLL_MS);
    await this._refresh(true);
  }

  async _refresh(force) {
    const ctx = this._ctx;
    if (!ctx || !this._select) return;
    try {
      const files = await listDiagrams(ctx.files);
      const json = JSON.stringify(files.map((f) => [f.path, f.size ?? null, f.modifiedAt ?? null]));
      const listChanged = json !== this._listJson;
      this._files = files;
      this._listJson = json;

      if (this._selected && !files.some((f) => f.path === this._selected)) this._selected = null;
      if (!this._selected) this._selected = files[0] ? files[0].path : null;
      this._syncSelect();

      const sel = files.find((f) => f.path === this._selected) ?? null;
      const stamp = stampOf(sel);
      if (force || stamp !== this._renderedStamp) {
        await this._renderSelected(false, stamp);
      } else if (listChanged) {
        this._setHint(files.length === 0);
      }
    } catch (err) {
      this._showError(err);
    }
  }

  _syncSelect() {
    const paths = this._files.map((f) => f.path).join("\u0000");
    if (paths !== (this._selectPaths ?? "")) {
      this._selectPaths = paths;
      this._select.textContent = "";
      for (const f of this._files) {
        const opt = document.createElement("option");
        opt.value = f.path;
        opt.textContent = f.path;
        this._select.appendChild(opt);
      }
    }
    this._select.value = this._selected ?? "";
    this._select.disabled = this._files.length === 0;
  }

  _setHint(empty) {
    if (empty) {
      this._hint.hidden = false;
      this._hint.textContent =
        "\u041d\u0435\u0442 \u0434\u0438\u0430\u0433\u0440\u0430\u043c\u043c \u0432 workspace. \u041f\u043e\u043f\u0440\u043e\u0441\u0438\u0442\u0435 \u0430\u0433\u0435\u043d\u0442\u0430 \u0441\u043e\u0437\u0434\u0430\u0442\u044c diagrams/example.mmd (mermaid) \u0438\u043b\u0438 diagrams/example.drawio.";
      this._stage.textContent = "";
    } else {
      this._hint.hidden = true;
    }
  }

  _showError(err) {
    this._hint.hidden = false;
    this._hint.textContent = "Diagrams plugin: " + String((err && err.message) || err);
  }

  async _renderSelected(force, stamp) {
    const ctx = this._ctx;
    if (!ctx || !this._stage) return;
    const seq = ++this._renderSeq;
    if (!this._selected) {
      this._renderedStamp = "";
      this._stage.textContent = "";
      this._setHint(true);
      return;
    }
    this._setHint(false);
    if (!force && stamp === this._renderedStamp && this._stage.childNodes.length > 0) return;
    this._hint.hidden = false;
    this._hint.textContent = "rendering " + this._selected + "\u2026";
    try {
      const file = await ctx.files.readFile(this._selected);
      if (seq !== this._renderSeq) return;
      if (file.binary) throw new Error("binary file, cannot render");
      const content = file.content ?? "";
      if (/\.drawio$/i.test(this._selected)) await this._renderDrawio(content);
      else await this._renderMermaid(content);
      if (seq !== this._renderSeq) return;
      this._renderedStamp = stamp;
      this._setHint(false);
    } catch (err) {
      if (seq !== this._renderSeq) return;
      this._stage.textContent = "";
      const pre = document.createElement("pre");
      pre.style.cssText = "white-space:pre-wrap;color:#c0392b;margin:0";
      pre.textContent = String((err && err.message) || err);
      this._stage.appendChild(pre);
    }
  }

  async _renderMermaid(code) {
    const mermaid = await ensureMermaid();
    const id = "diagrams-mmd-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    const { svg } = await mermaid.render(id, code);
    this._clearStage();
    const box = document.createElement("div");
    box.style.cssText = "width:100%";
    box.innerHTML = svg;
    const svgEl = box.querySelector("svg");
    if (svgEl) {
      svgEl.removeAttribute("style");
      svgEl.style.maxWidth = "none";
    }
    this._stage.appendChild(box);
  }

  async _renderDrawio(xml) {
    const GraphViewer = await ensureViewer();
    if (this._viewer) {
      try {
        const g = this._viewer.graph;
        if (g && typeof g.destroy === "function") g.destroy();
      } catch { /* best effort */ }
      try {
        if (typeof this._viewer.destroy === "function") this._viewer.destroy();
      } catch { /* best effort */ }
    }
    this._viewer = null;
    this._clearStage();
    const holder = document.createElement("div");
    holder.className = "mxgraph";
    holder.style.cssText = "width:100%;min-width:100%;min-height:300px";
    holder.setAttribute(
      "data-mxgraph",
      JSON.stringify({
        xml, highlight: "#0000ff", nav: true, resize: true, "dark-mode": "auto",
        toolbar: "zoom layers tags lightbox", "check-visible-state": false,
        "auto-fit": true, "toolbar-nohide": true,
        edit: "_blank",
      }),
    );
    this._stage.appendChild(holder);
    this._viewer = GraphViewer.createViewerForElement(holder);
  }

  _clearStage() {
    this._stage.textContent = "";
  }
}

if (typeof window !== "undefined" && window.customElements) {
  if (!window.customElements.get("diagrams-viewer")) window.customElements.define("diagrams-viewer", DiagramsViewer);
}

// ---------- plugin definition (apiVersion 4) ----------

const plugin = {
  apiVersion: 4,
  name: "Diagrams Plugin",
  requires: [{ pluginId: "pi-web", id: "content-rendering", version: 1, parse: () => undefined }],
  activate: ({ html, svg }) => {
    if (typeof window !== "undefined" && window.customElements && !window.customElements.get("diagrams-viewer")) {
      window.customElements.define("diagrams-viewer", DiagramsViewer);
    }
    return {
      contributions: {
        contentRenderers: [
          {
            id: "drawio",
            languages: ["drawio"],
            fileExtensions: ["drawio"],
            renderMode: "automatic",
            render: (input) => html`<pi-web-drawio-preview .input=${input} .rendererUrl=${RENDERER_URL}></pi-web-drawio-preview>`,
          },
        ],
        workspacePanels: [
          {
            id: "workspace.diagrams",
            title: "Diagrams",
            icon: svg`
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"></rect>
              <rect x="14" y="14" width="7" height="7" rx="1"></rect>
              <path d="M10 6.5h7.5V14"></path>
              <path d="M6.5 10v7.5H14"></path>
            </svg>
          `,
            order: 650,
            render: (context) => html`<diagrams-viewer .ctx=${context}></diagrams-viewer>`,
          },
        ],
      },
    };
  },
};

export default plugin;

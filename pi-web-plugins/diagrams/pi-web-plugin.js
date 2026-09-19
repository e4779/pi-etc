// pi-web-plugin.js — Diagrams workspace panel for PI WEB.
// Renders diagrams/*.mmd (mermaid) and diagrams/*.drawio (draw.io viewer)
// from the current workspace. Browser-only plugin (apiVersion 2).

const MERMAID_URL = new URL("./vendor/mermaid.min.js", import.meta.url).href;
const VIEWER_URL = new URL("./vendor/viewer-static.min.js", import.meta.url).href;
const POLL_MS = 4000;
const DIAGRAM_EXT = /\.(mmd|drawio)$/i;

// ---------- vendor loaders ----------

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

// ---------- workspace scanning ----------

async function listDiagrams(files) {
  const out = new Map(); // path -> entry
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

// ---------- custom element ----------

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
    this._selectionMemo = new Map(); // workspace key -> path
    this._holder = null;
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
    this._teardownViewer();
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
      '  <button type="button" title="Refresh">↻</button>',
      '</section>',
      '<section class="viewer" style="margin-top:8px">',
      '  <p class="muted hint">loading…</p>',
      '  <div class="stage"></div>',
      '</section>',
    ].join("\n");
    this._select = this.querySelector("select");
    this._hint = this.querySelector(".hint");
    this._stage = this.querySelector(".stage");
    this._stage.style.cssText = "width:100%;max-height:72vh;min-height:120px;overflow:auto;background:#ffffff;border-radius:6px";
    this._select.addEventListener("change", () => {
      this._selected = this._select.value || null;
      this._selectionMemo.set(this._wsKey(), this._selected);
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
      if (!this._selected) {
        const memo = this._selectionMemo.get(this._wsKey());
        this._selected =
          memo && files.some((f) => f.path === memo)
            ? memo
            : (files[0] ? files[0].path : null);
      }
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
        "Нет диаграмм в workspace. Попросите агента создать diagrams/example.mmd (mermaid) или diagrams/example.drawio.";
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
    this._hint.textContent = "rendering " + this._selected + "…";
    try {
      const file = await ctx.files.readFile(this._selected);
      if (seq !== this._renderSeq) return; // superseded by a newer request
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
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    if (!doc.documentElement || doc.documentElement.nodeName === "parsererror" || doc.querySelector("parsererror")) {
      throw new Error("invalid drawio XML");
    }
    const root = doc.documentElement;

    // Same file -> swap the model in place. No teardown, no flicker and no
    // stale mxGraph instances (GraphViewer itself has no destroy()).
    if (this._viewer && this._holder && this._holder.isConnected) {
      try {
        this._viewer.setXmlNode(root);
        return;
      } catch { /* fall through to a clean rebuild */ }
    }
    this._teardownViewer();
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
    this._holder = holder;
    this._viewer = GraphViewer.createViewerForElement(holder);
  }

  _teardownViewer() {
    if (this._viewer) {
      try {
        const g = this._viewer.graph;
        if (g && typeof g.destroy === "function") g.destroy();
      } catch { /* best effort */ }
      try {
        if (typeof this._viewer.destroy === "function") this._viewer.destroy();
      } catch { /* best effort */ }
    }
    try {
      if (this._holder && window.mxEvent && typeof window.mxEvent.release === "function") {
        window.mxEvent.release(this._holder);
      }
    } catch { /* best effort */ }
    this._viewer = null;
    this._holder = null;
  }

  _clearStage() {
    this._stage.textContent = "";
  }
}

if (typeof window !== "undefined" && window.customElements && !window.customElements.get("diagrams-viewer")) {
  window.customElements.define("diagrams-viewer", DiagramsViewer);
}

// ---------- plugin definition ----------

const plugin = {
  apiVersion: 2,
  name: "Diagrams Plugin",
  activate: ({ html, svg }) => ({
    contributions: {
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
          visible: ({ workspace }) => workspace.isMain !== false,
          render: (context) => html`<diagrams-viewer .ctx=${context}></diagrams-viewer>`,
        },
      ],
    },
  }),
};

export default plugin;

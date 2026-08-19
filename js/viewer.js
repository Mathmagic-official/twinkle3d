import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

/** Models are normalized to a 0.5 bounding-sphere radius, so this always frames them. */
const FRONT = { theta: 0, phi: Math.PI / 2, radius: 2.1 };

function makeLoader() {
  const draco = new DRACOLoader();
  draco.setDecoderPath("assets/draco/");
  draco.setDecoderConfig({ type: "wasm" });
  draco.setWorkerLimit(4);
  draco.preload();
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  return loader;
}

const loader = makeLoader();

/** View-space shading reads geometry far better than a flat white lambert. */
function makeMatcap() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0d0c0b";
  ctx.fillRect(0, 0, size, size);

  const body = ctx.createRadialGradient(
    size * 0.36, size * 0.3, size * 0.04,
    size * 0.5, size * 0.5, size * 0.66,
  );
  body.addColorStop(0.0, "#fffaf0");
  body.addColorStop(0.28, "#d9d2c4");
  body.addColorStop(0.62, "#8d8578");
  body.addColorStop(0.88, "#413c34");
  body.addColorStop(1.0, "#1c1a16");
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();

  ctx.globalCompositeOperation = "lighter";
  const rim = ctx.createRadialGradient(
    size * 0.76, size * 0.8, size * 0.01,
    size * 0.66, size * 0.7, size * 0.46,
  );
  rim.addColorStop(0, "rgba(126,164,214,0.55)");
  rim.addColorStop(1, "rgba(126,164,214,0)");
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = rim;
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function disposeObject(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    const mats = obj.material;
    if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) m.dispose();
  });
}

/**
 * Normalize to a fixed bounding-sphere radius at the origin. Every pane then shares
 * one camera and stays framed at any orbit angle, whatever scale the source mesh used.
 */
function normalize(root) {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  if (!(sphere.radius > 0)) return;
  const scale = 0.5 / sphere.radius;
  root.position.sub(sphere.center);
  root.position.multiplyScalar(scale);
  root.scale.multiplyScalar(scale);
}

class View {
  constructor(host, matcap) {
    this.host = host;
    this.stage = host.querySelector(".pane-stage");
    this.poster = host.querySelector(".pane-poster");
    this.loadEl = host.querySelector(".pane-load");
    this.matcap = matcap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.02, 60);
    this.root = null;
    this.state = { ...FRONT };
    this.token = 0;
  }

  orbit(dx, dy) {
    this.state.theta -= dx * 0.008;
    this.state.phi = Math.min(
      Math.PI - 0.12,
      Math.max(0.12, this.state.phi - dy * 0.008),
    );
  }

  zoom(direction) {
    this.state.radius = Math.min(
      5,
      Math.max(0.85, this.state.radius * (1 + direction * 0.08)),
    );
  }

  applyCamera() {
    const { theta, phi, radius } = this.state;
    this.camera.position.set(
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.cos(theta),
    );
    this.camera.lookAt(0, 0, 0);
  }

  setPoster(src) {
    if (src) {
      this.poster.src = src;
      this.poster.classList.add("on");
    } else {
      this.poster.classList.remove("on");
    }
  }

  setLoading(on) {
    this.loadEl.classList.toggle("on", on);
  }

  setLabel(text) {
    this.host.querySelector(".pane-tag").textContent = text;
  }

  clear() {
    if (!this.root) return;
    this.scene.remove(this.root);
    disposeObject(this.root);
    this.root = null;
  }

  adopt(gltfScene) {
    this.clear();
    gltfScene.traverse((obj) => {
      if (!obj.isMesh) return;
      // Several exports ship no NORMAL attribute; matcap shading would sample NaN and go black.
      if (!obj.geometry.attributes.normal) obj.geometry.computeVertexNormals();
      obj.material = new THREE.MeshMatcapMaterial({
        matcap: this.matcap,
        color: 0xffffff,
        flatShading: false,
      });
      obj.frustumCulled = true;
    });
    normalize(gltfScene);
    this.root = gltfScene;
    this.scene.add(gltfScene);
    this.setPoster(null);
  }
}

export class CompareView {
  constructor({ methods, ours = "hi3d30" }) {
    this.ours = methods.find((m) => m.id === ours);
    this.rivals = methods.filter((m) => m.id !== ours);
    this.rival = this.rivals[0];
    this.views = new Map();
    this.sync = false;
    this.autoRotate = true;
    this.dirty = true;
    this.matcap = makeMatcap();
  }

  makePane(slot, method, featured) {
    const el = document.createElement("div");
    el.className = `cmp-pane${featured ? " is-ours" : ""}`;
    el.dataset.slot = slot;
    el.innerHTML = `
      <div class="pane-head">
        <span class="pane-tag${featured ? " featured" : ""}">${method.label}</span>
      </div>
      <div class="pane-stage">
        <img class="pane-poster" alt="" draggable="false" />
        <div class="pane-load"><span class="spin"></span>Loading</div>
      </div>
    `;
    this.row.appendChild(el);
    const view = new View(el, this.matcap);
    this.views.set(slot, view);
    return view;
  }

  /** Tabs live in the rival pane header so the choice sits next to what it controls. */
  addRivalTabs(pane) {
    const bar = document.createElement("div");
    bar.className = "rival-tabs";
    bar.innerHTML = this.rivals
      .map(
        (m) =>
          `<button class="rival-tab${m.id === this.rival.id ? " active" : ""}" data-id="${m.id}">${m.label}</button>`,
      )
      .join("");
    bar.addEventListener("click", (e) => {
      const btn = e.target.closest(".rival-tab");
      if (!btn) return;
      for (const el of bar.children) el.classList.toggle("active", el === btn);
      this.setRival(btn.dataset.id);
    });
    pane.host.querySelector(".pane-head").appendChild(bar);
  }

  mount(row) {
    this.row = row;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "compare-canvas";
    row.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x11100e, 1);
    this.renderer.autoClear = false;

    this.makePane("ours", this.ours, true);
    this.addRivalTabs(this.makePane("rival", this.rival, false));

    this.bindPointer();
    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.loop();
  }

  /** Only the stage drags; the header holds clickable tabs. */
  viewAt(target) {
    const pane = target?.closest?.(".pane-stage")?.closest(".cmp-pane");
    return pane ? this.views.get(pane.dataset.slot) : null;
  }

  /** Each mesh orbits on its own unless the viewer opts into locked cameras. */
  targets(view) {
    if (this.sync || !view) return [...this.views.values()];
    return [view];
  }

  /** Locking keeps each pane where it sits and applies later drags to both. */
  setSync(on) {
    this.sync = on;
    this.dirty = true;
  }

  bindPointer() {
    let dragged = null;
    let lastX = 0;
    let lastY = 0;

    this.row.addEventListener("pointerdown", (e) => {
      dragged = this.viewAt(e.target);
      if (!dragged) return;
      e.preventDefault();
      lastX = e.clientX;
      lastY = e.clientY;
      this.autoRotate = false;
      document.dispatchEvent(new CustomEvent("compare:interact"));
    });

    window.addEventListener("pointermove", (e) => {
      if (!dragged) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      for (const view of this.targets(dragged)) view.orbit(dx, dy);
      this.dirty = true;
    });

    const stop = () => {
      dragged = null;
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);

    this.row.addEventListener(
      "wheel",
      (e) => {
        const view = this.viewAt(e.target);
        if (!view) return;
        e.preventDefault();
        for (const target of this.targets(view)) target.zoom(Math.sign(e.deltaY));
        this.dirty = true;
      },
      { passive: false },
    );

    this.row.addEventListener("dragstart", (e) => e.preventDefault());
  }

  resetView() {
    for (const view of this.views.values()) view.state = { ...FRONT };
    this.dirty = true;
  }

  resize() {
    const rect = this.row.getBoundingClientRect();
    this.renderer.setSize(rect.width, rect.height, false);
    this.dirty = true;
  }

  applyCamera() {
    for (const view of this.views.values()) view.applyCamera();
  }

  /** Per-view tokens: swapping the rival must not cancel a load still running on the left. */
  async load(view, entry, methodId) {
    const token = ++view.token;
    view.clear();
    view.setPoster(entry.previews[methodId] || null);
    const url = entry.models[methodId];
    view.setLoading(Boolean(url));
    this.dirty = true;
    if (!url) return;

    try {
      const gltf = await loader.loadAsync(url);
      if (token !== view.token) {
        disposeObject(gltf.scene);
        return;
      }
      view.adopt(gltf.scene);
    } catch (err) {
      console.warn("load failed", url, err);
    } finally {
      if (token === view.token) view.setLoading(false);
      this.dirty = true;
    }
  }

  async show(entry) {
    this.entry = entry;
    await Promise.all([
      this.load(this.views.get("ours"), entry, this.ours.id),
      this.load(this.views.get("rival"), entry, this.rival.id),
    ]);
  }

  setRival(id) {
    const method = this.rivals.find((m) => m.id === id);
    if (!method || method.id === this.rival.id) return;
    this.rival = method;
    const view = this.views.get("rival");
    view.setLabel(method.label);
    if (this.entry) this.load(view, this.entry, method.id);
  }

  /** Warm the browser cache so stepping to the next case feels instant. */
  prefetch(entry) {
    if (!entry) return;
    for (const id of [this.ours.id, this.rival.id]) {
      const url = entry.models[id];
      if (url) fetch(url, { priority: "low", cache: "force-cache" }).catch(() => {});
    }
  }

  renderViews() {
    this.renderer.setScissorTest(false);
    this.renderer.clear();
    this.renderer.setScissorTest(true);

    const canvasRect = this.canvas.getBoundingClientRect();
    for (const view of this.views.values()) {
      if (!view.root) continue;
      const r = view.stage.getBoundingClientRect();
      const w = r.width;
      const h = r.height;
      if (w <= 0 || h <= 0) continue;
      const left = r.left - canvasRect.left;
      const bottom = canvasRect.bottom - r.bottom;
      this.renderer.setViewport(left, bottom, w, h);
      this.renderer.setScissor(left, bottom, w, h);
      view.camera.aspect = w / h;
      view.camera.updateProjectionMatrix();
      this.renderer.render(view.scene, view.camera);
    }
  }

  loop() {
    const tick = () => {
      if (this.autoRotate) {
        for (const view of this.views.values()) view.state.theta += 0.0035;
        this.dirty = true;
      }
      if (this.dirty) {
        this.applyCamera();
        this.renderViews();
        this.dirty = false;
      }
      requestAnimationFrame(tick);
    };
    tick();
  }
}

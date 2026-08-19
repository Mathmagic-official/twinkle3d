import { CompareView } from "./viewer.js";

// GitHub Pages serves this with max-age=600; revalidate so case edits show up at once.
const data = await fetch("data/cases.json", { cache: "no-cache" }).then((r) => r.json());
const cases = data.cases;
const methods = data.methods;

let index = 0;

const inputImage = document.querySelector("#input-image");
const caseMeta = document.querySelector("#case-meta");
const strip = document.querySelector("#case-strip");
const gallery = document.querySelector("#gallery");
const rotateBtn = document.querySelector("#rotate-toggle");

const view = new CompareView({ methods });
view.mount(document.querySelector("#compare-row"));

function renderStrip() {
  strip.innerHTML = "";
  cases.forEach((entry, i) => {
    const btn = document.createElement("button");
    btn.className = `case-thumb${i === index ? " active" : ""}`;
    btn.title = entry.id;
    btn.innerHTML = `<img src="${entry.thumb}" alt="" loading="lazy" />`;
    btn.addEventListener("click", () => select(i));
    strip.appendChild(btn);
  });
}

function renderGallery() {
  gallery.innerHTML = "";
  cases.forEach((entry, i) => {
    const row = document.createElement("button");
    row.className = "scan-row";
    row.innerHTML = [
      `<figure><img src="${entry.thumb}" alt="" loading="lazy" /><figcaption>Input</figcaption></figure>`,
      ...methods.map((m) => {
        const src = entry.previews[m.id];
        if (!src) return "";
        return `<figure class="${m.id === "hi3d30" ? "ours" : ""}">
          <img src="${src}" alt="" loading="lazy" />
          <figcaption>${m.label}</figcaption>
        </figure>`;
      }),
    ].join("");
    row.addEventListener("click", () => {
      select(i);
      document.querySelector("#demo").scrollIntoView({ behavior: "smooth" });
    });
    gallery.appendChild(row);
  });
}

async function select(i) {
  index = (i + cases.length) % cases.length;
  const entry = cases[index];
  inputImage.src = entry.input;
  caseMeta.textContent = `${String(index + 1).padStart(2, "0")} / ${cases.length}`;
  renderStrip();
  await view.show(entry);
  view.prefetch(cases[(index + 1) % cases.length]);
}

document.querySelector("#prev-case").addEventListener("click", () => select(index - 1));
document.querySelector("#next-case").addEventListener("click", () => select(index + 1));

document.querySelector("#front-view").addEventListener("click", () => view.resetView());

const syncBtn = document.querySelector("#sync-toggle");
syncBtn.addEventListener("click", () => {
  view.setSync(!view.sync);
  syncBtn.classList.toggle("active", view.sync);
  syncBtn.setAttribute("aria-pressed", String(view.sync));
  syncBtn.querySelector("span").textContent = view.sync
    ? "Rotation synced"
    : "Sync rotation";
});

rotateBtn.addEventListener("click", () => {
  view.autoRotate = !view.autoRotate;
  rotateBtn.classList.toggle("active", view.autoRotate);
});

document.addEventListener("compare:interact", () => {
  rotateBtn.classList.remove("active");
});

window.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea")) return;
  if (e.key === "ArrowRight") select(index + 1);
  if (e.key === "ArrowLeft") select(index - 1);
});

renderGallery();
select(0);

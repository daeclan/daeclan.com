/* Utility: current year */
document.getElementById("year").textContent = new Date().getFullYear();

/* Mobile menu */
const menuBtn = document.getElementById("menuBtn");
const mobileMenu = document.getElementById("mobileMenu");
if (menuBtn && mobileMenu) {
  menuBtn.addEventListener("click", () => {
    mobileMenu.classList.toggle("hidden");
  });
}

/* Intersection reveal */
const revealEls = document.querySelectorAll(".reveal");
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) if (e.isIntersecting) e.target.classList.add("reveal-in");
  },
  { rootMargin: "0px 0px -10% 0px", threshold: 0.1 }
);
revealEls.forEach((el) => io.observe(el));

/* Perf toggle (basic FPS meter if rAF is available) */
let perfOn = false;
let rafId = null;
const togglePerfBtn = document.getElementById("togglePerf");
togglePerfBtn?.addEventListener("click", () => {
  perfOn = !perfOn;
  togglePerfBtn.textContent = perfOn ? "Perf Stats (on)" : "Perf Stats";
  if (perfOn) startFPS(); else stopFPS();
});

let last = performance.now(), frames = 0;
const fpsBadge = document.createElement("div");
fpsBadge.style.cssText = "position:fixed;bottom:12px;right:12px;padding:6px 10px;background:#0008;color:#fff;border:1px solid #ffffff22;border-radius:10px;font:12px/1.2 ui-monospace,monospace;z-index:9999;backdrop-filter:blur(6px)";
function startFPS() {
  document.body.appendChild(fpsBadge);
  function loop(now) {
    frames++;
    if (now - last >= 1000) {
      fpsBadge.textContent = `FPS: ${frames}`;
      frames = 0;
      last = now;
    }
    rafId = requestAnimationFrame(loop);
  }
  rafId = requestAnimationFrame(loop);
}
function stopFPS() { cancelAnimationFrame(rafId); fpsBadge.remove(); }

/* Idea randomizer (stub data; swap with your notes later) */
const ideas = [
  "Minimal three.js orb with audio-reactive pulse.",
  "Scroll-linked typography morph (variable fonts).",
  "AI prompt → color system generator for projects.",
  "“2026 Compass” page that turns notes into milestones.",
  "Parametric grid that rearranges based on your mood tag."
];
const ideaBtn = document.getElementById("randomIdea");
const ideaOut = document.getElementById("ideaOut");
ideaBtn?.addEventListener("click", () => {
  const pick = ideas[Math.floor(Math.random() * ideas.length)];
  ideaOut.textContent = pick;
});

/* Lazy-load three.js scene when the mount enters view */
const orbMount = document.getElementById("orbMount");
let orbLoaded = false;
async function loadOrb() {
  if (orbLoaded) return;
  orbLoaded = true;
  // Dynamically import three from a CDN to keep initial bundle tiny
  const THREE = await import("https://cdn.skypack.dev/three@0.161.0");
  const { Scene, PerspectiveCamera, WebGLRenderer, Mesh, SphereGeometry, MeshStandardMaterial, AmbientLight, PointLight, Clock, Color } = THREE;

  const width = orbMount.clientWidth;
  const height = orbMount.clientHeight;

  const scene = new Scene();
  scene.background = new Color(0x050508);

  const camera = new PerspectiveCamera(50, width / height, 0.1, 100);
  camera.position.z = 3;

  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "low-power", alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  orbMount.innerHTML = "";
  orbMount.appendChild(renderer.domElement);

  const geo = new SphereGeometry(0.9, 32, 32);
  const mat = new MeshStandardMaterial({ color: 0x66ddff, emissive: 0x0b2233, roughness: 0.35, metalness: 0.2 });
  const orb = new Mesh(geo, mat);
  scene.add(orb);

  const amb = new AmbientLight(0x88ccff, 0.35);
  const light = new PointLight(0x88ddff, 1.4, 8);
  light.position.set(1.5, 1.2, 2.5);
  scene.add(amb, light);

  const clock = new Clock();
  function tick() {
    const t = clock.getElapsedTime();
    orb.rotation.y = t * 0.3;
    orb.position.y = Math.sin(t * 0.9) * 0.06;
    light.intensity = 1.2 + Math.sin(t * 1.7) * 0.2;
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();

  // Resize handling
  const ro = new ResizeObserver(() => {
    const w = orbMount.clientWidth, h = orbMount.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  ro.observe(orbMount);
}

if (orbMount) {
  const inView = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) loadOrb(); });
  }, { threshold: 0.2 });
  inView.observe(orbMount);

  // Manual reload button
  document.getElementById("reloadOrb")?.addEventListener("click", () => {
    orbLoaded = false;
    loadOrb();
  });
}

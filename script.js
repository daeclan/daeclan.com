/* Utility: current year */
document.getElementById("year").textContent = new Date().getFullYear();

/* Hero parallax glow: reacts to scroll and mouse (lightweight) */
const hero = document.getElementById("hero");
const glow = hero?.querySelector(".glow");
if (hero && glow) {
  const onScroll = () => {
    const rect = hero.getBoundingClientRect();
    const vis = Math.max(0, Math.min(1, 1 - rect.top / (window.innerHeight * 0.9)));
    glow.style.opacity = String(0.6 * vis + 0.15);
    glow.style.setProperty("--hy", `${10 + vis * 15}%`);
  };
  const onMove = (e) => {
    const x = (e.clientX / window.innerWidth) * 100;
    glow.style.setProperty("--hx", `${x}%`);
  };
  onScroll();
  document.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("mousemove", onMove, { passive: true });
}

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
  async function loadOrb() {
    if (orbLoaded) return;
    orbLoaded = true;
    const THREE = await import("https://cdn.skypack.dev/three@0.161.0");
    const { Scene, PerspectiveCamera, WebGLRenderer, Mesh, SphereGeometry, MeshStandardMaterial, AmbientLight, PointLight, Clock, Color, Vector2 } = THREE;

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

    // Time-of-day hue shift (morning=warm, night=cool)
    const hrs = new Date().getHours();
    const dayFactor = Math.cos(((hrs - 12) / 12) * Math.PI); // -1..1
    const baseColor = new Color().setHSL(0.56 - 0.06 * dayFactor, 0.9, 0.6); // ~blue→teal drift

    const geo = new SphereGeometry(0.9, 48, 48);
    const mat = new MeshStandardMaterial({ color: baseColor, emissive: baseColor.clone().multiplyScalar(0.15), roughness: 0.35, metalness: 0.2 });
    const orb = new Mesh(geo, mat);
    scene.add(orb);

    const amb = new AmbientLight(0xffffff, 0.28);
    const light = new PointLight(0x88ddff, 1.3, 8);
    light.position.set(1.5, 1.2, 2.5);
    scene.add(amb, light);

    const mouse = new Vector2(0, 0);
    const onPointer = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    renderer.domElement.addEventListener("pointermove", onPointer, { passive: true });

    const clock = new Clock();
    function tick() {
      const t = clock.getElapsedTime();
      // Gentle idle motion
      orb.rotation.y = t * 0.3;
      orb.position.y = Math.sin(t * 0.9) * 0.06;

      // Light follows cursor smoothly
      light.position.x += ((mouse.x * 1.6) - light.position.x) * 0.08;
      light.position.y += ((mouse.y * 1.0) - light.position.y) * 0.08;

      // Soft pulsing intensity
      light.intensity = 1.15 + Math.sin(t * 1.7) * 0.18;

      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    }
    tick();

    const ro = new ResizeObserver(() => {
      const w = orbMount.clientWidth, h = orbMount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(orbMount);
  }
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

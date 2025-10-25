/*
 * Next‑gen Three.js/WebGPU scene combining procedural geometry mutation,
 * real‑time path tracing and scroll‑reactive camera motion.  
 *
 * This script uses the WebGPU renderer introduced in Three.js r150+ along with
 * the new node‑based material system (TSL).  Geometry deformation runs on
 * the GPU via compute shaders, and a custom fragment shader implements a
 * simplified path tracer.  Scrolling the page dollys the camera along the
 * z‑axis for an interactive parallax effect.  To integrate this into an
 * existing site, wrap the code in a self‑executing function and attach it
 * to a DOM element with the id `heroScene`, similar to the example provided.
 */

// Immediately‑invoked function expression to avoid polluting the global scope.
(function() {
  const mount = document.getElementById('heroScene');
  let mounted = false;

  async function loadScene() {
    if (mounted || !mount) return;
    mounted = true;
    // Clear any fallback text/content
    mount.textContent = '';

    // Dynamically import Three.js.  Fall back to the unpkg CDN if Skypack fails.
    let THREE;
    try {
      THREE = await import('https://cdn.skypack.dev/three@0.161.0');
    } catch (err) {
      THREE = await import('https://unpkg.com/three@0.161.0/build/three.module.js');
    }

    /*
     * Import the node utilities needed for GPU compute and material definition.
     * These helpers come from the `three/nodes` module introduced in Three.js
     * r150+.  They allow us to declare storage buffers, uniforms and compute
     * functions directly in JavaScript.  See the interactive text destruction
     * tutorial for a more in‑depth discussion【283365056804811†L160-L181】.
     */
    const {
      storage,
      uniform,
      Fn,
      vec3,
      mx_noise_vec3,
      MeshPhysicalNodeMaterial
    } = await import('https://cdn.skypack.dev/three@0.161.0/nodes');

    // Determine the canvas size.  Maintain a 16:9 aspect ratio if no height is set.
    const w = mount.clientWidth;
    const h = mount.clientHeight || Math.round(w / (16 / 9));

    // Use the WebGPU renderer.  WebGPU exposes compute shaders and delivers
    // significantly better performance for heavy techniques like path tracing【296856254362920†L19-L41】.
    const renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    // Cap device pixel ratio to avoid excessive GPU workload on high‑DPI screens.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // Basic scene and camera setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);
    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
    // Position the camera so the path traced floor and deforming geometry are visible.
    camera.position.set(0, 1.5, 5);
    scene.add(camera);

    /*
     * -------------------------------------------------------------------
     * Path‑tracing setup
     *
     * The fragment shader below implements a minimal path tracer that
     * supports a single reflective sphere and a ground plane.  For each
     * pixel, it casts a ray from the camera into the scene, performs a
     * maximum of two bounces and accumulates simple Lambertian shading.  The
     * shader runs under WebGPU via THREE.ShaderMaterial; note that WGSL
     * shaders are still evolving, so this example uses GLSL‑style syntax
     * similar to the conceptual example shown in the WebGPU path tracing
     * article【296856254362920†L61-L110】.
     */
    const pathUniforms = {
      resolution: { value: new THREE.Vector2(w, h) },
      time: { value: 0 }
    };
    const pathMaterial = new THREE.ShaderMaterial({
      uniforms: pathUniforms,
      vertexShader: `
        precision highp float;
        varying vec3 vPosition;
        void main() {
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vPosition;
        uniform vec2 resolution;
        uniform float time;

        // Intersection with a sphere at the origin of radius r.  Returns the
        // distance along the ray or -1.0 if there is no hit.
        float sphereIntersect(vec3 ro, vec3 rd, vec3 c, float r) {
          vec3 oc = ro - c;
          float b = dot(oc, rd);
          float c2 = dot(oc, oc) - r * r;
          float h = b * b - c2;
          if (h < 0.0) return -1.0;
          return -b - sqrt(h);
        }

        // Intersection with a plane defined by normal n and offset d (plane
        // equation: dot(n, p) + d = 0).  Returns distance along the ray or
        // -1.0 if parallel or behind.
        float planeIntersect(vec3 ro, vec3 rd, vec3 n, float d) {
          float denom = dot(n, rd);
          if (abs(denom) < 1e-4) return -1.0;
          float t = -(dot(n, ro) + d) / denom;
          return t;
        }

        // Reflect an incident vector I about a surface normal N.
        vec3 reflectVec(vec3 I, vec3 N) {
          return I - 2.0 * dot(N, I) * N;
        }

        // Trace a ray and accumulate simple shading.  The algorithm supports
        // two bounces: reflective sphere and diffuse ground plane.  Throughput
        // attenuates with each bounce.
        vec3 shadeRay(vec3 ro, vec3 rd) {
          vec3 col = vec3(0.0);
          vec3 throughput = vec3(1.0);
          for (int bounce = 0; bounce < 2; bounce++) {
            // Check intersections with sphere and plane
            float tSphere = sphereIntersect(ro, rd, vec3(0.0, 0.0, 0.0), 1.0);
            float tPlane = planeIntersect(ro, rd, vec3(0.0, 1.0, 0.0), 1.0);
            bool hitPlane = false;
            float t = -1.0;
            if (tPlane > 0.0) {
              t = tPlane;
              hitPlane = true;
            }
            if (tSphere > 0.0 && (t < 0.0 || tSphere < t)) {
              t = tSphere;
              hitPlane = false;
            }
            // No hit: sample sky color and terminate
            if (t < 0.0) {
              col += throughput * vec3(0.1, 0.1, 0.3);
              break;
            }
            vec3 hitPos = ro + rd * t;
            if (hitPlane) {
              // Ground plane: bluish Lambertian surface
              vec3 normal = vec3(0.0, 1.0, 0.0);
              vec3 lightDir = normalize(vec3(1.0, 2.0, 1.0));
              float diff = max(dot(normal, lightDir), 0.0);
              col += throughput * vec3(0.15, 0.2, 0.3) * diff;
              // Reflect the ray and attenuate
              rd = reflectVec(rd, normal);
              ro = hitPos + normal * 0.01;
              throughput *= 0.6;
            } else {
              // Sphere: reddish glossy surface
              vec3 normal = normalize(hitPos - vec3(0.0, 0.0, 0.0));
              vec3 lightDir = normalize(vec3(-1.0, 2.0, 1.0));
              float diff = max(dot(normal, lightDir), 0.0);
              col += throughput * vec3(0.8, 0.4, 0.4) * diff;
              rd = reflectVec(rd, normal);
              ro = hitPos + normal * 0.01;
              throughput *= 0.5;
            }
          }
          return col;
        }

        void main() {
          // Normalized device coordinates
          vec2 uv = (gl_FragCoord.xy / resolution.xy) * 2.0 - 1.0;
          float aspect = resolution.x / resolution.y;
          // Initial ray from a fixed camera.  For better variety, rotate the
          // view slowly over time.
          vec3 ro = vec3(0.0, 0.0, 5.0);
          vec3 rd = normalize(vec3(uv.x * aspect, uv.y, -1.5));
          float angle = time * 0.2;
          mat3 rotY = mat3(
            cos(angle), 0.0, sin(angle),
            0.0, 1.0, 0.0,
            -sin(angle), 0.0, cos(angle)
          );
          rd = rotY * rd;
          vec3 color = shadeRay(ro, rd);
          gl_FragColor = vec4(color, 1.0);
        }
      `
    });
    // Large quad to display the path traced scene.  A plane is sufficient
    // because the shader computes all geometry in the fragment stage.
    const pathGeometry = new THREE.PlaneGeometry(10, 10, 1, 1);
    const pathMesh = new THREE.Mesh(pathGeometry, pathMaterial);
    pathMesh.rotation.x = -Math.PI / 2; // orient horizontally
    pathMesh.position.y = 0.0;
    scene.add(pathMesh);

    /*
     * -------------------------------------------------------------------
     * Procedural geometry with GPU compute
     *
     * We create a dense plane mesh and use TSL’s compute functions to
     * dynamically update its vertices on the GPU.  The update uses noise
     * (`mx_noise_vec3`) and a spring/friction model, similar to the text
     * destruction example【283365056804811†L336-L377】.  Each frame we call
     * `renderer.computeAsync()` to execute the compute shader and then map
     * the storage buffer back to the mesh via the material’s `positionNode`.
     */
    const planeGeometry = new THREE.PlaneGeometry(2.5, 2.5, 100, 100);
    const count = planeGeometry.attributes.position.count;
    // Original positions and normals
    const initial_pos = storage(planeGeometry.attributes.position, 'vec3', count);
    const normal_attr = storage(planeGeometry.attributes.normal, 'vec3', count);
    // Storage buffers for current positions and velocities
    const pos_storage = storage(new THREE.StorageBufferAttribute(count, 3), 'vec3', count);
    const vel_storage = storage(new THREE.StorageBufferAttribute(count, 3), 'vec3', count);
    // Uniform nodes
    const u_timeNode = uniform(0);
    const u_noise_amp = uniform(0.4);
    const u_spring = uniform(0.02);
    const u_friction = uniform(0.92);
    // Compute function to initialise positions and velocities
    const computeInit = Fn(() => {
      pos_storage.element(instanceIndex).assign(initial_pos.element(instanceIndex));
      vel_storage.element(instanceIndex).assign(vec3(0.0, 0.0, 0.0));
    })().compute(count);
    // Run the initial compute pass once before animation starts
    await renderer.computeAsync(computeInit);
    // Compute function executed each frame.  It displaces vertices along
    // their normals by a noise field and integrates velocity with spring
    // dynamics【283365056804811†L336-L377】.
    const computeUpdate = Fn(() => {
      const base = initial_pos.element(instanceIndex);
      const current = pos_storage.element(instanceIndex);
      const vel = vel_storage.element(instanceIndex);
      const normal = normal_attr.element(instanceIndex);
      // Generate animated noise; displace along the normal.
      const noise = mx_noise_vec3(current.mul(0.5).add(vec3(0.0, u_timeNode, 0.0)), 1.0).mul(u_noise_amp);
      const displaced = base.add(noise.mul(normal));
      // Spring integration: velocity += (target - current) * spring
      vel.addAssign(displaced.sub(current).mul(u_spring));
      // Position integration: current += velocity
      current.addAssign(vel);
      // Damping
      vel.assign(vel.mul(u_friction));
    })().compute(count);
    // Define a node‑based material for the deforming plane.  The physical
    // material responds to lights and uses the compute buffer for its vertex
    // positions.  We could add color variations here by sampling the noise
    // buffer or normals, but keeping it simple improves readability.
    const planeMaterial = new MeshPhysicalNodeMaterial({
      roughness: 0.5,
      metalness: 0.0,
      clearcoat: 0.0
    });
    // Assign computed positions to the material
    planeMaterial.positionNode = pos_storage.toAttribute();
    const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
    planeMesh.rotation.x = -Math.PI / 2;
    planeMesh.position.y = 0.5;
    scene.add(planeMesh);

    /*
     * -------------------------------------------------------------------
     * Scroll‑reactive camera motion
     *
     * Users on the three.js forum suggested updating the camera’s z‑position in
     * response to the mouse wheel to achieve a dolly effect【638515394445934†L44-L60】.  Here we
     * accumulate the scroll offset into `scrollTarget` and smoothly lerp the
     * camera towards it each frame.  The `passive:true` option prevents
     * interfering with default scrolling behaviour.
     */
    let scrollTarget = camera.position.z;
    function onWheel(event) {
      scrollTarget += event.deltaY * 0.003;
    }
    mount.addEventListener('wheel', onWheel, { passive: true });
    function updateCamera() {
      camera.position.z += (scrollTarget - camera.position.z) * 0.1;
    }

    // Handle resizing – update camera aspect, renderer size and path tracer
    // resolution uniform when the container changes size.
    const ro = new ResizeObserver(() => {
      const W = mount.clientWidth;
      const H = mount.clientHeight || Math.round(W / (16 / 9));
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      renderer.setSize(W, H);
      pathUniforms.resolution.value.set(W, H);
    });
    ro.observe(mount);

    const clock = new THREE.Clock();

    async function tick() {
      const t = clock.getElapsedTime();
      u_timeNode.value = t;
      pathUniforms.time.value = t;
      // Update deforming geometry on the GPU
      await renderer.computeAsync(computeUpdate);
      // Smoothly move camera towards the scroll target
      updateCamera();
      // Render the scene
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    }
    tick();
  }

  // Trigger scene loading when the page is ready or when the user interacts.
  document.addEventListener('DOMContentLoaded', loadScene);
  mount?.addEventListener('pointerdown', loadScene, { passive: true });
  // Lazy load on scroll if not yet mounted
  window.addEventListener('scroll', () => { if (!mounted) loadScene(); }, { passive: true });
  // If the tab becomes visible again and the scene wasn’t mounted, load it.
  document.addEventListener('visibilitychange', () => {
    if (!mounted && !document.hidden) loadScene();
  });
  // If the document is already ready, trigger load immediately
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(loadScene, 0);
  }
})();
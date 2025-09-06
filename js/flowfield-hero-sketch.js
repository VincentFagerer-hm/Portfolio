// sketch.js — Neo-Brutalist Flowfield mit Fake-/Image-Stickern (p5 Instance Mode)
const sketch = (p) => {
  // ====== CONFIG (deine Werte beibehalten) ======
  const PALETTE       = ['#ffd400', '#ff3d77', '#2dd4bf', '#6366f1'];
  const OUTLINE_PX    = 5;
  const STICKER_SIZE  = 80;

  const PARTICLE_PADDING = 100; // Mindestabstand zwischen Formen (in px)

  const BASE_DENSITY  = 0.00008;
  const NOISE_SCALE   = 0.007; // Erhöht, damit die Richtungen sich schneller ändern
  const NOISE_SPEED   = 0.0025;
  const DRAG          = 0.90;
  const ACCEL         = 0.07;  // Weniger Flow-Einfluss, mehr "freies" Schweben
  const MAX_VEL       = 1.6;
  const TRAIL_ALPHA   = 200;

  // Maus-Interaktion
  const MOUSE_ENABLED = true;
  const MOUSE_RADIUS  = 240;
  const MOUSE_FORCE   = 0.35;
  const MOUSE_EXP     = 1.5;

  // Eigene Bilder
  const USE_STICKER_IMAGES = true;
  const STICKER_URLS = [
    "assets/formen/Union-1.png",
    "assets/formen/Ellipse 6.png",
    "assets/formen/Polygon 2.png",
    "assets/formen/Star 4.png",
    "assets/formen/Star 5.png",
    "assets/formen/Star 6.png",
    "assets/formen/Union-2.png",
    "assets/formen/Union-3.png",
    "assets/formen/Union.png",
    "assets/formen/Vector-1.png",
    "assets/formen/Vector.png",
    "assets/formen/Flower.png",
    "assets/formen/Flower 1.png",
    "assets/formen/Flower 2.png", 
  ];

  const prefersReduced = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  let stickers = [];
  let particles = [];
  let fieldZ = 0;
  let paused = false;

  // Container-Refs
  let parentEl;   // DOM-Element #flowfield
  let heroEl;     // DOM-Element #hero

  // Maus-Cooldown
  let mouseCooldownUntil = 0;

  let isInView = true;   // Sichtbarkeit des Containers

  const FLOW_DIRECTION = 'up'; // Optionen: 'flowfield', 'down', 'up', 'left', 'right'
  const FLOW_ANGLES = {
    flowfield: 0,
    down: Math.PI / 2,
    up: -Math.PI / 2,
    left: Math.PI,
    right: 0
  };

  let manualPaused = false; // nur für den A-Toggle

  // ====== PRELOAD ======
  p.preload = () => {
    if (USE_STICKER_IMAGES && STICKER_URLS.length){
      stickers = STICKER_URLS.map((u) => p.loadImage(u));
    }
  };

  // ====== SETUP (Canvas im Container anlegen) ======
  p.setup = () => {
    parentEl = p.select('#flowfield').elt;
    heroEl   = p.select('#hero').elt;

    const { width, height } = parentEl.getBoundingClientRect();
    p.createCanvas(width, height).parent(parentEl);

    const dpr = Math.min(2, (p.displayDensity ? p.displayDensity() : (window.devicePixelRatio || 1)));
    p.pixelDensity(dpr);

    if (!USE_STICKER_IMAGES || stickers.length === 0) {
      stickers = makeStickers(PALETTE, OUTLINE_PX, STICKER_SIZE);
    }

    initParticles();
    buildResetButton();

    // Canvas soll sich an Eltern-Container anpassen
    new ResizeObserver(resizeToParent).observe(parentEl);

    // Sichtbarkeits-Logik aktivieren:
    setupVisibilityPause();
  };

  function resizeToParent(){
    const { width, height } = parentEl.getBoundingClientRect();
    p.resizeCanvas(width, height, true);
    adjustParticleCount();
  }

  // ====== DRAW ======
  p.draw = () => {
    if (!paused) fieldZ += prefersReduced ? NOISE_SPEED * 0.25 : NOISE_SPEED;
    // BACKGROUND COLOR
    p.background(227, 223, 242, TRAIL_ALPHA);

    if (paused) return;

    p.noStroke();
    p.imageMode(p.CENTER);

    const pointer = getPointer();
    const r2 = MOUSE_RADIUS * MOUSE_RADIUS;
    const R = STICKER_SIZE;

    for (let i = 0; i < particles.length; i++){
      const pt = particles[i];

      // Flowfield Richtung + gewünschte Bewegungsrichtung
      const n = p.noise(pt.x * NOISE_SCALE, pt.y * NOISE_SCALE, fieldZ + i * 100);
      let a = n * p.TAU;

      // Winkel für Richtung addieren
      a += FLOW_ANGLES[FLOW_DIRECTION] || 0;

      const ax = Math.cos(a);
      const ay = Math.sin(a);
      pt.rot = a;

      // Flow-Bewegung + zufällige Drift
      pt.vx = DRAG * pt.vx + ACCEL * ax + p.random(-0.07, 0.07);
      pt.vy = DRAG * pt.vy + ACCEL * ay + p.random(-0.07, 0.07);

      // Maus-Anziehung
      if (MOUSE_ENABLED && pointer.active){
        const dx = pointer.x - pt.x;
        const dy = pointer.y - pt.y;
        const d2 = dx*dx + dy*dy;
        if (d2 < r2 && d2 > 1e-6){
          const d = Math.sqrt(d2);
          const falloff = 1 - Math.pow(d / MOUSE_RADIUS, MOUSE_EXP);
          pt.vx += (dx / d) * MOUSE_FORCE * falloff;
          pt.vy += (dy / d) * MOUSE_FORCE * falloff;
        }
      }

      // --- Padding/Kollisionsabfrage ---
      for (let j = 0; j < particles.length; j++) {
        if (i === j) continue;
        const other = particles[j];
        const dx = pt.x - other.x;
        const dy = pt.y - other.y;
        const dist2 = dx*dx + dy*dy;
        const minDist = PARTICLE_PADDING;
        if (dist2 < minDist * minDist && dist2 > 1e-6) {
          const dist = Math.sqrt(dist2);
          // Abstoßung proportional zum Abstand
          const force = 0.12 * (1 - dist / minDist);
          pt.vx += (dx / dist) * force;
          pt.vy += (dy / dist) * force;
        }
      }

      // Geschwindigkeit begrenzen
      const spd = Math.hypot(pt.vx, pt.vy) || 1e-6;
      const s   = Math.min(spd, MAX_VEL);
      pt.vx = pt.vx / spd * s;
      pt.vy = pt.vy / spd * s;

      // Position
      pt.x += pt.vx;
      pt.y += pt.vy;
      if (FLOW_DIRECTION !== 'flowfield') {
        pt.rot = Math.atan2(ay, ax); // Rotation passend zur Richtung
      }

      // Randverhalten: Wrap-Around
      if (pt.x < -R) pt.x = p.width + R;
      if (pt.x > p.width + R) pt.x = -R;
      if (pt.y < -R) pt.y = p.height + R;
      if (pt.y > p.height + R) pt.y = -R;

      // Zeichnen
      p.push();
      p.translate(pt.x, pt.y);
      p.rotate(pt.rot);

      const { w, h } = fitSize(pt.sprite, STICKER_SIZE);

      // Hauptsprite
      p.noTint();
      p.image(pt.sprite, 0, 0, w, h);

      p.pop();
    }
  };

  // ====== HELPERS ======
  function initParticles(){
    const densityScale = prefersReduced ? 0.6 : 1;
    const targetCount = Math.max(12, Math.round(p.width * p.height * BASE_DENSITY * densityScale));
    particles = new Array(targetCount).fill(0).map(() => makeParticle());
  }

  function makeParticle(){
    return {
      x: p.random(p.width),
      y: p.random(p.height),
      vx: 0,
      vy: 0,
      rot: p.random(p.TAU),
      sprite: p.random(stickers),
    };
  }

  function respawnParticle(pt){
    pt.x = p.random(p.width);
    pt.y = p.random(p.height);
    pt.vx = 0;
    pt.vy = 0;
    pt.rot = p.random(p.TAU);
    pt.sprite = p.random(stickers); // optional neu würfeln
  }

  function adjustParticleCount(){
    const densityScale = prefersReduced ? 0.6 : 1;
    const target = Math.max(12, Math.round(p.width * p.height * BASE_DENSITY * densityScale));
    const diff = target - particles.length;
    if (diff > 0){
      for (let i = 0; i < diff; i++) particles.push(makeParticle());
    } else if (diff < 0){
      particles.splice(target);
    }
  }

  function buildResetButton(){
    // Entferne den Button und füge stattdessen eine Legende ein
    const legend = p.createDiv('<b>Legende:</b> <br> <kbd>A</kbd> = an/aus <br> <kbd>R</kbd> = Reset');
    legend.parent(heroEl);
    legend.style('position','absolute');
    legend.style('top','16px');
    legend.style('right','16px');
    legend.style('background','var(--accent)');
    legend.style('color','var(--ink)');
    legend.style('border','2px solid var(--ink)');
    legend.style('border-radius','var(--radius)');
    legend.style('box-shadow','4px 4px 0 var(--shadow)');
    legend.style('padding','10px 16px');
    legend.style('font-size','1em');
    legend.style('font-weight','600');
    legend.style('z-index','3');
  }

  function setupVisibilityPause(){
    const target = parentEl; // oder heroEl

    // Beobachte, ob der Container im Viewport ist
    const io = new IntersectionObserver((entries) => {
      const e = entries[0];
      isInView = e.isIntersecting && e.intersectionRatio > 0.1;
      const shouldRun = (document.visibilityState === 'visible') && isInView && !manualPaused;

      if (shouldRun) {
        if (!p.isLooping()) p.loop();
      } else {
        if (p.isLooping()) p.noLoop();
      }
    }, {
      root: null,
      threshold: [0, 0.1]
    });

    io.observe(target);

    // Tab/Window im Hintergrund? -> pausieren
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        p.noLoop();
        console.log('Flowfield: noLoop() wegen Tab-Hintergrund');
      } else if (isInView) {
        p.loop();
        console.log('Flowfield: loop() wegen Tab wieder aktiv');
      }
    });
  }

  function doReset(){
    p.noiseSeed(p.millis());
    fieldZ = 0;
    for (let i = 0; i < particles.length; i++){
      respawnParticle(particles[i]);
    }
    mouseCooldownUntil = p.millis() + 600; // kurz Maus-Einfluss pausieren
    p.background(0, 255, 230);
    p.redraw(); // erzwingt 1 Frame, auch wenn noLoop aktiv ist
  }

  // Pointer (Maus/Touch) + In-Canvas-Check + Cooldown
  function getPointer(){
    let x = p.mouseX, y = p.mouseY;
    if (p.touches && p.touches.length){
      x = p.touches[0].x; y = p.touches[0].y;
    }
    const inside = x >= 0 && x <= p.width && y >= 0 && y <= p.height;
    const active = inside && (p.millis() >= mouseCooldownUntil);
    return { x, y, active };
  }

  // Bildgröße proportional einpassen
  function fitSize(img, target){
    const w = img.width || target, h = img.height || target, r = w / h;
    if (r >= 1) return { w: target, h: target / r };
    return { w: target * r, h: target };
  }

  // Fallback: falls doch jemand das Fenster resized (zusätzlich zum Observer)
  p.windowResized = () => resizeToParent();

  p.keyPressed = () => {
    if (p.key.toLowerCase() === 'a') {
    manualPaused = !manualPaused;
    if (manualPaused) {
      // stoppe die draw-Schleife -> letzter Frame bleibt sichtbar
      p.noLoop();
    } else {
      // setze die draw-Schleife fort
      p.loop();
    }
  }
    if (p.key.toLowerCase() === 'r') doReset(); // "R" triggert Reset
  };
};

new p5(sketch);

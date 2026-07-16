const canvas = document.getElementById('sky');
const ctx    = canvas.getContext('2d');
const leavesContainer = document.getElementById('leaves');
const elSkyBg = document.getElementById('sky-bg');
const elFg    = document.getElementById('fg');

const PREFERS_REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DPR = Math.min(window.devicePixelRatio || 1, 1.5);

// ── Foreground: single drawImage at native resolution ────────────────
const fgCtx = elFg.getContext('2d');

const fgImg = new Image();
fgImg.src = 'bgg.png';

function drawFg() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  elFg.width  = W;
  elFg.height = H;

  if (!fgImg.complete || !fgImg.naturalWidth) return;

  const iW = fgImg.naturalWidth;
  const iH = fgImg.naturalHeight;
  const scale = Math.max(W / iW, H / iH);
  const dW = iW * scale;
  const dH = iH * scale;
  const dx = (W - dW) / 2;
  const dy = H - dH;

  fgCtx.imageSmoothingEnabled = true;
  fgCtx.imageSmoothingQuality = 'high';
  fgCtx.clearRect(0, 0, W, H);
  fgCtx.drawImage(fgImg, dx, dy, dW, dH);
}

fgImg.onload = drawFg;
window.addEventListener('resize', drawFg);

// ── Parallax ─────────────────────────────────────────────────────────
const parallax = { tx: 0, ty: 0, cx: 0, cy: 0 };
const PARALLAX_LAYERS = { skyBg: 0.012, sky: 0.02, fg: 0.012, leaves: 0.048 };
let lastPCx = 0, lastPCy = 0;
const PARALLAX_EPS = 0.0003;

window.addEventListener('mousemove', e => {
  parallax.tx = (e.clientX / window.innerWidth  - 0.5) * -1;
  parallax.ty = (e.clientY / window.innerHeight - 0.5) * -1;
  scheduleParallax();
});

function applyParallax(el, factor, base) {
  const px = (parallax.cx * factor * window.innerWidth).toFixed(1);
  const py = (parallax.cy * factor * window.innerHeight).toFixed(1);
  el.style.transform = base ? `${base} translate(${px}px,${py}px)` : `translate(${px}px,${py}px)`;
}

// Parallax runs in its own RAF that only spins while target≠current, so it
// stays at 60 Hz under the mouse without dragging the sky redraw rate up.
let parallaxRafScheduled = false;
function scheduleParallax() {
  if (PREFERS_REDUCED) return;
  if (parallaxRafScheduled) return;
  parallaxRafScheduled = true;
  requestAnimationFrame(parallaxTick);
}
function parallaxTick() {
  parallaxRafScheduled = false;
  parallax.cx += (parallax.tx - parallax.cx) * 0.12;
  parallax.cy += (parallax.ty - parallax.cy) * 0.12;
  if (Math.abs(parallax.cx - lastPCx) > PARALLAX_EPS ||
      Math.abs(parallax.cy - lastPCy) > PARALLAX_EPS) {
    lastPCx = parallax.cx;
    lastPCy = parallax.cy;
    applyParallax(elSkyBg,         PARALLAX_LAYERS.skyBg, 'scale(1.04)');
    applyParallax(canvas,          PARALLAX_LAYERS.sky,   'scale(1.04)');
    applyParallax(elFg,            PARALLAX_LAYERS.fg,    'scale(1.08)');
    applyParallax(leavesContainer, PARALLAX_LAYERS.leaves);
  }
  if (Math.abs(parallax.tx - parallax.cx) > PARALLAX_EPS ||
      Math.abs(parallax.ty - parallax.cy) > PARALLAX_EPS) {
    scheduleParallax();
  }
}

// ── Moon — static parts pre-rendered to OffscreenCanvas ──────────────
const MOON_X = 0.22;
const MOON_Y = 0.18;
let moonStatic = null, moonStaticR = 0, moonStaticSize = 0;

function buildMoonStatic(r) {
  if (r === moonStaticR && moonStatic) return;
  moonStaticR   = r;
  moonStaticSize = Math.ceil(r * 8);
  moonStatic = new OffscreenCanvas(moonStaticSize, moonStaticSize);
  const oc = moonStatic.getContext('2d');
  const c  = moonStaticSize / 2;

  const halo = oc.createRadialGradient(c, c, r * 0.9, c, c, r * 3.8);
  halo.addColorStop(0,   'rgba(210,220,255,0.13)');
  halo.addColorStop(0.4, 'rgba(180,195,255,0.06)');
  halo.addColorStop(1,   'rgba(180,195,255,0)');
  oc.beginPath(); oc.arc(c, c, r * 3.8, 0, Math.PI * 2); oc.fillStyle = halo; oc.fill();

  const glow = oc.createRadialGradient(c, c, r * 0.7, c, c, r * 1.7);
  glow.addColorStop(0,   'rgba(230,235,255,0.32)');
  glow.addColorStop(0.6, 'rgba(200,210,255,0.10)');
  glow.addColorStop(1,   'rgba(200,210,255,0)');
  oc.beginPath(); oc.arc(c, c, r * 1.7, 0, Math.PI * 2); oc.fillStyle = glow; oc.fill();

  const disc = oc.createRadialGradient(c - r * 0.25, c - r * 0.25, r * 0.05, c, c, r);
  disc.addColorStop(0,    '#f0f4ff');
  disc.addColorStop(0.55, '#d8e0f8');
  disc.addColorStop(1,    '#b0bce8');
  oc.beginPath(); oc.arc(c, c, r, 0, Math.PI * 2); oc.fillStyle = disc; oc.fill();
}

const wisps = [
  { ox: -0.06, oy: -0.02, speed: 0.0018, alpha: 0.12, phase: 0   },
  { ox:  0,    oy:  0.01, speed: 0.0024, alpha: 0.16, phase: 1.2 },
  { ox:  0.06, oy:  0.04, speed: 0.0030, alpha: 0.20, phase: 2.4 },
];

// ── Stars + bg cache (everything in the sky, baked once per resize) ──
const STAR_POSITIONS = [
  [0.08, 0.07], [0.15, 0.10], [0.27, 0.06], [0.38, 0.04], [0.48, 0.08],
  [0.52, 0.17], [0.57, 0.14], [0.63, 0.07], [0.68, 0.22],
  [0.73, 0.05], [0.79, 0.13], [0.84, 0.09], [0.87, 0.27],
  [0.91, 0.11], [0.78, 0.31], [0.44, 0.21], [0.33, 0.13],
  [0.20, 0.19], [0.95, 0.18], [0.02, 0.14],
];
const stars = STAR_POSITIONS.map(([x, y]) => ({
  x, y,
  r:     Math.random() * 1.2 + 0.6,
  phase: Math.random() * Math.PI * 2,
}));

let bgCache = null;

function rebuildBgCache() {
  const W = canvas.width, H = canvas.height;
  if (!W || !H) { bgCache = null; return; }
  bgCache = new OffscreenCanvas(W, H);
  const bc = bgCache.getContext('2d');

  // Moon (disc + halo + glow, baked)
  const r = Math.min(W, H) * 0.055;
  buildMoonStatic(r);
  const mx = MOON_X * W, my = MOON_Y * H;
  const half = moonStaticSize / 2;
  bc.drawImage(moonStatic, mx - half, my - half);

  // Wisps — frozen at their phase (no per-frame motion)
  const wispRange = r * 5;
  for (let i = 0; i < wisps.length; i++) {
    const w = wisps[i];
    const wx = mx + Math.sin(w.phase) * wispRange;
    const wy = my + w.oy * H * 0.6;
    const ww = Math.abs(r * (2.8 + w.ox * 2));
    const wh = Math.max(2, r * 0.22);
    bc.globalAlpha = w.alpha * (0.7 + 0.3 * Math.sin(w.phase));
    bc.beginPath();
    bc.ellipse(wx, wy, ww, wh, 0, 0, Math.PI * 2);
    bc.fillStyle = 'rgba(255,255,255,1)';
    bc.fill();
  }
  bc.globalAlpha = 1;

  // Stars — frozen at their phase (no twinkle)
  bc.fillStyle = 'rgba(255,248,230,1)';
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    bc.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(s.phase));
    bc.beginPath();
    bc.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
    bc.fill();
  }
  bc.globalAlpha = 1;
}

function paintStaticSky() {
  if (!bgCache) rebuildBgCache();
  if (!bgCache) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bgCache, 0, 0);
}

// ── Shooting stars ────────────────────────────────────────────────────
const shooters = [];
const CAP = 256;

function spawnShooter() {
  if (PREFERS_REDUCED) return;
  const startX = Math.random() * canvas.width;
  const startY = Math.random() * canvas.height * 0.3;
  const angle  = (5 + Math.random() * 15) * Math.PI / 180;
  const speed  = 1200 + Math.random() * 800;
  const length = 200 + Math.random() * 250;
  const thickness = (2.5 + Math.random() * 2.5) * (1 + Math.random() * 2);
  const curve  = 0.2 + Math.random() * 0.4;
  const r = Math.floor(180 + Math.random() * 75);
  const g = Math.floor(210 + Math.random() * 45);
  const history = new Float32Array(CAP * 2);
  history[0] = startX; history[1] = startY;
  shooters.push({ x: startX, y: startY, angle, speed, length, thickness, curve, r, g, alpha: 1, history, head: 1, tail: 0 });
}

function kickShooter() {
  spawnShooter();
  schedule();
}
for (let i = 0; i < 3; i++) setTimeout(kickShooter, Math.random() * 2000);
// Independent spawn check — keeps the draw loop fully dormant while no shooters exist
setInterval(() => {
  if (PREFERS_REDUCED) return;
  if (Math.random() < 0.125) kickShooter(); // ~1 per 8 s
}, 1000);

// Pre-rendered head glow sprite cache (replaces per-frame shadowBlur)
const headSprites = new Map();
function getHeadSprite(r, g, thickness) {
  const tBucket = Math.max(2, Math.round(thickness));
  const key = (r << 16) | (g << 8) | tBucket;
  let sprite = headSprites.get(key);
  if (sprite) return sprite;
  const size = tBucket * 8;
  sprite = new OffscreenCanvas(size, size);
  const sc = sprite.getContext('2d');
  const c = size / 2;
  const grad = sc.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0,    'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.45, `rgba(${r},${g},255,0.45)`);
  grad.addColorStop(1,    `rgba(${r},${g},255,0)`);
  sc.fillStyle = grad;
  sc.beginPath(); sc.arc(c, c, c, 0, Math.PI * 2); sc.fill();
  headSprites.set(key, sprite);
  return sprite;
}

// ── Canvas resize ─────────────────────────────────────────────────────
function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  moonStatic = null;
  bgCache    = null;
  paintStaticSky();
}
window.addEventListener('resize', resize);
resize();

// ── Animation loop — only runs while a shooter is on screen ──────────
// When no shooters exist the canvas is left holding the static bgCache and
// the RAF is never scheduled. WebView2 / Lively then has no continuous
// compositor work for this layer.
let lastTime = 0;
let rafScheduled = false;

function schedule() {
  if (PREFERS_REDUCED) return;
  if (rafScheduled) return;
  if (shooters.length === 0) return;
  rafScheduled = true;
  requestAnimationFrame(draw);
}

function draw(timestamp) {
  rafScheduled = false;
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);
  if (bgCache) ctx.drawImage(bgCache, 0, 0);

  ctx.globalCompositeOperation = 'screen';
  for (let i = shooters.length - 1; i >= 0; i--) {
    const s = shooters[i];
    s.angle += s.curve * dt;
    s.x += Math.cos(s.angle) * s.speed * dt;
    s.y += Math.sin(s.angle) * s.speed * dt;

    const hi = s.head * 2;
    s.history[hi]     = s.x;
    s.history[hi + 1] = s.y;
    s.head = (s.head + 1) % CAP;

    const lenSq = s.length * s.length;
    while (s.tail !== s.head) {
      const ti = s.tail * 2;
      const dx = s.x - s.history[ti];
      const dy = s.y - s.history[ti + 1];
      if (dx * dx + dy * dy > lenSq) s.tail = (s.tail + 1) % CAP;
      else break;
    }

    const ptCount = (s.head - s.tail + CAP) % CAP;
    if (ptCount < 2) continue;

    const tailI = s.tail * 2;
    const tailX = s.history[tailI], tailY = s.history[tailI + 1];
    const headPrev = ((s.head - 1 + CAP) % CAP) * 2;
    const headX = s.history[headPrev], headY = s.history[headPrev + 1];

    if (tailX > W || tailY > H || tailX < -s.length * 2) {
      shooters.splice(i, 1);
      continue;
    }

    const grad = ctx.createLinearGradient(tailX, tailY, headX, headY);
    grad.addColorStop(0,   `rgba(${s.r},${s.g},255,0)`);
    grad.addColorStop(0.5, `rgba(${s.r},${s.g},255,${s.alpha * 0.4})`);
    grad.addColorStop(1,   `rgba(255,255,255,${s.alpha})`);

    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    let j = (s.tail + 1) % CAP;
    while (j !== s.head) {
      ctx.lineTo(s.history[j * 2], s.history[j * 2 + 1]);
      j = (j + 1) % CAP;
    }
    ctx.strokeStyle = grad;
    ctx.lineWidth   = s.thickness;
    ctx.stroke();

    // Glow head — sprite blit instead of shadowBlur
    const sprite = getHeadSprite(s.r, s.g, s.thickness);
    const sz = sprite.width;
    ctx.globalAlpha = s.alpha;
    ctx.drawImage(sprite, headX - sz / 2, headY - sz / 2);
    ctx.globalAlpha = 1;
  }
  ctx.globalCompositeOperation = 'source-over';

  if (shooters.length > 0) {
    schedule();
  } else {
    // Last shooter just expired — repaint clean static sky one final time
    paintStaticSky();
  }
}

paintStaticSky();

// ── Leaves — bake each cluster to a single canvas element ────────────
function rand(min, max) { return min + Math.random() * (max - min); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Simple 4-vertex quadrilateral leaf silhouettes — cheap clip-path / Path2D
const LEAF_SHAPES = [
  '50% 0%, 92% 50%, 50% 100%, 8% 50%',
  '45% 0%, 96% 48%, 55% 100%, 5% 52%',
  '55% 0%, 87% 55%, 45% 100%, 14% 45%',
  '50% 4%, 100% 55%, 50% 96%, 0% 45%',
];

const LEAF_COLORS = [
  ['#33216f', '#15082e', '#05020f'],
  ['#2b1a63', '#12072a', '#05020d'],
  ['#3d2b7d', '#1c0d3d', '#080316'],
  ['#211654', '#0e0624', '#04020d'],
];

// Parse polygon strings to normalized [0..1] points once
const LEAF_SHAPE_POINTS = LEAF_SHAPES.map(s =>
  s.split(',').map(pair => {
    const [x, y] = pair.trim().split(/\s+/).map(v => parseFloat(v) / 100);
    return [x, y];
  })
);

function shapeToPath(idx, w, h) {
  const pts = LEAF_SHAPE_POINTS[idx];
  const path = new Path2D();
  path.moveTo(pts[0][0] * w, pts[0][1] * h);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0] * w, pts[i][1] * h);
  path.closePath();
  return path;
}

const BRANCH_CLUSTERS = [
  {
    rootX: 100, rootY: 10,
    branches: [
      { angle: 166, length: 390, leaves: 34 },
      { angle: 146, length: 300, leaves: 26 },
      { angle: 191, length: 250, leaves: 20 },
      { angle: 128, length: 210, leaves: 16 },
    ],
  },
  {
    rootX: 101, rootY: 35,
    branches: [
      { angle: 188, length: 230, leaves: 18 },
      { angle: 214, length: 180, leaves: 14 },
      { angle: 156, length: 170, leaves: 12 },
    ],
  },
  {
    rootX: 108, rootY: 60,
    branches: [
      { angle: 175, length: 300, leaves: 26 },
      { angle: 155, length: 240, leaves: 20 },
      { angle: 200, length: 200, leaves: 16 },
    ],
  },
  {
    rootX: -1, rootY: 92,
    branches: [
      { angle: -34, length: 300, leaves: 28 },
      { angle: -62, length: 240, leaves: 20 },
      { angle:  -5, length: 220, leaves: 18 },
      { angle: -82, length: 170, leaves: 14 },
    ],
  },
  {
    rootX: 86, rootY: 104,
    branches: [
      { angle: -143, length: 340, leaves: 32 },
      { angle: -118, length: 260, leaves: 24 },
      { angle: -171, length: 230, leaves: 20 },
      { angle:  -92, length: 180, leaves: 14 },
    ],
  },
  {
    rootX: -8, rootY: 75,
    branches: [
      { angle: -20, length: 280, leaves: 24 },
      { angle: -50, length: 230, leaves: 18 },
      { angle:  10, length: 180, leaves: 14 },
    ],
  },
];

function renderClusterToCanvas(cluster) {
  // First pass: generate all leaf/stem items (with random data baked once)
  const items = [];
  cluster.branches.forEach(branch => {
    const rad      = branch.angle * Math.PI / 180;
    const normal   = rad + Math.PI / 2;
    const twigCount = Math.max(2, Math.round(branch.leaves / 8));

    items.push({
      kind: 'stem', main: true,
      x: 0, y: 0, angle: branch.angle,
      length: branch.length, thick: rand(4.2, 7.2), opacity: rand(0.92, 1),
    });

    for (let i = 0; i < twigCount; i++) {
      const t        = (i + 1) / (twigCount + 1);
      const side     = i % 2 === 0 ? 1 : -1;
      const sx       = Math.cos(rad) * branch.length * t;
      const sy       = Math.sin(rad) * branch.length * t;
      const twigAngle  = branch.angle + side * rand(28, 58);
      const twigLength = rand(28, 66);
      const twigScale  = branch.length > 260 ? 1.25 : 1;
      const twigLen    = twigLength * twigScale;

      items.push({
        kind: 'stem', main: false,
        x: sx, y: sy, angle: twigAngle,
        length: twigLen, thick: rand(2.4, 4.2), opacity: rand(0.84, 0.98),
      });

      for (let j = 0; j < 2; j++) {
        const twigT   = rand(0.35, 1);
        const twigRad = twigAngle * Math.PI / 180;
        const lw = rand(11, 20);
        items.push({
          kind: 'leaf',
          x: sx + Math.cos(twigRad) * twigLen * twigT + rand(-4, 4),
          y: sy + Math.sin(twigRad) * twigLen * twigT + rand(-4, 4),
          w: lw, h: lw * rand(1.75, 2.55),
          rot: twigAngle + side * rand(45, 75),
          colors: pick(LEAF_COLORS),
          shape: Math.floor(Math.random() * LEAF_SHAPES.length),
          opacity: rand(0.9, 1),
        });
      }
    }

    for (let i = 0; i < branch.leaves; i++) {
      const t    = rand(0.18, 0.98);
      const side = Math.random() < 0.5 ? 1 : -1;
      const off  = rand(7, 21) * side;
      const lw   = rand(11, 20);
      items.push({
        kind: 'leaf',
        x: Math.cos(rad) * branch.length * t + Math.cos(normal) * off,
        y: Math.sin(rad) * branch.length * t + Math.sin(normal) * off,
        w: lw, h: lw * rand(1.75, 2.55),
        rot: branch.angle + side * rand(58, 95),
        colors: pick(LEAF_COLORS),
        shape: Math.floor(Math.random() * LEAF_SHAPES.length),
        opacity: rand(0.9, 1),
      });
    }
  });

  // Bounding box including (0,0) so root is inside the canvas
  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  for (const it of items) {
    if (it.kind === 'stem') {
      const rad = it.angle * Math.PI / 180;
      const ex = it.x + Math.cos(rad) * it.length;
      const ey = it.y + Math.sin(rad) * it.length;
      const pad = it.thick;
      if (it.x - pad < minX) minX = it.x - pad;
      if (it.y - pad < minY) minY = it.y - pad;
      if (it.x + pad > maxX) maxX = it.x + pad;
      if (it.y + pad > maxY) maxY = it.y + pad;
      if (ex - pad < minX) minX = ex - pad;
      if (ey - pad < minY) minY = ey - pad;
      if (ex + pad > maxX) maxX = ex + pad;
      if (ey + pad > maxY) maxY = ey + pad;
    } else {
      const r = Math.max(it.w, it.h) * 0.9;
      if (it.x - r < minX) minX = it.x - r;
      if (it.y - r < minY) minY = it.y - r;
      if (it.x + r > maxX) maxX = it.x + r;
      if (it.y + r > maxY) maxY = it.y + r;
    }
  }
  // Pad for branchSway rotation tolerance (~1deg max)
  const farthest = Math.max(Math.abs(minX), Math.abs(minY), Math.abs(maxX), Math.abs(maxY));
  const swayPad  = Math.ceil(farthest * 0.02) + 6;
  minX -= swayPad; minY -= swayPad; maxX += swayPad; maxY += swayPad;

  const w = Math.ceil(maxX - minX);
  const h = Math.ceil(maxY - minY);

  const c = document.createElement('canvas');
  c.width  = Math.ceil(w * DPR);
  c.height = Math.ceil(h * DPR);
  c.style.width    = w + 'px';
  c.style.height   = h + 'px';
  c.style.position = 'absolute';
  c.style.left     = minX + 'px';
  c.style.top      = minY + 'px';
  c.style.pointerEvents = 'none';

  const cc = c.getContext('2d');
  cc.scale(DPR, DPR);
  cc.translate(-minX, -minY); // local origin (0,0) is the root
  cc.imageSmoothingEnabled = true;
  cc.imageSmoothingQuality = 'high';

  // Stems first (under leaves)
  for (const it of items) {
    if (it.kind !== 'stem') continue;
    cc.save();
    cc.globalAlpha = it.opacity;
    cc.translate(it.x, it.y);
    cc.rotate(it.angle * Math.PI / 180);
    const grad = cc.createLinearGradient(0, 0, it.length, 0);
    if (it.main) {
      grad.addColorStop(0,    '#03010a');
      grad.addColorStop(0.54, '#130629');
      grad.addColorStop(1,    '#020107');
    } else {
      grad.addColorStop(0,    '#05020d');
      grad.addColorStop(0.64, '#17082f');
      grad.addColorStop(1,    '#030109');
    }
    cc.fillStyle = grad;
    cc.beginPath();
    if (cc.roundRect) cc.roundRect(0, -it.thick / 2, it.length, it.thick, it.thick / 2);
    else cc.rect(0, -it.thick / 2, it.length, it.thick);
    cc.fill();
    cc.restore();
  }

  // Leaves on top, matching the original transform-origin: 50% 88%
  for (const it of items) {
    if (it.kind !== 'leaf') continue;
    cc.save();
    cc.globalAlpha = it.opacity;
    cc.translate(it.x, it.y);
    cc.rotate(it.rot * Math.PI / 180);
    cc.translate(-it.w / 2, -it.h * 0.88);
    // Main fill
    const grad = cc.createLinearGradient(0, 0, it.w * 0.7, it.h);
    grad.addColorStop(0,    it.colors[0]);
    grad.addColorStop(0.46, it.colors[1]);
    grad.addColorStop(1,    it.colors[2]);
    cc.fillStyle = grad;
    const path = shapeToPath(it.shape, it.w, it.h);
    cc.fill(path);
    // Highlight (radial at 38%, 24% of original)
    cc.save();
    cc.clip(path);
    const hi = cc.createRadialGradient(it.w * 0.38, it.h * 0.24, 0, it.w * 0.38, it.h * 0.24, it.w * 0.55);
    hi.addColorStop(0, it.colors[0]);
    hi.addColorStop(1, 'rgba(0,0,0,0)');
    cc.fillStyle = hi;
    cc.fillRect(0, 0, it.w, it.h);
    cc.restore();
    cc.restore();
  }

  return c;
}

function createBranchCluster(cluster) {
  const branchEl = document.createElement('div');
  branchEl.className = 'branch';
  branchEl.style.setProperty('--root-x', cluster.rootX.toFixed(1) + 'vw');
  branchEl.style.setProperty('--root-y', cluster.rootY.toFixed(1) + 'vh');
  branchEl.appendChild(renderClusterToCanvas(cluster));
  leavesContainer.appendChild(branchEl);
}

BRANCH_CLUSTERS.forEach(createBranchCluster);

// ── Drifting leaves (DOM, capped — every drift = continuous compositor
// work, so we keep them rare and singular to let WebView2 sit idle most
// of the time)
let activeDrifts = 0;
const MAX_DRIFTS = 1;

function spawnDriftingLeaf() {
  if (PREFERS_REDUCED) return;
  if (activeDrifts >= MAX_DRIFTS) return;
  activeDrifts++;
  const fromRight = Math.random() < 0.68;
  const w  = rand(9, 16);
  const el = document.createElement('i');
  el.className = 'leaf leaf--drift';
  const colors = pick(LEAF_COLORS);
  el.style.setProperty('--x',        (fromRight ? rand(86, 102) : rand(-4, 14)).toFixed(1) + 'vw');
  el.style.setProperty('--w',        w.toFixed(1) + 'px');
  el.style.setProperty('--h',        (w * rand(1.55, 2.2)).toFixed(1) + 'px');
  el.style.setProperty('--rot',      rand(-80, 80).toFixed(1) + 'deg');
  el.style.setProperty('--skew',     rand(-8, 8).toFixed(1) + 'deg');
  el.style.setProperty('--dur',      rand(8.5, 14).toFixed(2) + 's');
  el.style.setProperty('--opacity',  rand(0.6, 0.82).toFixed(2));
  el.style.setProperty('--shape',    pick(LEAF_SHAPES));
  el.style.setProperty('--leaf-hi',  colors[0]);
  el.style.setProperty('--leaf',     colors[1]);
  el.style.setProperty('--leaf-lo',  colors[2]);
  el.style.setProperty('--wind-x',   rand(fromRight ? -190 : 110, fromRight ? -70 : 220).toFixed(1) + 'px');
  el.addEventListener('animationend', () => { el.remove(); activeDrifts--; });
  leavesContainer.appendChild(el);
}

setTimeout(spawnDriftingLeaf, 4000);
setInterval(spawnDriftingLeaf, 25000);

// ── Clock ─────────────────────────────────────────────────────────────
const hudTime = document.getElementById('hud-time');
const hudDate = document.getElementById('hud-date');
const MONTHS  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS    = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function tickClock() {
  const now = new Date();
  hudTime.textContent = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  hudDate.textContent = MONTHS[now.getMonth()] + ' ' + now.getDate() + ' • ' + DAYS[now.getDay()];
}
tickClock();
setInterval(tickClock, 1000);

// A particle globe: every speck is churches from the Lookup index, on a pixel-dithered sphere.
// Plain canvas, no dependencies. Orthographic projection, front hemisphere only.

const RAD = Math.PI / 180;
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// 4×4 ordered (Bayer) dither thresholds, 0..1.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGlobe(canvas, data, opts = {}) {
  const ctx = canvas.getContext("2d");
  const pinColor = opts.pinColor ?? "#C084FC";

  // Particles: a few per cell, more for denser cells, jittered inside the cell so the grid disappears.
  const cells = data.data.length / 3;
  let max = 1;
  for (let i = 0; i < cells; i++) max = Math.max(max, data.data[i * 3 + 2]);
  const plat = [], plng = [], pw = [], ph = [];
  const rand = rng(20261105);
  const jitter = data.unit * 0.44;
  for (let i = 0; i < cells; i++) {
    const la = data.data[i * 3] * data.unit, lo = data.data[i * 3 + 1] * data.unit, c = data.data[i * 3 + 2];
    const k = Math.min(7, Math.ceil(Math.log2(c + 1)));
    const w = Math.log1p(c) / Math.log1p(max);
    for (let j = 0; j < k; j++) {
      plat.push((la + (rand() - 0.5) * 2 * jitter) * RAD);
      plng.push((lo + (rand() - 0.5) * 2 * jitter) * RAD);
      pw.push(w);
      ph.push(rand() * Math.PI * 2);
    }
  }
  const n = plat.length;
  const sinLa = Float32Array.from(plat, Math.sin), cosLa = Float32Array.from(plat, Math.cos), lng = Float32Array.from(plng);

  let lat0 = opts.lat ?? 28, lng0 = opts.lng ?? -38;
  let dpr = 1;
  let pins = [];
  let selected = null;
  let anim = null;
  let dragging = null;
  let idleUntil = 0;
  let visible = true;
  let raf = 0;
  let drift = 1;
  let shade = null; // pre-rendered dithered sphere

  // The globe is much wider than the canvas is tall, so only its top shows, like a planet rising.
  function geometry() {
    const W = canvas.width, H = canvas.height;
    // opts.scale zooms in, for a closer, flatter horizon where the land reads larger.
    // opts.top is the room above the limb, so the atmosphere glow can fade out before the canvas edge.
    const R = Math.min(W * 0.66, 1300 * dpr) * (opts.scale ?? 1);
    return { W, H, R, cx: W / 2, cy: opts.centerY == null ? R + (opts.top ?? 36) * dpr : H * opts.centerY };
  }

  function renderShade() {
    const { W, H, R, cx, cy } = geometry();
    shade = document.createElement("canvas");
    shade.width = W; shade.height = H;
    const s = shade.getContext("2d");
    const P = Math.max(2, Math.round(2 * dpr)); // pixel size
    // Light from the upper left and slightly in front.
    const L = [-0.42, -0.72, 0.55], ll = Math.hypot(...L);
    const lx = L[0] / ll, ly = L[1] / ll, lz = L[2] / ll;
    s.fillStyle = "rgba(139, 92, 246, 0.34)";
    for (let y = 0; y < H; y += P) {
      for (let x = 0; x < W; x += P) {
        const nx = (x + P / 2 - cx) / R, ny = (y + P / 2 - cy) / R, d = nx * nx + ny * ny;
        if (d > 1) continue;
        const nz = Math.sqrt(1 - d);
        const lit = Math.max(0, nx * lx + ny * ly + nz * lz);
        // Mostly dark, brightening toward the lit limb, so the dither reads as a soft gradient of pixels.
        const v = Math.pow(lit, 3.2) * 0.5 + Math.pow(1 - nz, 3) * 0.55;
        if (v > BAYER[((y / P) & 3) * 4 + ((x / P) & 3)]) s.fillRect(x, y, P - Math.max(1, dpr * 0.5), P - Math.max(1, dpr * 0.5));
      }
    }
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    renderShade();
    draw();
  }

  function project(sinLa_, cosLa_, lo, sinLat0, cosLat0, cosL0, sinL0) {
    // cos/sin of (lo - lng0) without calling trig per particle twice.
    const cl = Math.cos(lo), sl = Math.sin(lo);
    const cd = cl * cosL0 + sl * sinL0, sd = sl * cosL0 - cl * sinL0;
    return [cosLa_ * sd, cosLat0 * sinLa_ - sinLat0 * cosLa_ * cd, sinLat0 * sinLa_ + cosLat0 * cosLa_ * cd];
  }

  const BUCKETS = 7;
  const paths = new Array(BUCKETS);

  function draw(t = performance.now()) {
    const { W, H, R, cx, cy } = geometry();
    ctx.clearRect(0, 0, W, H);

    // Atmosphere: a violet glow hugging the limb.
    const glow = ctx.createRadialGradient(cx, cy, R * 0.97, cx, cy, R * 1.09);
    glow.addColorStop(0, "rgba(139, 92, 246, 0.0)");
    glow.addColorStop(0.35, "rgba(167, 139, 250, 0.28)");
    glow.addColorStop(1, "rgba(76, 29, 149, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    if (shade) ctx.drawImage(shade, 0, 0);

    // Limb highlight, brightest where the light hits.
    const limb = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
    limb.addColorStop(0, "rgba(196,181,253,0.0)");
    limb.addColorStop(0.35, "rgba(221,214,254,0.85)");
    limb.addColorStop(0.65, "rgba(196,181,253,0.35)");
    limb.addColorStop(1, "rgba(196,181,253,0.0)");
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI, Math.PI * 2);
    ctx.lineWidth = 1.25 * dpr;
    ctx.strokeStyle = limb;
    ctx.stroke();

    // Churches as pixel particles, snapped to the pixel grid and batched by brightness.
    const sinLat0 = Math.sin(lat0 * RAD), cosLat0 = Math.cos(lat0 * RAD);
    const cosL0 = Math.cos(lng0 * RAD), sinL0 = Math.sin(lng0 * RAD);
    const P = Math.max(1, Math.round(dpr));
    const tw = reduceMotion() ? 0 : t * 0.0012;
    for (let b = 0; b < BUCKETS; b++) paths[b] = new Path2D();
    for (let i = 0; i < n; i++) {
      const [x, y, c] = project(sinLa[i], cosLa[i], lng[i], sinLat0, cosLat0, cosL0, sinL0);
      if (c <= 0.03) continue;
      const py = cy - y * R;
      if (py < -4 || py > H + 4) continue;
      const px = cx + x * R;
      const twinkle = tw ? 0.88 + 0.12 * Math.sin(tw + ph[i]) : 1;
      const v = (0.25 + 0.75 * pw[i]) * (0.3 + 0.7 * c) * twinkle;
      const b = Math.min(BUCKETS - 1, Math.floor(v * BUCKETS));
      const size = (pw[i] > 0.6 ? 2 : 1) * P;
      paths[b].rect(Math.round(px / P) * P, Math.round(py / P) * P, size, size);
    }
    for (let b = 0; b < BUCKETS; b++) {
      const k = b / (BUCKETS - 1);
      // Deep violet for faint specks through lilac to near white for the densest.
      const r = Math.round(150 + 105 * k), g = Math.round(110 + 130 * k), bl = Math.round(230 + 25 * k);
      ctx.fillStyle = `rgba(${r},${g},${bl},${0.35 + 0.65 * k})`;
      ctx.fill(paths[b]);
    }

    // Result pins, then the selected church with a pulse. Pins stay round.
    for (const p of pins) {
      const [x, y, c] = project(Math.sin(p.lat * RAD), Math.cos(p.lat * RAD), p.lng * RAD, sinLat0, cosLat0, cosL0, sinL0);
      if (c <= 0) continue;
      dot(cx + x * R, cy - y * R, 4 * dpr, pinColor, 1.5 * dpr);
    }
    if (selected) {
      const [x, y, c] = project(Math.sin(selected.lat * RAD), Math.cos(selected.lat * RAD), selected.lng * RAD, sinLat0, cosLat0, cosL0, sinL0);
      if (c > 0) {
        const px = cx + x * R, py = cy - y * R;
        if (!reduceMotion()) {
          const phase = ((t - selected.at) % 1600) / 1600;
          ctx.beginPath();
          ctx.arc(px, py, (8 + phase * 24) * dpr, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(233,213,255,${0.75 * (1 - phase)})`;
          ctx.lineWidth = 1.5 * dpr;
          ctx.stroke();
        }
        dot(px, py, 6 * dpr, "#fff", 2.5 * dpr, pinColor);
      }
    }
  }

  // Where a point sits on screen right now, in CSS pixels, so HTML labels can follow the globe.
  function screen(la, lo) {
    const { R, cx, cy } = geometry();
    const sinLat0 = Math.sin(lat0 * RAD), cosLat0 = Math.cos(lat0 * RAD);
    const [x, y, c] = project(Math.sin(la * RAD), Math.cos(la * RAD), lo * RAD, sinLat0, cosLat0, Math.cos(lng0 * RAD), Math.sin(lng0 * RAD));
    return { x: (cx + x * R) / dpr, y: (cy - y * R) / dpr, visible: c > 0.05 };
  }

  function dot(x, y, r, fill, ring, ringColor = "#0A0618") {
    ctx.beginPath();
    ctx.arc(x, y, r + ring, 0, Math.PI * 2);
    ctx.fillStyle = ringColor;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function frame(t) {
    raf = 0;
    if (anim) {
      const k = Math.min(1, (t - anim.start) / anim.ms);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      lat0 = anim.fromLat + (anim.toLat - anim.fromLat) * e;
      lng0 = anim.fromLng + anim.dLng * e;
      if (k >= 1) anim = null;
    } else if (!dragging && !reduceMotion() && t > idleUntil && !selected) {
      // Sweep between western North America and eastern Europe, where the churches are,
      // rather than spinning on into an empty Pacific.
      if (lng0 > (opts.driftMax ?? 30)) drift = -1;
      else if (lng0 < (opts.driftMin ?? -125)) drift = 1;
      lng0 += (opts.driftSpeed ?? 0.04) * drift;
    }
    draw(t);
    opts.onFrame?.(screen);
    if (visible && !reduceMotion() && !dragging) raf = requestAnimationFrame(frame);
    else if (visible && anim) raf = requestAnimationFrame(frame);
  }

  function wake() {
    if (!raf && visible) raf = requestAnimationFrame(frame);
  }

  // The globe isn't draggable: it turns on its own and flies to picked churches.

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const intersectionObserver = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(); });
  intersectionObserver.observe(canvas);
  const onVisibility = () => { visible = !document.hidden; if (visible) wake(); };
  document.addEventListener("visibilitychange", onVisibility);
  resize();
  wake();

  return {
    destroy() {
      visible = false;
      if (raf) cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    },
    particles: n,
    screen,
    /** The current view center, for layers that turn with the globe. */
    view: () => ({ lat: lat0, lng: lng0 }),
    setPins(list) {
      pins = list.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
      if (!selected && pins.length && !dragging) this.flyTo(pins[0].lat, pins[0].lng, { soft: true });
      draw();
      opts.onFrame?.(screen);
      wake();
    },
    select(p) {
      selected = p ? { ...p, at: performance.now() } : null;
      // Aim a little south of the church, so its pin rises into the visible top of the globe.
      if (p) this.flyTo(p.lat - (opts.pinOffset ?? 0), p.lng);
      wake();
    },
    /** Recompute the selected pin's framing after its card or viewport changes size. */
    reframe() {
      if (selected) this.flyTo(selected.lat - (opts.pinOffset ?? 0), selected.lng);
    },
    flyTo(la, lo, { soft = false } = {}) {
      // This is camera rotation, not a geographic coordinate. It must pass the south
      // pole to raise Australia/New Zealand into the visible band of the sphere.
      const toLat = la;
      const dLng = ((lo - lng0 + 540) % 360) - 180;
      if (reduceMotion()) {
        lat0 = toLat; lng0 += dLng; anim = null; draw(); opts.onFrame?.(screen); return;
      }
      // While typing, only drift toward results; a pick gets the full flight.
      const ms = soft ? 900 : 1400;
      anim = { start: performance.now(), ms, fromLat: lat0, toLat: soft ? lat0 + (toLat - lat0) * 0.6 : toLat, fromLng: lng0, dLng: soft ? dLng * 0.6 : dLng };
      idleUntil = performance.now() + 6000;
      wake();
    },
  };
}

// World view: an orthographic globe drawn on a canvas with d3-geo. Drag to spin, scroll or pinch to zoom,
// click an earthquake to select it. Drawn flat, like a printed map: no glow, shading or animation. Coastlines and borders are Natural Earth (world-atlas), like the detail map:
// 1:110m when zoomed out, 1:50m when zoomed in.
const GLOBE = (() => {
  const DEG = 180 / Math.PI, SEA = '#cfdce5', LAND = '#f4f4f1', COAST = '#8a959e', ACCENT = '#c80000';
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const ageColor = age => age < 3600e3 ? '#d7191c' : age < 864e5 ? '#fd8d3c' : age < 7 * 864e5 ? '#fed24c' : '#ffffff';
  const radius = M => 2.2 + Math.pow(Math.max(M - 4, 0), 1.45) * 2.1;

  // geo: {land110, land50, borders110, borders50} as GeoJSON. opts: {onPick(item|null), onHover(item|null, x, y), accent}
  // Draws only when something changes (drag, zoom, fly-to, hover, selection, new items), not every animation frame.
  function create(canvas, geo, opts) {
    const ctx = canvas.getContext('2d'), base = document.createElement('canvas'), bctx = base.getContext('2d');
    const proj = d3.geoOrthographic().clipAngle(90).precision(0.4), path = d3.geoPath(proj), grat = d3.geoGraticule10();
    let w = 0, h = 0, dpr = 1, R0 = 1, k = 1, rot = [-30, -18, 0], items = [], selected = null, hovered = null, baseKey = '';
    let running = false, raf = 0, last = 0, fly = null, vel = null;
    const accent = opts.accent || ACCENT;
    const pointers = new Map(); let drag = null, pinch = null;

    function resize() {
      w = canvas.clientWidth; h = canvas.clientHeight; dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = base.width = Math.max(1, Math.round(w * dpr)); canvas.height = base.height = Math.max(1, Math.round(h * dpr));
      R0 = Math.max(60, Math.min(w, h) * 0.43); baseKey = ''; kick();
    }
    const center = () => [-rot[0], -rot[1]];
    const visible = it => d3.geoDistance([it.lon, it.lat], center()) < Math.PI / 2 - 0.01;
    const sizeOf = it => radius(it.M) * Math.min(2, Math.pow(k, 0.35));

    function drawBase() {
      const fine = k >= 1.6, key = [rot[0].toFixed(3), rot[1].toFixed(3), k.toFixed(4), w, h, fine].join();
      if (key === baseKey) return; baseKey = key;
      const R = R0 * k, cx = w / 2, cy = h / 2, c = bctx;
      proj.scale(R).translate([cx, cy]).rotate(rot); path.context(c);
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
      c.beginPath(); path({ type: 'Sphere' }); c.fillStyle = SEA; c.fill();
      c.beginPath(); path(grat); c.strokeStyle = 'rgba(70,100,130,.13)'; c.lineWidth = .6; c.stroke();
      c.beginPath(); path(fine ? geo.land50 : geo.land110); c.fillStyle = LAND; c.fill(); c.strokeStyle = COAST; c.lineWidth = .7; c.stroke();
      c.beginPath(); path(fine ? geo.borders50 : geo.borders110); c.setLineDash([3, 3]); c.strokeStyle = '#a3adb7'; c.lineWidth = .6; c.stroke(); c.setLineDash([]);
      c.beginPath(); path({ type: 'Sphere' }); c.strokeStyle = '#6b7680'; c.lineWidth = 1; c.stroke();
    }
    function star(c, x, y, r) {
      c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; c.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)) } c.closePath();
    }
    function draw() {
      drawBase(); proj.scale(R0 * k).translate([w / 2, h / 2]).rotate(rot);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(base, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const t = Date.now(), vis = items.filter(visible);
      for (const it of vis) {
        const [x, y] = proj([it.lon, it.lat]), r = sizeOf(it);
        if (it.kind === 'case') { star(ctx, x, y, Math.max(7, r * .9)); ctx.fillStyle = accent; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); continue }
        const age = t - it.t;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fillStyle = ageColor(age); ctx.globalAlpha = .92; ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(25,30,38,.85)'; ctx.lineWidth = .8; ctx.stroke();
        if (it.shakemap) { ctx.beginPath(); ctx.arc(x, y, r + 2.6, 0, 2 * Math.PI); ctx.strokeStyle = '#1c2128'; ctx.lineWidth = 1.4; ctx.stroke() }
      }
      for (const it of [hovered, selected]) if (it && visible(it)) {
        const [x, y] = proj([it.lon, it.lat]), r = Math.max(7, sizeOf(it)) + 6;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.strokeStyle = it === selected ? accent : 'rgba(28,33,40,.6)'; ctx.lineWidth = it === selected ? 2.4 : 1.4; ctx.stroke();
      }
    }

    function kick() { if (running && !raf) raf = requestAnimationFrame(frame) }
    function frame(now) {
      raf = 0; if (!running) return; const dt = Math.min(64, now - (last || now)); last = now;
      if (fly) { const p = Math.max(0, Math.min(1, (now - fly.t0) / fly.ms)), e = ease(p); rot = [fly.r0[0] + (fly.r1[0] - fly.r0[0]) * e, fly.r0[1] + (fly.r1[1] - fly.r0[1]) * e, 0];
        k = Math.exp(Math.log(fly.k0) + (Math.log(fly.k1) - Math.log(fly.k0)) * e); if (p >= 1) { const done = fly.done; fly = null; if (done) done() } }
      else if (vel && !drag) { rot[0] += vel[0] * dt; rot[1] = clampLat(rot[1] + vel[1] * dt); vel = [vel[0] * .93, vel[1] * .93]; if (Math.hypot(vel[0], vel[1]) < 0.002) vel = null }
      draw();
      if (fly || (vel && !drag)) kick(); else last = 0;   // keep going only while something is animating
    }
    const clampLat = v => Math.max(-85, Math.min(85, v));
    function touch() { fly = null; kick() }

    function hit(px, py) {
      proj.scale(R0 * k).translate([w / 2, h / 2]).rotate(rot);
      let best = null, bd = Infinity;
      for (const it of items) { if (!visible(it)) continue; const [x, y] = proj([it.lon, it.lat]), d = Math.hypot(x - px, y - py), r = Math.max(8, sizeOf(it) + 4);
        if (d <= r && (d < bd || (it.kind === 'case' && best && best.kind !== 'case'))) { best = it; bd = d } }
      return best;
    }
    const local = ev => { const b = canvas.getBoundingClientRect(); return [ev.clientX - b.left, ev.clientY - b.top] };
    canvas.addEventListener('pointerdown', ev => {
      canvas.setPointerCapture(ev.pointerId); pointers.set(ev.pointerId, local(ev)); touch(); vel = null;
      if (pointers.size === 1) drag = { start: local(ev), lastPt: local(ev), lastT: performance.now(), moved: 0 };
      else if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k }; drag = null }
    });
    canvas.addEventListener('pointermove', ev => {
      const p = local(ev);
      if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, p);
      if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; k = clampK(pinch.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d); touch(); return }
      if (drag) {
        const dx = p[0] - drag.lastPt[0], dy = p[1] - drag.lastPt[1], R = R0 * k, nowT = performance.now();
        drag.moved += Math.abs(dx) + Math.abs(dy);
        if (drag.moved > 4) { const dl = dx / R * DEG, dp = -dy / R * DEG; rot[0] += dl; rot[1] = clampLat(rot[1] + dp);
          const dt = Math.max(1, nowT - drag.lastT); vel = [dl / dt, dp / dt]; canvas.style.cursor = 'grabbing'; if (hovered) { hovered = null; opts.onHover(null) } }
        drag.lastPt = p; drag.lastT = nowT; touch(); return;
      }
      const it = hit(p[0], p[1]);
      if (it !== hovered) { hovered = it; canvas.style.cursor = it ? 'pointer' : 'grab'; kick() }
      opts.onHover(it, p[0], p[1]);
    });
    const up = ev => {
      if (!pointers.has(ev.pointerId)) return; pointers.delete(ev.pointerId);
      if (pinch) { if (pointers.size < 2) pinch = null; return }
      if (drag) { const click = drag.moved <= 4, p = local(ev), recent = performance.now() - drag.lastT < 60; drag = null; canvas.style.cursor = 'grab';
        if (!recent) vel = null;
        if (click) { vel = null; const it = hit(p[0], p[1]); selected = it; opts.onPick(it) } }
      kick();
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', () => { if (hovered && !drag) { hovered = null; opts.onHover(null); kick() } });
    const clampK = v => Math.max(0.75, Math.min(16, v));
    canvas.addEventListener('wheel', ev => {
      ev.preventDefault(); touch(); const p = local(ev);
      proj.scale(R0 * k).translate([w / 2, h / 2]).rotate(rot); const before = proj.invert(p);
      k = clampK(k * Math.exp(-ev.deltaY * (ev.deltaMode ? 0.05 : 0.0015)));
      proj.scale(R0 * k); const after = proj.invert(p);
      // keep the point under the cursor roughly in place while zooming
      if (before && after && d3.geoDistance(before, center()) < 1.4) { rot[0] += after[0] - before[0]; rot[1] = clampLat(rot[1] + after[1] - before[1]) }
    }, { passive: false });
    canvas.addEventListener('keydown', ev => {
      const step = 8 / k, keys = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (keys[ev.key]) { ev.preventDefault(); touch(); rot[0] += keys[ev.key][0]; rot[1] = clampLat(rot[1] + keys[ev.key][1]) }
      else if (ev.key === '+' || ev.key === '=') { touch(); k = clampK(k * 1.4) } else if (ev.key === '-') { touch(); k = clampK(k / 1.4) }
    });

    function flyTo(lon, lat, kTo = k, ms = 1100, done) {
      let l = -lon; while (l - rot[0] > 180) l -= 360; while (l - rot[0] < -180) l += 360;
      vel = null; fly = { t0: performance.now(), ms, r0: rot.slice(), r1: [l, clampLat(-lat), 0], k0: k, k1: clampK(kTo), done }; kick();
    }
    resize(); canvas.style.cursor = 'grab';
    return {
      resize, flyTo,
      setItems(list) { items = list.slice().sort((a, b) => (a.kind === 'case') - (b.kind === 'case') || a.M - b.M);
        if (selected) selected = items.find(i => i.id === selected.id) || null; if (hovered) hovered = items.find(i => i.id === hovered.id) || null; kick() },
      select(id) { selected = items.find(i => i.id === id) || null; kick(); return selected },
      zoomBy(f) { touch(); fly = { t0: performance.now(), ms: 300, r0: rot.slice(), r1: rot.slice(), k0: k, k1: clampK(k * f) } },
      get zoom() { return k },
      start() { if (running) return; running = true; last = 0; baseKey = ''; kick() },
      stop() { running = false; cancelAnimationFrame(raf); raf = 0 },
    };
  }
  return { create, ageColor, radius };
})();

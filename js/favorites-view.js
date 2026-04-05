(function () {
  let activeState = null;

  function clear(fullscreenCopy, fullscreenContent, fullscreenInner) {
    if (activeState) {
      activeState.destroy();
      activeState = null;
    }
    if (fullscreenContent) {
      fullscreenContent.innerHTML = "";
    }
    if (fullscreenCopy) {
      fullscreenCopy.textContent = "";
      fullscreenCopy.style.display = "none";
    }
    if (fullscreenInner) {
      fullscreenInner.classList.remove("favorites-fullscreen");
    }
  }

  function render(project, fullscreenCopy, fullscreenContent, fullscreenInner) {
    clear(fullscreenCopy, fullscreenContent, fullscreenInner);
    if (!fullscreenContent) return;

    if (fullscreenInner) {
      fullscreenInner.classList.add("favorites-fullscreen");
    }

    const room = document.createElement("div");
    room.className = "favorites-room";

    const hint = document.createElement("p");
    hint.className = "favorites-hint";
    hint.textContent = "Drag the logos around. Click one to open details.";

    const popup = document.createElement("div");
    popup.className = "favorites-popup";
    popup.setAttribute("aria-hidden", "true");
    popup.innerHTML = `
      <button class="favorites-popup-close" type="button" aria-label="Close">×</button>
      <h3 class="favorites-popup-title"></h3>
      <p class="favorites-popup-copy"></p>
    `;

    room.appendChild(popup);
    room.appendChild(hint);
    fullscreenContent.appendChild(room);

    const items = Array.isArray(project.favoritesItems) ? project.favoritesItems : [];
    activeState = initPhysicsRoom(room, popup, items);
  }

  function initPhysicsRoom(room, popup, itemConfig) {
    const roomRect = { width: 1, height: 1 };
    const wheelObstacle = { active: false, x: 0, y: 0, r: 0 };
    const cornerObstacle = { active: false, x: 0, y: 0, r: 0 };
    const gravity = 1900;
    const bounce = 0.7;
    const obstacleBounce = 0.62;
    const floorFriction = 0.985;
    const airDrag = 0.998;
    const popThresholdPx = 6;
    const defaultSize = 96;
    const BINS = 360; // one bin per degree — enough for any shape

    const closeButton = popup.querySelector(".favorites-popup-close");
    const popupTitle = popup.querySelector(".favorites-popup-title");
    const popupCopy = popup.querySelector(".favorites-popup-copy");

    // Scan the image pixels and return a Float32Array of length BINS where
    // each entry is the distance (in display pixels, from the image centre)
    // to the furthest opaque pixel in that angular direction.
    // Returns null if the image isn't ready or has no opaque pixels.
    function buildExtentProfile(imgEl, displayWidth, displayHeight) {
      if (!imgEl || !imgEl.naturalWidth || !imgEl.naturalHeight) return null;
      try {
        // Render at display size so 1 canvas px == 1 display px, meaning
        // the measured distances need no scaling at all.
        const cw = Math.round(displayWidth);
        const ch = Math.round(displayHeight);
        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return null;
        ctx.clearRect(0, 0, cw, ch);
        ctx.drawImage(imgEl, 0, 0, cw, ch);

        const pixels = ctx.getImageData(0, 0, cw, ch).data;
        const cx = cw / 2;
        const cy = ch / 2;
        const extents = new Float32Array(BINS); // all zero initially
        const ALPHA_THRESHOLD = 10;

        for (let y = 0; y < ch; y++) {
          for (let x = 0; x < cw; x++) {
            const alpha = pixels[(y * cw + x) * 4 + 3];
            if (alpha < ALPHA_THRESHOLD) continue;

            const dx = x + 0.5 - cx;
            const dy = y + 0.5 - cy;
            const dist = Math.hypot(dx, dy);
            if (dist < 0.5) continue;

            // Map angle to a bin index [0, BINS)
            const angle = Math.atan2(dy, dx); // -PI..PI
            const bin = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * BINS) % BINS;
            if (dist > extents[bin]) extents[bin] = dist;
          }
        }

        // Fill any empty bins by interpolating between the nearest non-zero
        // neighbours on each side. This handles concavities and thin features.
        // Two-pass: first collect which bins have data.
        const hasData = new Uint8Array(BINS);
        for (let i = 0; i < BINS; i++) if (extents[i] > 0) hasData[i] = 1;

        for (let i = 0; i < BINS; i++) {
          if (hasData[i]) continue;
          let li = -1, ri = -1;
          for (let s = 1; s < BINS; s++) {
            if (li < 0 && hasData[(i - s + BINS) % BINS]) li = s;
            if (ri < 0 && hasData[(i + s) % BINS]) ri = s;
            if (li >= 0 && ri >= 0) break;
          }
          const lv = li >= 0 ? extents[(i - li + BINS) % BINS] : 0;
          const rv = ri >= 0 ? extents[(i + ri) % BINS] : 0;
          if (li >= 0 && ri >= 0) {
            extents[i] = lv + (rv - lv) * (li / (li + ri));
          } else {
            extents[i] = lv || rv || Math.min(cw, ch) * 0.4;
          }
        }

        return extents;
      } catch (e) {
        return null;
      }
    }

    // Given a body with an extent profile and its current rotation angle,
    // return how far it extends along world-space normal (nx, ny).
    function extentAlongNormal(body, nx, ny) {
      if (!body.extents) {
        // Fallback: axis-aligned box projection
        return Math.abs(nx) * body.hw + Math.abs(ny) * body.hh;
      }
      // Rotate the world normal into the body's local (unrotated) space
      const rad = -(body.angle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const lx = nx * cos - ny * sin;
      const ly = nx * sin + ny * cos;
      const angle = Math.atan2(ly, lx);
      const fbin = ((angle + Math.PI) / (Math.PI * 2)) * BINS;
      const i0 = Math.floor(fbin) % BINS;
      const i1 = (i0 + 1) % BINS;
      const t = fbin - Math.floor(fbin);
      return body.extents[i0] * (1 - t) + body.extents[i1] * t;
    }

    const bodies = itemConfig.map((item, idx) => {
      const node = document.createElement("button");
      node.className = `favorites-item${item.isLogo ? " favorites-item-logo" : ""}`;
      node.type = "button";
      node.ariaLabel = item.title || `Favorite ${idx + 1}`;
      node.innerHTML = `<img src="${item.image}" alt="${item.title || `Favorite ${idx + 1}`}" />`;
      const itemWidth = Math.max(56, Number(item.width) || defaultSize);
      const itemHeight = Math.max(56, Number(item.height) || defaultSize);
      node.style.width = `${itemWidth}px`;
      node.style.height = `${itemHeight}px`;
      room.appendChild(node);

      const body = {
        id: idx,
        x: itemWidth / 2 + Math.random() * 40 + idx * (defaultSize * 0.38),
        y: -Math.random() * 220 - idx * 30,
        vx: (Math.random() - 0.5) * 140,
        vy: Math.random() * 40,
        hw: itemWidth / 2,
        hh: itemHeight / 2,
        // r is used only as a cheap broadphase pre-check before the exact profile lookup
        r: Math.min(itemWidth, itemHeight) * 0.5,
        extents: null, // filled once the image loads
        angle: 0,
        spin: (Math.random() - 0.5) * 2.2,
        node,
        data: item,
      };

      const imgEl = node.querySelector("img");
      const prime = () => {
        const profile = buildExtentProfile(imgEl, itemWidth, itemHeight);
        if (profile) body.extents = profile;
      };
      if (imgEl && imgEl.complete && imgEl.naturalWidth) {
        prime();
      } else if (imgEl) {
        imgEl.addEventListener("load", prime, { once: true });
      }

      return body;
    });

    let didSeedPositions = false;
    let rafId = 0;
    let lastTs = 0;
    let draggedBody = null;
    let dragPointerId = null;
    let dragMoved = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let dragSamplePrev = null;
    let dragSampleCurr = null;

    function updateBounds() {
      roomRect.width = Math.max(1, room.clientWidth || 1);
      roomRect.height = Math.max(1, room.clientHeight || 1);
      updateWheelObstacle();
      if (!didSeedPositions && roomRect.width > 8 && roomRect.height > 8) {
        didSeedPositions = true;
        bodies.forEach((body) => {
          const minX = body.hw;
          const maxX = Math.max(minX, roomRect.width - body.hw);
          const minY = body.hh;
          const maxY = Math.max(minY, roomRect.height - body.hh);
          body.x = minX + Math.random() * (maxX - minX);
          body.y = minY + Math.random() * (maxY - minY);
          body.vx = (Math.random() - 0.5) * 1100;
          body.vy = -(260 + Math.random() * 820);
          if (!body.isLogo) {
            body.spin = (Math.random() - 0.5) * 7.5;
          }
        });
      }
    }

    function updateWheelObstacle() {
      const wheel = document.getElementById("wheel");
      if (!wheel) { wheelObstacle.active = false; return; }
      const roomBox = room.getBoundingClientRect();
      const wheelBox = wheel.getBoundingClientRect();
      if (!roomBox.width || !roomBox.height || !wheelBox.width || !wheelBox.height) {
        wheelObstacle.active = false; return;
      }
      const sx = roomRect.width / roomBox.width;
      const sy = roomRect.height / roomBox.height;
      const x = (wheelBox.left + wheelBox.width / 2 - roomBox.left) * sx;
      const y = (wheelBox.top + wheelBox.height / 2 - roomBox.top) * sy;
      const r = Math.max(24, Math.min(wheelBox.width * sx, wheelBox.height * sy) / 2 - 4);
      if (x + r < 0 || x - r > roomRect.width || y + r < 0 || y - r > roomRect.height) {
        wheelObstacle.active = false; cornerObstacle.active = false; return;
      }
      wheelObstacle.active = true;
      wheelObstacle.x = x; wheelObstacle.y = y; wheelObstacle.r = r;
      const cornerX = roomRect.width, cornerY = roomRect.height;
      const d = Math.hypot(cornerX - x, cornerY - y);
      const cornerR = Math.max(0, d - r);
      cornerObstacle.active = cornerR > 12;
      cornerObstacle.x = cornerX; cornerObstacle.y = cornerY; cornerObstacle.r = cornerR;
    }

    function pointerToRoom(clientX, clientY) {
      const rect = room.getBoundingClientRect();
      const sx = rect.width > 0 ? roomRect.width / rect.width : 1;
      const sy = rect.height > 0 ? roomRect.height / rect.height : 1;
      return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
    }

    function positionPopupForBody(body) {
      const style = window.getComputedStyle(popup);
      const popupWidth = Math.max(120, parseFloat(style.width) || popup.offsetWidth || 230);
      const popupHeight = Math.max(70, popup.offsetHeight || 110);
      let x = Math.max(12, Math.min(roomRect.width - popupWidth - 12, body.x - popupWidth / 2));
      let y = body.y - body.r - popupHeight - 10;
      if (y < 12) y = Math.min(roomRect.height - popupHeight - 12, body.y + body.r + 10);
      popup.style.left = `${x}px`;
      popup.style.top = `${y}px`;
    }

    function openPopup(body) {
      popupTitle.textContent = body.data.title || "Favorite";
      popupCopy.textContent = body.data.description || "Add your own description.";
      positionPopupForBody(body);
      popup.setAttribute("aria-hidden", "false");
    }

    function closePopup() {
      popup.setAttribute("aria-hidden", "true");
    }

    function applyBounds(body) {
      // Use hw/hh for wall bounds so the element box doesn't clip the wall
      if (body.x - body.hw < 0) { body.x = body.hw; body.vx = Math.abs(body.vx) * bounce; }
      else if (body.x + body.hw > roomRect.width) { body.x = roomRect.width - body.hw; body.vx = -Math.abs(body.vx) * bounce; }
      if (body.y - body.hh < 0) { body.y = body.hh; body.vy = Math.abs(body.vy) * bounce; }
      else if (body.y + body.hh > roomRect.height) {
        body.y = roomRect.height - body.hh;
        body.vy = -Math.abs(body.vy) * bounce;
        body.vx *= floorFriction;
        body.spin *= floorFriction;
      }
    }

    function applyCircleObstacle(body, obs) {
      if (!obs.active) return;
      const dx = body.x - obs.x;
      const dy = body.y - obs.y;
      const dist = Math.hypot(dx, dy);
      const nx = dist > 1e-6 ? dx / dist : 0;
      const ny = dist > 1e-6 ? dy / dist : -1;
      const minDist = obs.r + extentAlongNormal(body, nx, ny);
      if (dist >= minDist) return;
      body.x = obs.x + nx * minDist;
      body.y = obs.y + ny * minDist;
      const vel = body.vx * nx + body.vy * ny;
      if (vel < 0) {
        body.vx -= (1 + obstacleBounce) * vel * nx;
        body.vy -= (1 + obstacleBounce) * vel * ny;
      }
      body.vx *= 0.995; body.vy *= 0.995;
    }

    function clampToObstacle(x, y, body, obs) {
      if (!obs.active) return { x, y };
      const dx = x - obs.x, dy = y - obs.y;
      const dist = Math.hypot(dx, dy);
      const nx = dist > 1e-6 ? dx / dist : -1;
      const ny = dist > 1e-6 ? dy / dist : 0;
      const minDist = obs.r + extentAlongNormal(body, nx, ny);
      if (dist >= minDist) return { x, y };
      return { x: obs.x + nx * minDist, y: obs.y + ny * minDist };
    }

    function getDraggedClampedPosition(body, targetX, targetY) {
      let x = Math.max(body.hw, Math.min(roomRect.width - body.hw, targetX));
      let y = Math.max(body.hh, Math.min(roomRect.height - body.hh, targetY));
      for (let i = 0; i < 2; i++) {
        ({ x, y } = clampToObstacle(x, y, body, wheelObstacle));
        ({ x, y } = clampToObstacle(x, y, body, cornerObstacle));
        x = Math.max(body.hw, Math.min(roomRect.width - body.hw, x));
        y = Math.max(body.hh, Math.min(roomRect.height - body.hh, y));
      }
      return { x, y };
    }

    function resolveBodyCollisions() {
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i], b = bodies[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);

          // Broadphase: skip if centres are further apart than both bounding circles combined
          if (dist > a.r + b.r) continue;

          const nx = dist > 1e-6 ? dx / dist : 1;
          const ny = dist > 1e-6 ? dy / dist : 0;

          // Exact separation using per-shape extent profiles
          const minDist = extentAlongNormal(a, nx, ny) + extentAlongNormal(b, -nx, -ny);
          if (dist >= minDist) continue;

          const overlap = (minDist - dist) * 0.5;
          a.x -= nx * overlap; a.y -= ny * overlap;
          b.x += nx * overlap; b.y += ny * overlap;

          const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
          const velAlongNormal = rvx * nx + rvy * ny;
          if (velAlongNormal > 0) continue;
          const impulse = -(1 + 0.74) * velAlongNormal * 0.5;
          a.vx -= impulse * nx; a.vy -= impulse * ny;
          b.vx += impulse * nx; b.vy += impulse * ny;
        }
      }
    }

    function step(ts) {
      updateBounds();
      if (!lastTs) lastTs = ts;
      const dt = Math.min(0.04, (ts - lastTs) / 1000);
      lastTs = ts;

      for (const body of bodies) {
        if (draggedBody !== body) {
          body.vy += gravity * dt;
          body.vx *= airDrag;
          body.vy *= airDrag;
          body.x += body.vx * dt;
          body.y += body.vy * dt;
          body.angle += body.spin * dt * 50;
        }
        applyBounds(body);
        applyCircleObstacle(body, wheelObstacle);
        applyCircleObstacle(body, cornerObstacle);
      }

      resolveBodyCollisions();

      for (const body of bodies) {
        applyBounds(body);
        applyCircleObstacle(body, wheelObstacle);
        applyCircleObstacle(body, cornerObstacle);
      }

      for (const body of bodies) {
        body.node.style.transform = `translate(${body.x - body.hw}px, ${body.y - body.hh}px) rotate(${body.angle.toFixed(2)}deg)`;
      }

      rafId = requestAnimationFrame(step);
    }

    function bodyFromTarget(target) {
      const button = target.closest(".favorites-item");
      if (!button) return null;
      return bodies.find((b) => b.node === button) || null;
    }

    function pointerDown(event) {
      const body = bodyFromTarget(event.target);
      if (!body) return;
      draggedBody = body;
      dragPointerId = event.pointerId;
      dragMoved = false;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      const point = pointerToRoom(event.clientX, event.clientY);
      dragOffsetX = point.x - body.x;
      dragOffsetY = point.y - body.y;
      const now = performance.now();
      dragSamplePrev = { x: point.x, y: point.y, ts: now };
      dragSampleCurr = { x: point.x, y: point.y, ts: now };
      body.vx = 0; body.vy = 0; body.spin = 0;
      body.node.setPointerCapture(event.pointerId);
      closePopup();
    }

    function pointerMove(event) {
      if (!draggedBody || event.pointerId !== dragPointerId) return;
      const point = pointerToRoom(event.clientX, event.clientY);
      const clamped = getDraggedClampedPosition(draggedBody, point.x - dragOffsetX, point.y - dragOffsetY);
      draggedBody.x = clamped.x;
      draggedBody.y = clamped.y;
      draggedBody.vx = 0; draggedBody.vy = 0; draggedBody.spin = 0;
      dragSamplePrev = dragSampleCurr;
      dragSampleCurr = { x: point.x, y: point.y, ts: performance.now() };
      if (Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY) > popThresholdPx) dragMoved = true;
    }

    function releasePointer(event) {
      if (!draggedBody || event.pointerId !== dragPointerId) return;
      const body = draggedBody;
      try { body.node.releasePointerCapture(event.pointerId); } catch (_) {}
      draggedBody = null;
      dragPointerId = null;
      if (dragMoved && dragSamplePrev && dragSampleCurr) {
        const dt = Math.max(0.001, (dragSampleCurr.ts - dragSamplePrev.ts) / 1000);
        const vx = ((dragSampleCurr.x - dragSamplePrev.x) / dt) * 1.1;
        const vy = ((dragSampleCurr.y - dragSamplePrev.y) / dt) * 1.1;
        body.vx = Math.max(-1500, Math.min(1500, vx));
        body.vy = Math.max(-1500, Math.min(1500, vy));
        body.spin = Math.max(-8, Math.min(8, body.vx / 220));
      } else {
        body.spin = (Math.random() - 0.5) * 2.2;
      }
      dragSamplePrev = null;
      dragSampleCurr = null;
      if (!dragMoved) openPopup(body);
    }

    function onRoomClick(event) {
      if (!event.target.closest(".favorites-item")) closePopup();
    }

    function onEscape(event) {
      if (event.key === "Escape") closePopup();
    }

    room.addEventListener("pointerdown", pointerDown);
    room.addEventListener("pointermove", pointerMove);
    room.addEventListener("pointerup", releasePointer);
    room.addEventListener("pointercancel", releasePointer);
    room.addEventListener("click", onRoomClick);
    closeButton.addEventListener("click", closePopup);
    window.addEventListener("resize", updateBounds);
    window.addEventListener("keydown", onEscape);

    updateBounds();
    rafId = requestAnimationFrame(step);

    return {
      destroy() {
        cancelAnimationFrame(rafId);
        room.removeEventListener("pointerdown", pointerDown);
        room.removeEventListener("pointermove", pointerMove);
        room.removeEventListener("pointerup", releasePointer);
        room.removeEventListener("pointercancel", releasePointer);
        room.removeEventListener("click", onRoomClick);
        closeButton.removeEventListener("click", closePopup);
        window.removeEventListener("resize", updateBounds);
        window.removeEventListener("keydown", onEscape);
      },
    };
  }

  window.FavoritesView = { clear, render };
})();
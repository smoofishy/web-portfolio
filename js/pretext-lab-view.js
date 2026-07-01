(function () {
  let p5Instance = null;
  let activeAbortController = null;
  const LOREM_TEXT = `
    Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque faucibus ex sapien vitae pellentesque sem placerat. In id cursus mi pretium tellus duis convallis. Tempus leo eu aenean sed diam urna tempor. Pulvinar vivamus fringilla lacus nec metus bibendum egestas. Iaculis massa nisl malesuada lacinia integer nunc posuere. Ut hendrerit semper vel class aptent taciti sociosqu. Ad litora torquent per conubia nostra inceptos himenaeos.
  `.replace(/\s+/g, " ").trim();

  function getFullscreenCard() {
    return document.getElementById("fullscreenCard");
  }

  function clear(fullscreenCopy, fullscreenContent, fullscreenInner) {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    if (p5Instance) {
      try {
        p5Instance.remove();
      } catch (error) {
        /* noop */
      }
      p5Instance = null;
    }
    if (fullscreenContent) {
      fullscreenContent.innerHTML = "";
    }
    if (fullscreenCopy) {
      fullscreenCopy.textContent = "";
      fullscreenCopy.style.display = "none";
    }
    if (fullscreenInner) {
      fullscreenInner.classList.remove("pretext-fullscreen");
    }
    const fullscreenCard = getFullscreenCard();
    if (fullscreenCard) {
      fullscreenCard.classList.remove("pretext-overlay");
    }
  }

  function makeWrappedLines(pretextModule, text, width, fontSpec, lineHeightPx) {
    if (
      pretextModule &&
      typeof pretextModule.prepareWithSegments === "function" &&
      typeof pretextModule.layoutWithLines === "function"
    ) {
      const prepared = pretextModule.prepareWithSegments(text, fontSpec);
      const laidOut = pretextModule.layoutWithLines(prepared, width, lineHeightPx);
      if (laidOut && Array.isArray(laidOut.lines) && laidOut.lines.length) {
        return laidOut.lines.map((line) => line.text).filter(Boolean);
      }
    }
    const roughWords = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";
    roughWords.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > 38 && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    });
    if (current) lines.push(current);
    return lines;
  }

  async function render(project, fullscreenCopy, fullscreenContent, fullscreenInner) {
    clear(fullscreenCopy, fullscreenContent, fullscreenInner);
    if (!fullscreenContent || !fullscreenInner) return;

    fullscreenInner.classList.add("pretext-fullscreen");
    fullscreenCopy.textContent = "";
    fullscreenCopy.style.display = "none";
    const fullscreenCard = getFullscreenCard();
    if (fullscreenCard) {
      fullscreenCard.classList.add("pretext-overlay");
    }

    const room = document.createElement("div");
    room.className = "pretext-lab-room";
    fullscreenContent.appendChild(room);

    const runController = new AbortController();
    activeAbortController = runController;

    let pretextModule = null;
    try {
      const moduleUrl = new URL("node_modules/@chenglou/pretext/dist/layout.js", window.location.href).href;
      pretextModule = await import(moduleUrl);
    } catch (error) {
      pretextModule = null;
    }
    if (runController.signal.aborted) return;

    const sourceText = LOREM_TEXT;
    const fontSpec = "500 16px Inter, Helvetica, Arial, sans-serif";
    const lineHeightPx = 24;
    const longBookText = Array.from({ length: 22 }, () => sourceText).join(" ");
    const getBookLines = (widthPx) =>
      makeWrappedLines(pretextModule, longBookText, Math.max(280, widthPx), fontSpec, lineHeightPx);

    const sketch = (p) => {
      const anchoredWords = [];
      const hole = { x: 0, y: 0, tx: 0, ty: 0, radius: 24, repulsion: 520000, forcefieldRadius: 132 };
      const wheelExclusion = { active: false, x: 0, y: 0, r: 0 };
      let pageLayer = null;
      let bookLines = [];

      function renderBookBackground() {
        if (!pageLayer) return;
        pageLayer.clear();
        pageLayer.background(244, 236, 220);
      }

      function rebuildAnchoredWords() {
        anchoredWords.length = 0;
        if (!pageLayer) return;
        pageLayer.textFont("Georgia, Times New Roman, serif");
        pageLayer.textSize(16);
        pageLayer.textAlign(p.LEFT, p.TOP);
        const gutter = Math.max(44, Math.floor(pageLayer.width * 0.06));
        const columnGap = Math.max(34, Math.floor(pageLayer.width * 0.05));
        const columnWidth = Math.max(180, Math.floor((pageLayer.width - gutter * 2 - columnGap) / 2));
        const lineStep = 24;
        const top = 38;
        const maxRows = Math.floor((pageLayer.height - top * 2) / lineStep);
        bookLines = getBookLines(columnWidth);
        let lineCursor = 0;

        for (let col = 0; col < 2; col++) {
          const x = gutter + col * (columnWidth + columnGap);
          for (let row = 0; row < maxRows; row++) {
            if (!bookLines.length) break;
            const line = bookLines[lineCursor % bookLines.length];
            const words = line.split(/\s+/).filter(Boolean);
            let cursorX = x;
            const y = top + row * lineStep;
            for (let wi = 0; wi < words.length; wi++) {
              const word = words[wi];
              const token = wi === words.length - 1 ? word : `${word} `;
              const tokenW = pageLayer.textWidth(token);
              if (cursorX + tokenW > x + columnWidth) break;
              const wordX = cursorX + tokenW * 0.45;
              const wordY = y + 10;
              if (isInsideWheelExclusion(wordX, wordY, 8)) {
                cursorX += tokenW;
                continue;
              }
              anchoredWords.push({
                text: word,
                x: wordX,
                y: wordY,
                baseX: wordX,
                baseY: wordY,
                vx: 0,
                vy: 0,
                mass: Math.max(0.9, Math.min(2.6, 0.7 + word.length * 0.08)),
                alpha: 122,
              });
              cursorX += tokenW;
            }
            lineCursor += 1;
          }
        }
      }

      function updateWheelExclusion() {
        const wheel = document.getElementById("wheel");
        if (!wheel) {
          wheelExclusion.active = false;
          return;
        }
        const roomRect = room.getBoundingClientRect();
        const wheelRect = wheel.getBoundingClientRect();
        if (!roomRect.width || !roomRect.height || !wheelRect.width || !wheelRect.height) {
          wheelExclusion.active = false;
          return;
        }
        const sx = p.width / roomRect.width;
        const sy = p.height / roomRect.height;
        const x = (wheelRect.left + wheelRect.width * 0.5 - roomRect.left) * sx;
        const y = (wheelRect.top + wheelRect.height * 0.5 - roomRect.top) * sy;
        const r = Math.max(40, Math.min(wheelRect.width * sx, wheelRect.height * sy) * 0.5 + 18);
        if (x + r < 0 || x - r > p.width || y + r < 0 || y - r > p.height) {
          wheelExclusion.active = false;
          return;
        }
        wheelExclusion.active = true;
        wheelExclusion.x = x;
        wheelExclusion.y = y;
        wheelExclusion.r = r;
      }

      function isInsideWheelExclusion(x, y, extra = 0) {
        if (!wheelExclusion.active) return false;
        return Math.hypot(x - wheelExclusion.x, y - wheelExclusion.y) < wheelExclusion.r + extra;
      }

      function keepWordOutOfWheel(body) {
        if (!wheelExclusion.active) return;
        const dx = body.x - wheelExclusion.x;
        const dy = body.y - wheelExclusion.y;
        const dist = Math.hypot(dx, dy);
        const minDist = wheelExclusion.r + 6;
        if (dist >= minDist) return;
        const nx = dist > 1e-6 ? dx / dist : -1;
        const ny = dist > 1e-6 ? dy / dist : 0;
        body.x = wheelExclusion.x + nx * minDist;
        body.y = wheelExclusion.y + ny * minDist;
        const vDot = body.vx * nx + body.vy * ny;
        if (vDot < 0) {
          body.vx -= 1.3 * vDot * nx;
          body.vy -= 1.3 * vDot * ny;
        }
      }

      function keepWordOutOfForcefield(body) {
        const dx = body.x - hole.x;
        const dy = body.y - hole.y;
        const dist = Math.hypot(dx, dy);
        const innerRadius = hole.radius * 2.15;
        if (dist >= innerRadius) return;
        const nx = dist > 1e-6 ? dx / dist : 1;
        const ny = dist > 1e-6 ? dy / dist : 0;
        body.x = hole.x + nx * innerRadius;
        body.y = hole.y + ny * innerRadius;
        const vDot = body.vx * nx + body.vy * ny;
        if (vDot < 0) {
          body.vx -= 1.45 * vDot * nx;
          body.vy -= 1.45 * vDot * ny;
        }
      }

      function setCursorTarget(x, y) {
        hole.tx = x;
        hole.ty = y;
      }

      let syncCanvasSize = null;

      p.setup = () => {
        syncCanvasSize = () => {
          const targetW = Math.max(1, Math.floor(window.innerWidth || room.clientWidth || 1));
          const targetH = Math.max(1, Math.floor(window.innerHeight || room.clientHeight || 1));
          if (p.width !== targetW || p.height !== targetH) {
            p.resizeCanvas(targetW, targetH, false);
            pageLayer = p.createGraphics(targetW, targetH);
            updateWheelExclusion();
            renderBookBackground();
            rebuildAnchoredWords();
          }
        };

        p.pixelDensity(1);
        const canvas = p.createCanvas(1, 1);
        canvas.parent(room);
        canvas.style("display", "block");
        p.textAlign(p.CENTER, p.CENTER);
        p.textFont("Inter, Helvetica, Arial, sans-serif");
        p.cursor("none");
        hole.x = window.innerWidth * 0.5;
        hole.y = window.innerHeight * 0.5;
        hole.tx = hole.x;
        hole.ty = hole.y;
        syncCanvasSize();
      };

      p.windowResized = () => {
        if (syncCanvasSize) syncCanvasSize();
      };

      p.mouseMoved = () => setCursorTarget(p.mouseX, p.mouseY);
      p.mouseDragged = () => setCursorTarget(p.mouseX, p.mouseY);
      p.touchMoved = () => {
        if (p.touches && p.touches.length) {
          setCursorTarget(p.touches[0].x, p.touches[0].y);
        }
        return false;
      };

      p.draw = () => {
        if (syncCanvasSize) syncCanvasSize();
        const nowMs = p.millis();
        updateWheelExclusion();
        p.background(244, 236, 220, 255);
        if (pageLayer) {
          p.image(pageLayer, 0, 0, p.width, p.height);
        }

        hole.x += (hole.tx - hole.x) * 0.2;
        hole.y += (hole.ty - hole.y) * 0.2;

        p.noStroke();
        p.textFont("Georgia, Times New Roman, serif");
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(16);

        for (let i = 0; i < anchoredWords.length; i++) {
          const body = anchoredWords[i];

          const dx = hole.x - body.x;
          const dy = hole.y - body.y;
          const d2 = dx * dx + dy * dy;
          const d = Math.max(1, Math.sqrt(d2));
          const nx = dx / d;
          const ny = dy / d;

          if (d < hole.forcefieldRadius) {
            const proximity = 1 - d / hole.forcefieldRadius;
            const repulsionForce = (hole.repulsion * proximity * proximity) / Math.max(1200, d2);
            body.vx -= (nx * repulsionForce) / body.mass;
            body.vy -= (ny * repulsionForce) / body.mass;
          }

          const returnSpring = d < hole.forcefieldRadius ? 0.006 : 0.014;
          body.vx += (body.baseX - body.x) * returnSpring;
          body.vy += (body.baseY - body.y) * returnSpring;
          body.vx *= 0.94;
          body.vy *= 0.94;

          body.x += body.vx;
          body.y += body.vy;
          keepWordOutOfForcefield(body);
          keepWordOutOfWheel(body);

          const tint = Math.max(0, 1 - d / hole.forcefieldRadius) * 0.35;
          p.fill(20 + tint * 40, 18 + tint * 30, 16, Math.min(230, body.alpha + tint * 28));
          p.text(body.text, body.x, body.y);
        }

        const forcefieldPulse = 0.5 + 0.5 * Math.sin(nowMs * 0.0045);
        p.noFill();
        p.stroke(118, 156, 214, 28 + forcefieldPulse * 34);
        p.strokeWeight(2.6);
        p.circle(hole.x, hole.y, hole.forcefieldRadius * 2);
        p.stroke(92, 132, 198, 52 + forcefieldPulse * 40);
        p.strokeWeight(1.4);
        p.circle(hole.x, hole.y, hole.forcefieldRadius * 1.62);
        p.noStroke();
        p.fill(0, 0, 0, 250);
        p.circle(hole.x, hole.y, hole.radius * 2);
        p.fill(30, 30, 30, 48);
        p.circle(hole.x, hole.y, hole.radius * 3.2);
      };
    };

    p5Instance = new p5(sketch, room);
  }

  function isActive() {
    return Boolean(p5Instance || activeAbortController);
  }

  window.PretextLabView = { clear, render, isActive };
})();

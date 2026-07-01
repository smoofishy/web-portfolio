(function () {
  let p5Instance = null;
  let activeAbortController = null;
  let colorModeQuery = null;
  let colorModeListener = null;

  const CREAM = [245, 240, 225];
  const INK = [8, 8, 8];

  function getThemeColors() {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return dark ? { bg: CREAM, text: INK } : { bg: INK, text: CREAM };
  }

  function bindColorMode(onChange) {
    colorModeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    colorModeListener = () => onChange(getThemeColors());
    colorModeQuery.addEventListener("change", colorModeListener);
    return getThemeColors();
  }

  function unbindColorMode() {
    if (colorModeQuery && colorModeListener) {
      colorModeQuery.removeEventListener("change", colorModeListener);
    }
    colorModeQuery = null;
    colorModeListener = null;
  }

  function getFullscreenCard() {
    return document.getElementById("fullscreenCard");
  }

  function clear(fullscreenCopy, fullscreenContent, fullscreenInner) {
    unbindColorMode();
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
      fullscreenInner.classList.remove("pretext-shapes-fullscreen");
    }
    const fullscreenCard = getFullscreenCard();
    if (fullscreenCard) {
      fullscreenCard.classList.remove("pretext-overlay");
    }
  }

  function vecAdd(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }

  function vecSub(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function vecLen(v) {
    return Math.hypot(v[0], v[1], v[2]);
  }

  function vecLerp(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function rotateX(v, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
  }

  function rotateY(v, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
  }

  function rotateZ(v, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
  }

  function transformPoint(v, rot, offset) {
    let p = v;
    p = rotateX(p, rot.x);
    p = rotateY(p, rot.y);
    p = rotateZ(p, rot.z);
    return vecAdd(p, offset);
  }

  function makeCube(size) {
    const h = size * 0.5;
    const verts = [
      [-h, -h, -h],
      [h, -h, -h],
      [h, h, -h],
      [-h, h, -h],
      [-h, -h, h],
      [h, -h, h],
      [h, h, h],
      [-h, h, h],
    ];
    const edges = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ];
    return { verts, edges };
  }

  function makeCylinder(radius, height, segments) {
    const verts = [];
    const edges = [];
    const halfH = height * 0.5;
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      verts.push([x, -halfH, z], [x, halfH, z]);
    }
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      const botA = i * 2;
      const botB = next * 2;
      const topA = botA + 1;
      const topB = botB + 1;
      edges.push([topA, topB], [botA, botB], [botA, topA]);
    }
    return { verts, edges };
  }

  function makeTriball(size) {
    const s = size * 0.58;
    const verts = [
      [s, s, s],
      [s, -s, -s],
      [-s, s, -s],
      [-s, -s, s],
    ];
    const edges = [
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 2],
      [1, 3],
      [2, 3],
    ];
    return { verts, edges };
  }

  function projectPoint(v, cx, cy, focal) {
    const depth = focal + v[2];
    const perspective = focal / Math.max(40, depth);
    return {
      x: cx + v[0] * perspective,
      y: cy + v[1] * perspective,
      z: v[2],
    };
  }

  async function render(project, fullscreenCopy, fullscreenContent, fullscreenInner) {
    clear(fullscreenCopy, fullscreenContent, fullscreenInner);
    if (!fullscreenContent || !fullscreenInner) return;

    fullscreenInner.classList.add("pretext-shapes-fullscreen");
    fullscreenCopy.textContent = "";
    fullscreenCopy.style.display = "none";
    const fullscreenCard = getFullscreenCard();
    if (fullscreenCard) {
      fullscreenCard.classList.add("pretext-overlay");
    }

    const room = document.createElement("div");
    room.className = "pretext-shapes-room";
    fullscreenContent.appendChild(room);

    const runController = new AbortController();
    activeAbortController = runController;

    try {
      await window.ensureP5();
    } catch (error) {
      return;
    }
    if (runController.signal.aborted) return;

    let theme = bindColorMode((nextTheme) => {
      theme = nextTheme;
      room.style.backgroundColor = `rgb(${nextTheme.bg.join(",")})`;
    });
    room.style.backgroundColor = `rgb(${theme.bg.join(",")})`;

    const sketch = (p) => {
      const shapeDefs = [
        {
          name: "square",
          build: (scale) => makeCube(88 * scale),
          offset: [-1.05, 0, 0],
          spin: { x: 0.012, y: 0.018, z: 0.007 },
        },
        {
          name: "cylinder",
          build: (scale) => makeCylinder(46 * scale, 98 * scale, 22),
          offset: [0, 0, 0],
          spin: { x: 0.015, y: 0.011, z: 0.009 },
        },
        {
          name: "triball",
          build: (scale) => makeTriball(96 * scale),
          offset: [1.05, 0, 0],
          spin: { x: 0.013, y: 0.016, z: 0.012 },
        },
      ];
      const rotations = shapeDefs.map(() => ({ x: 0, y: 0, z: 0 }));

      function layoutScale() {
        return Math.max(0.72, Math.min(p.width, p.height) / 760);
      }

      function collectDrawables(scale) {
        const cx = p.width * 0.5;
        const cy = p.height * 0.52;
        const focal = Math.max(420, Math.min(p.width, p.height) * 1.05);
        const spacing = Math.min(p.width * 0.28, 220 * scale);
        const drawables = [];

        shapeDefs.forEach((shapeDef, shapeIndex) => {
          const geom = shapeDef.build(scale);
          const offset = [
            shapeDef.offset[0] * spacing,
            shapeDef.offset[1] * spacing,
            shapeDef.offset[2] * spacing,
          ];
          const rot = rotations[shapeIndex];
          const worldVerts = geom.verts.map((v) => transformPoint(v, rot, offset));

          geom.edges.forEach(([aIndex, bIndex]) => {
            const a3 = worldVerts[aIndex];
            const b3 = worldVerts[bIndex];
            const a2 = projectPoint(a3, cx, cy, focal);
            const b2 = projectPoint(b3, cx, cy, focal);
            drawables.push({
              label: shapeDef.name,
              a3,
              b3,
              a2,
              b2,
              depth: (a2.z + b2.z) * 0.5,
            });
          });
        });

        drawables.sort((left, right) => left.depth - right.depth);
        return drawables;
      }

      function drawTextEdge(drawable, fontSize, colors) {
        const edgeVecX = drawable.b2.x - drawable.a2.x;
        const edgeVecY = drawable.b2.y - drawable.a2.y;
        const edgeLen = Math.hypot(edgeVecX, edgeVecY);
        if (edgeLen < 8) return;

        const charW = fontSize * 0.58;
        const count = Math.max(2, Math.floor(edgeLen / charW));
        const label = drawable.label.repeat(count + 1);

        for (let i = 0; i < count; i++) {
          const t = (i + 0.5) / count;
          const tNext = Math.min(1, t + 1 / count);
          const pos = {
            x: drawable.a2.x + edgeVecX * t,
            y: drawable.a2.y + edgeVecY * t,
          };
          const posNext = {
            x: drawable.a2.x + edgeVecX * tNext,
            y: drawable.a2.y + edgeVecY * tNext,
          };
          const angle = Math.atan2(posNext.y - pos.y, posNext.x - pos.x);
          const ch = label[i % label.length];

          p.push();
          p.translate(pos.x, pos.y);
          p.rotate(angle);
          p.noStroke();
          p.fill(colors.text[0], colors.text[1], colors.text[2]);
          p.text(ch, 0, 0);
          p.pop();
        }
      }

      let syncCanvasSize = null;

      p.setup = () => {
        syncCanvasSize = () => {
          const targetW = Math.max(1, Math.floor(window.innerWidth || room.clientWidth || 1));
          const targetH = Math.max(1, Math.floor(window.innerHeight || room.clientHeight || 1));
          if (p.width !== targetW || p.height !== targetH) {
            p.resizeCanvas(targetW, targetH, false);
          }
        };

        p.pixelDensity(1);
        const canvas = p.createCanvas(1, 1);
        canvas.parent(room);
        canvas.style("display", "block");
        syncCanvasSize();
        p.textAlign(p.CENTER, p.CENTER);
        p.textFont("Georgia, Times New Roman, serif");
      };

      p.windowResized = () => {
        if (syncCanvasSize) syncCanvasSize();
      };

      p.draw = () => {
        if (syncCanvasSize) syncCanvasSize();
        const colors = theme || getThemeColors();
        p.background(colors.bg[0], colors.bg[1], colors.bg[2]);

        const scale = layoutScale();
        const fontSize = Math.max(11, 15 * scale);
        p.textSize(fontSize);

        shapeDefs.forEach((shapeDef, shapeIndex) => {
          const spin = shapeDef.spin;
          rotations[shapeIndex].x += spin.x;
          rotations[shapeIndex].y += spin.y;
          rotations[shapeIndex].z += spin.z;
        });

        const drawables = collectDrawables(scale);
        drawables.forEach((drawable) => drawTextEdge(drawable, fontSize, colors));
      };
    };

    p5Instance = new p5(sketch, room);
  }

  function isActive() {
    return Boolean(p5Instance || activeAbortController);
  }

  window.PretextShapesView = { clear, render, isActive };
})();

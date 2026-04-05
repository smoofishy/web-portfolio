(function () {
  const SOURCE_TEXT = `
    Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque faucibus ex sapien vitae pellentesque sem placerat.
    In id cursus mi pretium tellus duis convallis. Tempus leo eu aenean sed diam urna tempor.
    Pulvinar vivamus fringilla lacus nec metus bibendum egestas. Iaculis massa nisl malesuada lacinia integer nunc posuere.
    Ut hendrerit semper vel class aptent taciti sociosqu. Ad litora torquent per conubia nostra inceptos himenaeos.
  `.replace(/\s+/g, " ").trim();

  let activeState = null;

  function clear(fullscreenCopy, fullscreenContent, fullscreenInner) {
    if (activeState) {
      activeState.destroy();
      activeState = null;
    }
    if (fullscreenContent) fullscreenContent.innerHTML = "";
    if (fullscreenCopy) {
      fullscreenCopy.textContent = "";
      fullscreenCopy.style.display = "none";
    }
    if (fullscreenInner) {
      fullscreenInner.classList.remove("snake-fullscreen");
    }
  }

  function render(project, fullscreenCopy, fullscreenContent, fullscreenInner) {
    clear(fullscreenCopy, fullscreenContent, fullscreenInner);
    if (!fullscreenContent || !fullscreenInner) return;

    fullscreenInner.classList.add("snake-fullscreen");
    fullscreenCopy.textContent = "";
    fullscreenCopy.style.display = "none";

    const room = document.createElement("div");
    room.className = "snake-room";
    room.innerHTML = `
      <div class="snake-hud">
        <span class="snake-score">Score: 0</span>
        <span class="snake-state">WASD to move</span>
      </div>
      <canvas class="snake-canvas"></canvas>
    `;
    fullscreenContent.appendChild(room);

    const scoreEl = room.querySelector(".snake-score");
    const stateEl = room.querySelector(".snake-state");
    const canvas = room.querySelector(".snake-canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    activeState = initSnakeGame(room, canvas, ctx, scoreEl, stateEl);
  }

  function initSnakeGame(room, canvas, ctx, scoreEl, stateEl) {
    const cellSize = 24;
    const moveIntervalMs = 90;
    const longText = Array.from({ length: 28 }, () => SOURCE_TEXT.toUpperCase()).join(" ");

    let cols = 0;
    let rows = 0;
    let snake = [];
    let dir = { x: 1, y: 0 };
    let nextDir = { x: 1, y: 0 };
    let foods = [];
    let growth = 0;
    let score = 0;
    let totalLetters = 0;
    let isGameOver = false;
    let lastStepTs = 0;
    let rafId = 0;
    const wheelObstacle = {
      active: false,
      cxPx: 0,
      cyPx: 0,
      rPx: 0,
      blocked: new Set(),
      signature: "",
    };

    function updateHud(message) {
      if (scoreEl) scoreEl.textContent = `Score: ${score}`;
      if (stateEl && message) stateEl.textContent = message;
    }

    function resizeBoard() {
      const w = Math.max(360, room.clientWidth);
      const h = Math.max(280, room.clientHeight);
      canvas.width = w;
      canvas.height = h;
      cols = Math.max(12, Math.floor(w / cellSize));
      rows = Math.max(10, Math.floor(h / cellSize));
      updateWheelObstacle();
      resetGame();
    }

    function cellKey(x, y) {
      return `${x},${y}`;
    }

    function wrapWordsToCharWidth(input, maxChars) {
      const words = input.split(/\s+/).filter(Boolean);
      const lines = [];
      let current = "";
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length > maxChars && current) {
          lines.push(current);
          current = word;
        } else {
          current = candidate;
        }
      }
      if (current) lines.push(current);
      return lines;
    }

    function seedTextFoods() {
      foods = [];
      const marginX = 2;
      const marginY = 2;
      const columnGap = 2;
      const usableCols = Math.max(12, cols - marginX * 2);
      const colWidth = Math.max(8, Math.floor((usableCols - columnGap) / 2));
      const columnX = [marginX, marginX + colWidth + columnGap];
      const maxRows = Math.max(6, rows - marginY * 2);
      const lines = wrapWordsToCharWidth(longText, colWidth);
      let lineIdx = 0;

      for (let c = 0; c < columnX.length; c++) {
        const startX = columnX[c];
        for (let r = 0; r < maxRows; r++) {
          const line = lines[lineIdx % lines.length] || "";
          lineIdx += 1;
          for (let ci = 0; ci < Math.min(colWidth, line.length); ci++) {
            const ch = line[ci];
            if (!/[A-Z]/.test(ch)) continue;
            if (isBlockedCell(startX + ci, marginY + r)) continue;
            foods.push({
              x: startX + ci,
              y: marginY + r,
              ch,
            });
          }
        }
      }
      totalLetters = foods.length;
    }

    function isBlockedCell(x, y) {
      return wheelObstacle.active && wheelObstacle.blocked.has(cellKey(x, y));
    }

    function updateWheelObstacle() {
      const wheel = document.getElementById("wheel");
      if (!wheel) {
        wheelObstacle.active = false;
        wheelObstacle.blocked = new Set();
        wheelObstacle.signature = "";
        return false;
      }
      const roomRect = room.getBoundingClientRect();
      const wheelRect = wheel.getBoundingClientRect();
      if (!roomRect.width || !roomRect.height || !wheelRect.width || !wheelRect.height) {
        wheelObstacle.active = false;
        wheelObstacle.blocked = new Set();
        wheelObstacle.signature = "";
        return false;
      }

      const cxPx = wheelRect.left + wheelRect.width * 0.5 - roomRect.left;
      const cyPx = wheelRect.top + wheelRect.height * 0.5 - roomRect.top;
      const rPx = Math.max(26, Math.min(wheelRect.width, wheelRect.height) * 0.5 + 10);

      if (cxPx + rPx < 0 || cxPx - rPx > canvas.width || cyPx + rPx < 0 || cyPx - rPx > canvas.height) {
        const changed = wheelObstacle.active;
        wheelObstacle.active = false;
        wheelObstacle.blocked = new Set();
        wheelObstacle.signature = "";
        return changed;
      }

      const blocked = new Set();
      const extra = cellSize * 0.32;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const cellCx = x * cellSize + cellSize * 0.5;
          const cellCy = y * cellSize + cellSize * 0.5;
          if (Math.hypot(cellCx - cxPx, cellCy - cyPx) <= rPx + extra) {
            blocked.add(cellKey(x, y));
          }
        }
      }

      const signature = `${Math.round(cxPx)}:${Math.round(cyPx)}:${Math.round(rPx)}:${blocked.size}`;
      const changed = signature !== wheelObstacle.signature;
      wheelObstacle.active = true;
      wheelObstacle.cxPx = cxPx;
      wheelObstacle.cyPx = cyPx;
      wheelObstacle.rPx = rPx;
      wheelObstacle.blocked = blocked;
      wheelObstacle.signature = signature;
      return changed;
    }

    function findSnakeSpawn() {
      const preferredY = Math.max(1, Math.floor(rows * 0.5));
      for (let sweep = 0; sweep < rows; sweep++) {
        const y = (preferredY + sweep) % rows;
        for (let x = 3; x < cols - 1; x++) {
          if (
            !isBlockedCell(x, y) &&
            !isBlockedCell(x - 1, y) &&
            !isBlockedCell(x - 2, y)
          ) {
            return { x, y };
          }
        }
      }
      return { x: Math.max(3, Math.floor(cols * 0.35)), y: preferredY };
    }

    function resetGame() {
      const spawn = findSnakeSpawn();
      const sx = spawn.x;
      const sy = spawn.y;
      snake = [
        { x: sx, y: sy },
        { x: sx - 1, y: sy },
        { x: sx - 2, y: sy },
      ];
      dir = { x: 1, y: 0 };
      nextDir = { x: 1, y: 0 };
      growth = 0;
      score = 0;
      totalLetters = 0;
      isGameOver = false;
      seedTextFoods();
      const snakeCells = new Set(snake.map((seg) => cellKey(seg.x, seg.y)));
      foods = foods.filter((f) => !snakeCells.has(cellKey(f.x, f.y)));
      totalLetters = foods.length;
      updateHud("WASD to move");
    }

    function handleKeydown(event) {
      const key = event.key.toLowerCase();
      let desired = null;
      if (key === "w") desired = { x: 0, y: -1 };
      if (key === "s") desired = { x: 0, y: 1 };
      if (key === "a") desired = { x: -1, y: 0 };
      if (key === "d") desired = { x: 1, y: 0 };
      if (!desired) return;

      event.preventDefault();

      if (isGameOver) {
        resetGame();
      }

      // Prevent direct reverse direction.
      if (desired.x === -dir.x && desired.y === -dir.y) return;
      nextDir = desired;
    }

    function killSnake() {
      isGameOver = true;
      updateHud("You died. Press WASD to restart");
      setTimeout(() => {
        if (!isGameOver) return;
        resetGame();
      }, 700);
    }

    function step() {
      if (isGameOver) return;

      dir = nextDir;
      const head = snake[0];
      const next = { x: head.x + dir.x, y: head.y + dir.y };

      if (next.x < 0 || next.y < 0 || next.x >= cols || next.y >= rows) {
        killSnake();
        return;
      }
      if (isBlockedCell(next.x, next.y)) {
        killSnake();
        return;
      }

      for (let i = 0; i < snake.length; i++) {
        const seg = snake[i];
        if (seg.x === next.x && seg.y === next.y) {
          killSnake();
          return;
        }
      }

      snake.unshift(next);

      const foodIdx = foods.findIndex((f) => f.x === next.x && f.y === next.y);
      if (foodIdx >= 0) {
        foods.splice(foodIdx, 1);
        growth += 1;
        score += 1;
        if (foods.length === 0) {
          updateHud("All letters eaten. Restarting...");
          isGameOver = true;
          setTimeout(() => {
            resetGame();
          }, 900);
          return;
        }
        updateHud("WASD to move");
      }

      if (growth > 0) growth -= 1;
      else snake.pop();
    }

    function drawBoard() {
      const obstacleChanged = updateWheelObstacle();
      if (obstacleChanged && !isGameOver) {
        foods = foods.filter((f) => !isBlockedCell(f.x, f.y));
      }

      ctx.fillStyle = "#15131a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
      for (let x = 0; x < cols; x++) {
        for (let y = 0; y < rows; y++) {
          ctx.fillRect(x * cellSize + 0.5, y * cellSize + 0.5, cellSize - 1, cellSize - 1);
        }
      }

      ctx.font = "bold 16px Georgia, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      foods.forEach((f) => {
        const px = f.x * cellSize + cellSize * 0.5;
        const py = f.y * cellSize + cellSize * 0.5;
        ctx.fillStyle = "#f0e9d5";
        ctx.fillText(f.ch, px, py);
      });

      snake.forEach((seg, idx) => {
        const px = seg.x * cellSize;
        const py = seg.y * cellSize;
        ctx.fillStyle = idx === 0 ? "#7bf5b2" : "#2dd48e";
        ctx.fillRect(px + 1.5, py + 1.5, cellSize - 3, cellSize - 3);
      });

      if (scoreEl) {
        const left = Math.max(0, totalLetters - score);
        scoreEl.textContent = `Score: ${score}  Left: ${left}`;
      }
    }

    function frame(ts) {
      if (!lastStepTs) lastStepTs = ts;
      if (ts - lastStepTs >= moveIntervalMs) {
        step();
        lastStepTs = ts;
      }
      drawBoard();
      rafId = requestAnimationFrame(frame);
    }

    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("resize", resizeBoard);
    resizeBoard();
    rafId = requestAnimationFrame(frame);

    return {
      destroy() {
        cancelAnimationFrame(rafId);
        window.removeEventListener("keydown", handleKeydown);
        window.removeEventListener("resize", resizeBoard);
      },
    };
  }

  function isActive() {
    return Boolean(activeState);
  }

  window.SnakeView = { clear, render, isActive };
})();

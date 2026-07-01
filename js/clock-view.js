(function () {
  const HOUR_HAND_PNG = "assets/clock/hour.png";
  const MINUTE_HAND_PNG = "assets/clock/minute.png";
  const HOUR_HAND_URL = `${HOUR_HAND_PNG}?hand=hour`;
  const MINUTE_HAND_URL = `${MINUTE_HAND_PNG}?hand=minute`;
  const CENTER_OVERLAY_PNG = "assets/clock/Picture1.png";
  const CENTER_OVERLAY_URL = `${CENTER_OVERLAY_PNG}?layer=center`;
  const WATCH_FACE_BG_PNG = "assets/presentations/presentation1-bg.webp";
  const WATCH_FACE_BG_URL = `${WATCH_FACE_BG_PNG}?layer=face`;

  const ASPECT = 21966 / 12750;

  const HUB_BOTTOM_PADDING_PX = 0;
  const HUB_CENTER_X_FRAC = 0.5;

  const DIAL_RADIUS_FRAC_OF_HEIGHT = 0.255;
  const HOUR_LENGTH_VS_DIAL_RADIUS = 1.12;
  const MINUTE_LENGTH_VS_DIAL_RADIUS = 1.6;
  const CENTER_OVERLAY_MAX_SIDE_FRAC = 0.102;

  let p5Instance = null;
  let renderToken = 0;

  function getFullscreenCard() {
    return document.getElementById("fullscreenCard");
  }

  function clear(fullscreenCopy, fullscreenContent, fullscreenInner) {
    renderToken += 1;
    if (p5Instance) {
      try { p5Instance.remove(); } catch (e) {}
      p5Instance = null;
    }
    if (fullscreenContent) fullscreenContent.innerHTML = "";
    if (fullscreenCopy) {
      fullscreenCopy.textContent = "";
      fullscreenCopy.style.display = "none";
    }
    if (fullscreenInner) {
      fullscreenInner.classList.remove("clock-fullscreen");
      fullscreenInner.style.removeProperty("--clock-bg");
    }
    const fullscreenCard = getFullscreenCard();
    if (fullscreenCard) {
      fullscreenCard.classList.remove("clock-overlay");
      fullscreenCard.style.removeProperty("--clock-bg");
    }
  }

  async function render(project, fullscreenCopy, fullscreenContent, fullscreenInner) {
    clear(fullscreenCopy, fullscreenContent, fullscreenInner);
    const thisRender = renderToken;

    try {
      await window.ensureP5();
    } catch (error) {
      return;
    }
    if (renderToken !== thisRender) return;

    fullscreenCopy.textContent = "";
    fullscreenCopy.style.display = "none";

    const bg = project.backColor || "#152236";
    fullscreenInner.style.setProperty("--clock-bg", bg);
    fullscreenInner.classList.add("clock-fullscreen");
    const fullscreenCard = getFullscreenCard();
    if (fullscreenCard) {
      fullscreenCard.classList.add("clock-overlay");
      fullscreenCard.style.setProperty("--clock-bg", bg);
    }

    const container = document.createElement("div");
    container.className = "clock-p5-container";
    fullscreenContent.appendChild(container);

    const sketch = (p) => {
      let hourHandImg;
      let minuteHandImg;
      let centerOverlayImg;
      let watchFaceBgImg;
      let syncCanvasSize = null;

      function drawPngHand(img, pivotToTipLength, hubRadiusPx) {
        if (!img || img.width <= 0 || img.height <= 0) return false;
        const tipX = img.width * HUB_CENTER_X_FRAC;
        const tipY = 0;
        const px = img.width * HUB_CENTER_X_FRAC;
        const py = Math.min(
          img.height - 1,
          Math.max(0, img.height - hubRadiusPx - HUB_BOTTOM_PADDING_PX)
        );
        const dist = Math.hypot(tipX - px, tipY - py);
        if (dist < 1e-3) return false;
        const scale = pivotToTipLength / dist;
        const w = img.width * scale;
        const h = img.height * scale;
        const ox = -px * scale;
        const oy = -py * scale;
        p.image(img, Math.round(ox), Math.round(oy), w, h);
        return true;
      }

      function setHandShadow() {
        const ctx = p.drawingContext;
        ctx.shadowBlur = 8;
        ctx.shadowColor = "rgba(0,0,0,0.42)";
        ctx.shadowOffsetX = 1.75;
        ctx.shadowOffsetY = 3;
      }

      function clearHandShadow() {
        const ctx = p.drawingContext;
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }

      function drawCenterOverlay(img) {
        if (!img || img.width <= 0) return;
        const ctx = p.drawingContext;
        const maxSide = Math.min(p.width, p.height) * CENTER_OVERLAY_MAX_SIDE_FRAC;
        let dw = img.width;
        let dh = img.height;
        const s = Math.min(maxSide / dw, maxSide / dh, 1);
        dw *= s;
        dh *= s;
        p.push();
        ctx.shadowBlur = 16;
        ctx.shadowColor = "rgba(0,0,0,0.48)";
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 5;
        p.imageMode(p.CENTER);
        p.image(img, 0, 0, dw, dh);
        p.imageMode(p.CORNER);
        clearHandShadow();
        p.pop();
      }

      p.preload = () => {
        hourHandImg = p.loadImage(HOUR_HAND_URL, () => {}, () => { hourHandImg = null; });
        minuteHandImg = p.loadImage(MINUTE_HAND_URL, () => {}, () => { minuteHandImg = null; });
        centerOverlayImg = p.loadImage(CENTER_OVERLAY_URL, () => {}, () => { centerOverlayImg = null; });
        watchFaceBgImg = p.loadImage(WATCH_FACE_BG_URL, () => {}, () => { watchFaceBgImg = null; });
      };

      p.setup = () => {
        syncCanvasSize = () => {
          const viewW = Math.max(1, Math.floor(window.innerWidth || 1));
          const viewH = Math.max(1, Math.floor(window.innerHeight || 1));
          let targetW, targetH;
          if (viewW / viewH > ASPECT) {
            targetH = viewH;
            targetW = Math.max(1, Math.round(targetH * ASPECT));
          } else {
            targetW = viewW;
            targetH = Math.max(1, Math.round(targetW / ASPECT));
          }
          container.style.width = `${targetW}px`;
          container.style.height = `${targetH}px`;
          if (
            p.width !== targetW ||
            p.height !== targetH ||
            (p.canvas && (p.canvas.width !== targetW || p.canvas.height !== targetH))
          ) {
            p.resizeCanvas(targetW, targetH, false);
          }
        };

        p.pixelDensity(1);
        const canvas = p.createCanvas(1, 1);
        canvas.parent(container);
        syncCanvasSize();
        p.angleMode(p.DEGREES);
        p.describe("Live clock: hands with center overlay over watch face background.");
      };

      p.draw = () => {
        if (syncCanvasSize) syncCanvasSize();
        p.clear();

        if (watchFaceBgImg && watchFaceBgImg.width > 0) {
          p.image(watchFaceBgImg, 0, 0, p.width, p.height);
        }

        const now = new Date();
        const sec = now.getSeconds() + now.getMilliseconds() / 1000;
        const min = now.getMinutes() + sec / 60;
        const hour = (now.getHours() % 12) + min / 60;

        const dialRadius = p.height * DIAL_RADIUS_FRAC_OF_HEIGHT;
        let hoursLen = dialRadius * HOUR_LENGTH_VS_DIAL_RADIUS;
        let minutesLen = dialRadius * MINUTE_LENGTH_VS_DIAL_RADIUS;

        const margin = 6;
        const maxExtent = Math.max(0, Math.min(p.width, p.height) / 2 - margin);
        const maxLen = Math.max(hoursLen, minutesLen);
        if (maxLen > maxExtent && maxExtent > 0) {
          const s = maxExtent / maxLen;
          hoursLen *= s;
          minutesLen *= s;
        }

        const hourHubRadiusPx = dialRadius * 0.08;
        const minuteHubRadiusPx = dialRadius * 0.06;
        const pivotOffsetX = 0;
        const pivotOffsetY = 0;

        p.translate(p.width / 2, p.height / 2);

        const hourAngle = p.map(hour, 0, 12, 0, 360);
        const minuteAngle = p.map(min, 0, 60, 0, 360);

        p.push();
        p.translate(pivotOffsetX, pivotOffsetY);
        p.rotate(hourAngle);
        setHandShadow();
        drawPngHand(hourHandImg, hoursLen, hourHubRadiusPx);
        clearHandShadow();
        p.pop();

        p.push();
        p.translate(pivotOffsetX, pivotOffsetY);
        p.rotate(minuteAngle);
        setHandShadow();
        drawPngHand(minuteHandImg, minutesLen, minuteHubRadiusPx);
        clearHandShadow();
        p.pop();

        drawCenterOverlay(centerOverlayImg);
      };
    };

    p5Instance = new p5(sketch, container);
  }

  window.ClockView = { clear, render };
})();

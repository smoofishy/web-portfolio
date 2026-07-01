function createPretextCoverDataUri() {
  const words = [
    "orbit", "void", "flux", "signal", "gravity", "event horizon", "stellar", "vector", "mass",
    "black hole", "drift", "warp", "echo", "particle", "singularity",
  ];
  const lines = Array.from({ length: 14 }, (_, row) => {
    const lineWords = Array.from({ length: 8 + (row % 4) }, () => words[Math.floor(Math.random() * words.length)]);
    return lineWords.join(" ");
  });
  const encoded = lines
    .map((line, idx) => `<text x="40" y="${74 + idx * 44}" fill="${idx % 3 === 0 ? "#222" : "#5a5f73"}">${line}</text>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 700"><defs><radialGradient id="g" cx="48%" cy="44%"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#eceffa"/></radialGradient></defs><rect width="700" height="700" fill="url(#g)"/><g font-family="Inter, Arial, sans-serif" font-size="29" font-weight="600" opacity="0.84">${encoded}</g><rect x="18" y="18" width="664" height="664" fill="none" stroke="#6f7bb0" stroke-opacity="0.23" stroke-width="2"/><text x="40" y="664" fill="#1e274a" font-size="44" font-family="Inter, Arial, sans-serif" font-weight="700">PRETEXT LAB</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const projects = [
  {
    title: "About Me",
    image: "assets/About%20Me/000006.webp",
    backColor: "#fff8ef",
  },
  {
    title: "Resume",
    image: "assets/resume/resume-cover.webp",
    backColor: "#ffffff",
    resumeFile: "assets/resume/resume-full.webp",
    coverFit: "contain",
  },
  {
    title: "Pretext Lab",
    image: createPretextCoverDataUri(),
    backColor: "#0c1021",
    pretextLab: true,
  },
  {
    title: "Macintosh Restoration",
    image: "assets/Macintosh_Restoration/Cover.png",
    backColor: "#ffffff",
    coverFit: "contain",
    coverClass: "cover-macintosh-restoration",
  },
  {
    title: "Clock",
    image: "assets/clock/watch-cover.webp",
    backColor: "#152236",
    clockFace: true,
  },
  {
    title: "The Corner",
    image: "assets/presentations/presentation1-cover.webp",
    backColor: "#f2efe8",
    cornerCars: true,
  },
];

const coverflow = document.getElementById("coverflow");
const projectTitle = document.getElementById("projectTitle");
const fullscreenCard = document.getElementById("fullscreenCard");
const fullscreenTitle = document.getElementById("fullscreenTitle");
const fullscreenCopy = document.getElementById("fullscreenCopy");
const fullscreenContent = document.getElementById("fullscreenContent");
const fullscreenInner = document.querySelector(".fullscreen-inner");

const wheel = document.getElementById("wheel");
const menuButton = document.getElementById("menuButton");
const nextButton = document.getElementById("nextButton");
const prevButton = document.getElementById("prevButton");
const centerButton = document.getElementById("centerButton");
const playPauseButton = document.getElementById("playPauseButton");

const FLIP_DURATION_MS = 420;
const EXPAND_DURATION_MS = 1000;
const OVERLAY_SHOW_DELAY_MS = EXPAND_DURATION_MS + 20;
/** Fullscreen fades out before collapse; slightly shorter so the deck feels snappier. */
const OVERLAY_FADE_MS = 140;
const TITLE_SHOW_DELAY_MS = 420;
const RESUME_BUTTON_SCROLL_PX = 120;
const RESUME_RING_SCROLL_PX = 84;
const RESUME_SCROLL_EASE = 0.82;
const RESUME_SCROLL_STEP_GAIN = 0.24;
const CLICK_SOUND_PATH = "assets/click.m4a";
const CLICK_SOUND_GAIN_MULTIPLIER = 20;
const SCREEN_SAVER_TIMEOUT_MS = 90 * 1000;
const SCREEN_SAVER_TOASTER_COUNT = 10;

let selectedIndex = 0;
let isFullscreen = false;
let isRingDragging = false;
let lastDragAngle = 0;
let ringAccumulatedDelta = 0;
let expandTimer = null;
let unflipTimer = null;
let overlayTimer = null;
let collapseTimer = null;
let siblingsHideTimer = null;
let titleUpdateTimer = null;
let coverSizePx = 320;
let resumeScrollVelocity = 0;
let resumeScrollRaf = null;
let resumeScrollLastTs = 0;
let clickAudioContext = null;
let clickAudioBuffer = null;
let clickAudioLoadPromise = null;
const clickFallbackAudio = new Audio(CLICK_SOUND_PATH);
clickFallbackAudio.preload = "auto";
let screenSaverTimer = null;
let screenSaverActive = false;
let screenSaverEl = null;
let screenSaverRaf = null;
let screenSaverLastTs = 0;
const screenSaverToasters = [];
let screenSaverSpriteFrameA = "";
let screenSaverSpriteFrameB = "";

function playUiClickSound() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    try {
      clickFallbackAudio.currentTime = 0;
      clickFallbackAudio.volume = 1;
      clickFallbackAudio.play().catch(() => {});
    } catch (error) {
      /* noop */
    }
    return;
  }

  if (!clickAudioContext) {
    clickAudioContext = new AudioContextCtor();
  }
  if (clickAudioContext.state === "suspended") {
    clickAudioContext.resume().catch(() => {});
  }

  const playFromBuffer = () => {
    if (!clickAudioContext || !clickAudioBuffer) return;
    const source = clickAudioContext.createBufferSource();
    source.buffer = clickAudioBuffer;
    const gain = clickAudioContext.createGain();
    gain.gain.value = CLICK_SOUND_GAIN_MULTIPLIER;
    source.connect(gain);
    gain.connect(clickAudioContext.destination);
    source.start(0);
  };

  if (clickAudioBuffer) {
    playFromBuffer();
    return;
  }

  if (!clickAudioLoadPromise) {
    clickAudioLoadPromise = fetch(CLICK_SOUND_PATH)
      .then((res) => res.arrayBuffer())
      .then((data) => clickAudioContext.decodeAudioData(data))
      .then((buffer) => {
        clickAudioBuffer = buffer;
      })
      .catch(() => {
        clickAudioBuffer = null;
      });
  }

  clickAudioLoadPromise.then(() => {
    if (clickAudioBuffer) {
      playFromBuffer();
      return;
    }
    try {
      clickFallbackAudio.currentTime = 0;
      clickFallbackAudio.volume = 1;
      clickFallbackAudio.play().catch(() => {});
    } catch (error) {
      /* noop */
    }
  });
}

function playUiClickSoundIfUserAction(event) {
  if (!event || !event.isTrusted) return;
  playUiClickSound();
}

function bindWheelButtonSound(button) {
  if (!button) return;
  button.addEventListener("click", playUiClickSoundIfUserAction);
}

[menuButton, nextButton, prevButton, playPauseButton, centerButton].forEach((btn) => {
  bindWheelButtonSound(btn);
});

function createToasterDataUri(wingRaised) {
  const wingY = wingRaised ? 20 : 26;
  const wingPath = wingRaised
    ? "M20 26 C9 12, 8 5, 22 7 C20 12, 23 17, 30 20 Z"
    : "M20 30 C7 30, 4 24, 15 20 C22 22, 26 25, 30 29 Z";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 64">` +
    `<g stroke="#000" stroke-width="2" fill="none">` +
    `<path d="${wingPath}" fill="#e6e6e6"/>` +
    `<rect x="24" y="14" width="46" height="36" rx="7" ry="7" fill="#f8f8f8"/>` +
    `<rect x="32" y="22" width="14" height="15" fill="#c9c9c9"/>` +
    `<rect x="49" y="22" width="14" height="15" fill="#c9c9c9"/>` +
    `<path d="M70 28 L83 ${wingY} L90 28 L84 35 Z" fill="#ececec"/>` +
    `<path d="M24 46 L15 47 L15 39 L24 38 Z" fill="#d2d2d2"/>` +
    `</g>` +
    `<rect x="34" y="40" width="5" height="4" fill="#000"/>` +
    `<rect x="54" y="40" width="5" height="4" fill="#000"/>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function resetToasterState(toaster, fromOffscreenLeft = false) {
  if (!screenSaverEl) return;
  const w = Math.max(1, screenSaverEl.clientWidth);
  const h = Math.max(1, screenSaverEl.clientHeight);
  toaster.size = randomBetween(40, 82);
  toaster.x = fromOffscreenLeft ? -toaster.size - randomBetween(8, 180) : randomBetween(0, Math.max(1, w - toaster.size));
  toaster.y = fromOffscreenLeft ? randomBetween(h * 0.35, h + toaster.size * 0.9) : randomBetween(0, Math.max(1, h - toaster.size));
  toaster.vx = randomBetween(0.7, 2.2);
  toaster.vy = -randomBetween(0.35, 1.3);
  toaster.wobblePhase = randomBetween(0, Math.PI * 2);
  toaster.wobbleSpeed = randomBetween(0.02, 0.05);
  toaster.wobbleAmp = randomBetween(0.08, 0.28);
  toaster.frameElapsed = 0;
  toaster.frameIndex = Math.random() > 0.5 ? 1 : 0;
  toaster.el.style.width = `${toaster.size}px`;
  toaster.el.style.height = `${Math.round(toaster.size * 0.67)}px`;
  toaster.el.style.opacity = String(randomBetween(0.58, 0.98));
  toaster.el.src = toaster.frameIndex === 0 ? screenSaverSpriteFrameA : screenSaverSpriteFrameB;
}

function ensureScreenSaver() {
  if (screenSaverEl) return;
  screenSaverSpriteFrameA = createToasterDataUri(false);
  screenSaverSpriteFrameB = createToasterDataUri(true);
  screenSaverEl = document.createElement("div");
  screenSaverEl.id = "screenSaver";
  screenSaverEl.className = "screen-saver";
  screenSaverEl.setAttribute("aria-hidden", "true");
  const fieldEl = document.createElement("div");
  fieldEl.className = "screen-saver-field";
  screenSaverEl.appendChild(fieldEl);

  for (let i = 0; i < SCREEN_SAVER_TOASTER_COUNT; i += 1) {
    const el = document.createElement("img");
    el.className = "screen-saver-toaster";
    el.alt = "";
    el.setAttribute("aria-hidden", "true");
    el.draggable = false;
    fieldEl.appendChild(el);
    const toaster = {
      el,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 54,
      wobblePhase: 0,
      wobbleSpeed: 0.03,
      wobbleAmp: 0.2,
      frameElapsed: 0,
      frameIndex: 0,
    };
    screenSaverToasters.push(toaster);
  }

  screenSaverEl.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    hideScreenSaver();
    resetScreenSaverTimer();
  });

  document.body.appendChild(screenSaverEl);
}

function stopScreenSaverAnimation() {
  if (!screenSaverRaf) return;
  cancelAnimationFrame(screenSaverRaf);
  screenSaverRaf = null;
  screenSaverLastTs = 0;
}

function runScreenSaverAnimation(ts) {
  if (!screenSaverActive || !screenSaverEl || !screenSaverToasters.length) {
    stopScreenSaverAnimation();
    return;
  }

  if (!screenSaverLastTs) {
    screenSaverLastTs = ts;
  }
  const frameScale = Math.max(0.5, Math.min(2.4, ((ts - screenSaverLastTs) || 16.67) / 16.67));
  screenSaverLastTs = ts;

  const areaWidth = Math.max(1, screenSaverEl.clientWidth);
  const areaHeight = Math.max(1, screenSaverEl.clientHeight);
  const wingSwapMs = 160;

  screenSaverToasters.forEach((toaster) => {
    toaster.x += toaster.vx * frameScale;
    toaster.y += toaster.vy * frameScale;
    toaster.wobblePhase += toaster.wobbleSpeed * frameScale;
    const wobble = Math.sin(toaster.wobblePhase) * toaster.wobbleAmp;

    toaster.frameElapsed += 16.67 * frameScale;
    if (toaster.frameElapsed >= wingSwapMs) {
      toaster.frameElapsed = 0;
      toaster.frameIndex = toaster.frameIndex === 0 ? 1 : 0;
      toaster.el.src = toaster.frameIndex === 0 ? screenSaverSpriteFrameA : screenSaverSpriteFrameB;
    }

    const width = toaster.el.offsetWidth || toaster.size;
    const height = toaster.el.offsetHeight || toaster.size;
    if (toaster.x > areaWidth + width || toaster.y < -height - 24) {
      resetToasterState(toaster, true);
    }

    toaster.el.style.transform = `translate3d(${toaster.x}px, ${toaster.y}px, 0) rotate(${wobble}deg)`;
  });

  screenSaverRaf = requestAnimationFrame(runScreenSaverAnimation);
}

function showScreenSaver() {
  if (isFullscreen) return;
  if (screenSaverActive) return;
  ensureScreenSaver();
  if (!screenSaverEl || !screenSaverToasters.length) return;

  screenSaverActive = true;
  document.body.classList.add("screensaver-active");
  screenSaverEl.setAttribute("aria-hidden", "false");
  screenSaverToasters.forEach((toaster) => {
    resetToasterState(toaster, false);
  });

  stopScreenSaverAnimation();
  screenSaverRaf = requestAnimationFrame(runScreenSaverAnimation);
}

function hideScreenSaver() {
  if (!screenSaverActive) return;
  screenSaverActive = false;
  document.body.classList.remove("screensaver-active");
  if (screenSaverEl) {
    screenSaverEl.setAttribute("aria-hidden", "true");
  }
  stopScreenSaverAnimation();
}

function resetScreenSaverTimer() {
  clearTimeout(screenSaverTimer);
  if (isFullscreen) {
    hideScreenSaver();
    return;
  }
  screenSaverTimer = setTimeout(() => {
    showScreenSaver();
  }, SCREEN_SAVER_TIMEOUT_MS);
}

function onAnyUserActivity(event) {
  if (isFullscreen) {
    if (screenSaverActive) {
      hideScreenSaver();
    }
    clearTimeout(screenSaverTimer);
    return;
  }
  if (screenSaverActive) {
    if (event.cancelable) {
      event.preventDefault();
    }
    event.stopPropagation();
    hideScreenSaver();
    resetScreenSaverTimer();
    return;
  }
  resetScreenSaverTimer();
}

function getViewportSize() {
  const viewport = window.visualViewport;
  return {
    vw: Math.max(1, Math.floor(viewport ? viewport.width : window.innerWidth || 1)),
    vh: Math.max(1, Math.floor(viewport ? viewport.height : window.innerHeight || 1)),
  };
}

function updateResponsiveCoverSize() {
  const { vw, vh } = getViewportSize();
  const isPortrait = vh >= vw;
  const compactHeight = vh < 620;
  const widthLimit = vw * (isPortrait ? 0.62 : 0.42);
  const heightDriven = vh * (isPortrait ? 0.5 : compactHeight ? 0.46 : 0.6);
  const computed = Math.min(widthLimit, heightDriven, 360);
  const minSize = vh < 520 ? 110 : vh < 620 ? 125 : 150;
  coverSizePx = Math.round(Math.max(minSize, computed));
  document.documentElement.style.setProperty("--cover-size", `${coverSizePx}px`);
  document.documentElement.style.setProperty("--project-title-offset", vh < 560 ? "0px" : vh < 700 ? "-1.6vh" : "-5vh");
  if (document.body) {
    document.body.classList.toggle("compact-height", vh < 520);
  }
}

projects.forEach((item, index) => {
  const coverSrc = item.image || "";
  const contain = item.coverFit === "contain";
  const fitClass = contain ? " cover-contain" : "";
  const visualContainClass = contain ? " cover-visual-contain" : "";
  const coverClass = item.coverClass ? ` ${item.coverClass}` : "";
  const card = document.createElement("div");
  card.className = `cover-item${coverClass}`;
  card.tabIndex = 0;
  card.setAttribute("role", "option");
  card.setAttribute("aria-label", item.title);
  card.dataset.index = String(index);
  card.style.setProperty("--cover-image", `url("${coverSrc}")`);
  card.style.setProperty("--cover-back-color", item.backColor || "#ffffff");
  /* Only the initially-selected cover needs to decode eagerly; the rest can load lazily and off the critical path. */
  const isInitiallySelected = index === 0;
  const frontLoading = isInitiallySelected ? "eager" : "lazy";
  const frontPriority = isInitiallySelected ? ' fetchpriority="high"' : "";
  card.innerHTML = `
    <div class="cover-visual${visualContainClass}">
      <div class="cover-face">
        <img class="cover-front${fitClass}" src="${coverSrc}" alt="${item.title}" loading="${frontLoading}" decoding="async"${frontPriority} />
      </div>
      <div class="cover-face cover-back" aria-hidden="true"></div>
    </div>
    <div class="cover-reflection-wrap" aria-hidden="true">
      <img class="cover-reflection${fitClass}" src="${coverSrc}" alt="" loading="lazy" decoding="async" />
      <div class="reflection-fade"></div>
    </div>
  `;
  card.addEventListener("click", () => {
    playUiClickSound();
    if (selectedIndex !== index) {
      selectIndex(index);
      return;
    }
    openSelected();
  });
  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    playUiClickSound();
    if (selectedIndex !== index) {
      selectIndex(index);
      return;
    }
    openSelected();
  });
  coverflow.appendChild(card);
});

const cards = Array.from(document.querySelectorAll(".cover-item"));

function clampIndex(index) {
  if (index < 0) return 0;
  if (index >= projects.length) return projects.length - 1;
  return index;
}

function selectIndex(nextIndex) {
  const clamped = clampIndex(nextIndex);
  if (clamped === selectedIndex) return false;
  selectedIndex = clamped;
  scheduleProjectTitleUpdate();
  renderCoverflow();
  return true;
}

function scheduleProjectTitleUpdate(immediate = false) {
  clearTimeout(titleUpdateTimer);
  titleUpdateTimer = null;

  if (immediate) {
    projectTitle.textContent = projects[selectedIndex].title;
    projectTitle.classList.remove("pending");
    return;
  }

  projectTitle.classList.add("pending");
  titleUpdateTimer = setTimeout(() => {
    titleUpdateTimer = null;
    projectTitle.textContent = projects[selectedIndex].title;
    projectTitle.classList.remove("pending");
  }, TITLE_SHOW_DELAY_MS);
}

function renderCoverflow() {
  const { vw, vh } = getViewportSize();
  const compactHeightFactor = vh < 520 ? 0.74 : vh < 620 ? 0.84 : 1;
  const sideSpan = Math.max(120, vw / 2 - Math.max(18, vw * 0.04));
  const spacing = Math.max(48, Math.min(coverSizePx * 0.4 * compactHeightFactor, sideSpan / 1.95));
  const centerZ = Math.max(220, coverSizePx * 0.74);
  const sideZ = Math.max(60, centerZ - Math.max(130, coverSizePx * 0.48));
  const perspectiveDepth = 1400;
  const sideScaleCompensation = Math.min(
    1.24,
    Math.max(1.06, (perspectiveDepth - sideZ) / (perspectiveDepth - centerZ))
  );
  const selectedScale = sideScaleCompensation;
  const neighboringOpacity = Math.max(0.16, 1 - 0.14);
  const rotateBase = vh < 620 ? -48 : -56;
  cards.forEach((card, index) => {
    const offset = index - selectedIndex;
    const abs = Math.abs(offset);
    const direction = Math.sign(offset);
    const distanceCurve = abs === 0 ? 0 : 1 + (Math.pow(abs, 0.86) - 1) * 0.9;
    const x = direction * distanceCurve * spacing * 1.12;
    const z = abs === 0 ? centerZ : sideZ;
    const rotateY = direction * rotateBase;
    const scale = abs === 0 ? selectedScale : sideScaleCompensation;
    const opacity = abs === 0 ? 1 : neighboringOpacity;
    card.style.setProperty("--selected-scale", String(scale));
    card.style.zIndex = String(100 - abs);
    card.style.opacity = String(Math.max(0, opacity));
    card.style.filter = abs === 0 ? "none" : "saturate(0.7)";
    card.style.transform = `translate(-50%, -50%) translateX(${x}px) translateZ(${z}px) rotateY(${rotateY}deg) scale(${scale})`;
    const clickable = abs <= 1;
    card.style.pointerEvents = clickable ? "auto" : "none";
    card.style.cursor = clickable ? "pointer" : "default";
    card.tabIndex = clickable ? 0 : -1;
    card.setAttribute("aria-selected", String(index === selectedIndex));
    card.classList.remove("flipped");
    card.classList.remove("opening");
    card.classList.remove("closing");
    card.classList.remove("expanded");
  });
}

function stepForward() {
  if (isFullscreen) return false;
  return selectIndex(selectedIndex + 1);
}

function stepBack() {
  if (isFullscreen) return false;
  return selectIndex(selectedIndex - 1);
}

function isResumeFullscreenActive() {
  if (!isFullscreen) return false;
  const project = projects[selectedIndex];
  if (!project || !project.resumeFile) return false;
  if (window.ResumeView && typeof window.ResumeView.isActive === "function") {
    if (window.ResumeView.isActive()) return true;
  }
  const fallbackScroll = document.querySelector(".resume-scroll");
  return Boolean(fallbackScroll);
}

function getResumeScroller() {
  const fallbackScroll = document.querySelector(".resume-scroll");
  return fallbackScroll || null;
}

function stopResumeSmoothScroll() {
  if (resumeScrollRaf) {
    cancelAnimationFrame(resumeScrollRaf);
    resumeScrollRaf = null;
  }
  resumeScrollVelocity = 0;
  resumeScrollLastTs = 0;
}

function runResumeSmoothScroll(ts) {
  if (!isResumeFullscreenActive()) {
    stopResumeSmoothScroll();
    return;
  }
  const scroller = getResumeScroller();
  if (!scroller) {
    stopResumeSmoothScroll();
    return;
  }

  if (!resumeScrollLastTs) {
    resumeScrollLastTs = ts;
  }
  const frameScale = Math.max(0.5, Math.min(2.5, (ts - resumeScrollLastTs) / 16.67 || 1));
  resumeScrollLastTs = ts;

  const step = resumeScrollVelocity * RESUME_SCROLL_STEP_GAIN * frameScale;
  scroller.scrollTop += step;

  resumeScrollVelocity *= Math.pow(RESUME_SCROLL_EASE, frameScale);
  if (Math.abs(resumeScrollVelocity) < 0.25) {
    stopResumeSmoothScroll();
    return;
  }

  resumeScrollRaf = requestAnimationFrame(runResumeSmoothScroll);
}

function scrollResumeBy(deltaPx) {
  if (!isResumeFullscreenActive()) return false;
  const scroller = getResumeScroller();
  if (!scroller) return false;
  resumeScrollVelocity += deltaPx;
  if (!resumeScrollRaf) {
    resumeScrollLastTs = 0;
    resumeScrollRaf = requestAnimationFrame(runResumeSmoothScroll);
  }
  return true;
}

function onNextControl() {
  if (isFullscreen) {
    const project = projects[selectedIndex];
    if (project && project.pretextLab) {
      if (
        window.PretextLabView &&
        typeof window.PretextLabView.isActive === "function" &&
        window.PretextLabView.isActive()
      ) {
        if (window.PretextShapesView) {
          window.PretextLabView.clear(fullscreenCopy, fullscreenContent, fullscreenInner);
          window.PretextShapesView.render(project, fullscreenCopy, fullscreenContent, fullscreenInner);
          return true;
        }
      }
      if (
        window.PretextShapesView &&
        typeof window.PretextShapesView.isActive === "function" &&
        window.PretextShapesView.isActive()
      ) {
        return true;
      }
    }
  }
  if (scrollResumeBy(RESUME_BUTTON_SCROLL_PX)) return true;
  if (stepForward()) return true;
  return false;
}

function onPrevControl() {
  if (isFullscreen) {
    const project = projects[selectedIndex];
    if (project && project.pretextLab) {
      if (
        window.PretextShapesView &&
        typeof window.PretextShapesView.isActive === "function" &&
        window.PretextShapesView.isActive()
      ) {
        if (window.PretextLabView) {
          window.PretextShapesView.clear(fullscreenCopy, fullscreenContent, fullscreenInner);
          window.PretextLabView.render(project, fullscreenCopy, fullscreenContent, fullscreenInner);
          return true;
        }
      }
      if (
        window.PretextLabView &&
        typeof window.PretextLabView.isActive === "function" &&
        window.PretextLabView.isActive()
      ) {
        return true;
      }
    }
  }
  if (scrollResumeBy(-RESUME_BUTTON_SCROLL_PX)) return true;
  if (stepBack()) return true;
  return false;
}

function clearFullscreenContent() {
  stopResumeSmoothScroll();
  if (window.ClockView) {
    window.ClockView.clear(fullscreenCopy, fullscreenContent, fullscreenInner);
  }
  if (window.PretextLabView) {
    window.PretextLabView.clear(fullscreenCopy, fullscreenContent, fullscreenInner);
  }
  if (window.PretextShapesView) {
    window.PretextShapesView.clear(fullscreenCopy, fullscreenContent, fullscreenInner);
  }
  if (window.CornerView) {
    window.CornerView.clear(fullscreenCopy, fullscreenContent, fullscreenInner);
  }
  window.ResumeView.clear(fullscreenCopy, fullscreenContent);
  if (fullscreenInner) {
    fullscreenInner.style.background = "";
    fullscreenInner.classList.remove("clock-fullscreen");
    fullscreenInner.classList.remove("pretext-fullscreen");
    fullscreenInner.classList.remove("pretext-shapes-fullscreen");
    fullscreenInner.classList.remove("corner-fullscreen");
    fullscreenInner.style.removeProperty("--clock-bg");
  }
}

function renderFullscreenContent(project) {
  if (project.clockFace && window.ClockView) {
    window.ClockView.render(project, fullscreenCopy, fullscreenContent, fullscreenInner);
    return;
  }
  if (project.pretextLab && window.PretextLabView) {
    window.PretextLabView.render(project, fullscreenCopy, fullscreenContent, fullscreenInner);
    return;
  }
  if (project.cornerCars && window.CornerView) {
    window.CornerView.render(project, fullscreenCopy, fullscreenContent, fullscreenInner);
    return;
  }
  if (window.ClockView) {
    window.ClockView.clear(fullscreenCopy, fullscreenContent, fullscreenInner);
  }
  if (window.PretextLabView) {
    window.PretextLabView.clear(fullscreenCopy, fullscreenContent, fullscreenInner);
  }
  if (window.PretextShapesView) {
    window.PretextShapesView.clear(fullscreenCopy, fullscreenContent, fullscreenInner);
  }
  if (window.CornerView) {
    window.CornerView.clear(fullscreenCopy, fullscreenContent, fullscreenInner);
  }
  window.ResumeView.render(project, fullscreenCopy, fullscreenContent);
}

function openSelected() {
  if (isFullscreen) return;
  clearTimeout(screenSaverTimer);
  hideScreenSaver();
  const selectedCard = cards[selectedIndex];
  document.body.classList.remove("cover-collapsing");
  clearTimeout(expandTimer);
  clearTimeout(unflipTimer);
  clearTimeout(overlayTimer);
  clearTimeout(collapseTimer);
  clearTimeout(siblingsHideTimer);
  siblingsHideTimer = null;
  fullscreenTitle.textContent = projects[selectedIndex].title;
  renderFullscreenContent(projects[selectedIndex]);
  fullscreenCard.setAttribute("aria-hidden", "true");
  selectedCard.classList.add("flipped");
  expandTimer = setTimeout(() => {
    const cardRect = selectedCard.getBoundingClientRect();
    const startSize = Math.max(cardRect.width, 1);
    const targetSize = Math.max(window.innerWidth, window.innerHeight);
    const expandScale = targetSize / startSize + 0.02;
    selectedCard.style.setProperty("--expand-scale", String(expandScale));
    selectedCard.classList.add("opening");
    document.body.classList.add("cover-expanded");
    selectedCard.classList.add("expanded");
    isFullscreen = true;
    clearTimeout(screenSaverTimer);
    siblingsHideTimer = setTimeout(() => {
      siblingsHideTimer = null;
      if (!isFullscreen || !selectedCard.classList.contains("expanded")) return;
      document.body.classList.add("cover-siblings-hidden");
    }, EXPAND_DURATION_MS);
    overlayTimer = setTimeout(() => {
      if (!isFullscreen || !selectedCard.classList.contains("expanded")) return;
      fullscreenCard.setAttribute("aria-hidden", "false");
    }, OVERLAY_SHOW_DELAY_MS);
  }, FLIP_DURATION_MS);
}

function closeFullscreen() {
  const selectedCard = cards[selectedIndex];
  if (!isFullscreen && !selectedCard.classList.contains("flipped")) return;
  document.body.classList.add("cover-collapsing");
  clearTimeout(expandTimer);
  clearTimeout(unflipTimer);
  clearTimeout(overlayTimer);
  clearTimeout(collapseTimer);
  clearTimeout(siblingsHideTimer);
  siblingsHideTimer = null;
  fullscreenCard.setAttribute("aria-hidden", "true");
  const wasExpanded = selectedCard.classList.contains("expanded") || isFullscreen;

  const finishClosing = () => {
    document.body.classList.remove("cover-expanded");
    document.body.classList.remove("cover-siblings-hidden");
    document.body.classList.remove("cover-collapsing");
    selectedCard.classList.remove("closing");
    selectedCard.style.removeProperty("--expand-scale");
    isFullscreen = false;
    clearFullscreenContent();
    resetScreenSaverTimer();
    /* Unflip immediately so the 420ms transform matches the forward flip (no extra delay after close). */
    selectedCard.classList.remove("flipped");
  };

  if (!wasExpanded) {
    finishClosing();
    return;
  }

  const startCollapse = () => {
    selectedCard.classList.add("closing");
    selectedCard.classList.remove("expanded");
    selectedCard.classList.remove("opening");
  };

  let settled = false;
  const onTransitionEnd = (event) => {
    if (event.target !== selectedCard) return;
    const prop = event.propertyName;
    if (prop !== "transform" && prop !== "top" && prop !== "left" && prop !== "width" && prop !== "height") {
      return;
    }
    if (settled) return;
    settled = true;
    selectedCard.removeEventListener("transitionend", onTransitionEnd);
    clearTimeout(unflipTimer);
    finishClosing();
  };

  selectedCard.addEventListener("transitionend", onTransitionEnd);
  collapseTimer = setTimeout(() => {
    /* Show sibling covers during collapse; deck was hidden only after expand finished. */
    document.body.classList.remove("cover-expanded");
    document.body.classList.remove("cover-siblings-hidden");
    startCollapse();
    unflipTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      selectedCard.removeEventListener("transitionend", onTransitionEnd);
      finishClosing();
    }, EXPAND_DURATION_MS + 80);
  }, OVERLAY_FADE_MS);
}

menuButton.addEventListener("click", closeFullscreen);
centerButton.addEventListener("click", () => {
  if (isFullscreen) return;
  openSelected();
});
nextButton.addEventListener("click", onNextControl);
prevButton.addEventListener("click", onPrevControl);
playPauseButton.addEventListener("click", () => {
  onNextControl();
});

window.addEventListener(
  "wheel",
  (event) => {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    const currentProject = projects[selectedIndex];
    if (currentProject && currentProject.pretextLab) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    if (event.deltaX > 0) onNextControl();
    else if (event.deltaX < 0) onPrevControl();
  },
  { passive: false }
);

window.addEventListener("keydown", (event) => {
  if (event.key === "Enter") openSelected();
  if (event.key === "Escape") closeFullscreen();
});

function pointerAngle(clientX, clientY) {
  const rect = wheel.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI);
}

wheel.addEventListener("pointerdown", (event) => {
  const target = event.target;
  if (target.closest(".center-btn") || target.closest(".wheel-btn")) {
    return;
  }
  isRingDragging = true;
  lastDragAngle = pointerAngle(event.clientX, event.clientY);
  wheel.setPointerCapture(event.pointerId);
});

wheel.addEventListener("pointermove", (event) => {
  if (!isRingDragging) return;
  const angle = pointerAngle(event.clientX, event.clientY);
  let delta = angle - lastDragAngle;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  lastDragAngle = angle;
  ringAccumulatedDelta += delta;

  const stepThreshold = 28;
  while (ringAccumulatedDelta > stepThreshold) {
    if (scrollResumeBy(RESUME_RING_SCROLL_PX)) {
      playUiClickSound();
    } else if (stepForward()) {
      playUiClickSound();
    }
    ringAccumulatedDelta -= stepThreshold;
  }
  while (ringAccumulatedDelta < -stepThreshold) {
    if (scrollResumeBy(-RESUME_RING_SCROLL_PX)) {
      playUiClickSound();
    } else if (stepBack()) {
      playUiClickSound();
    }
    ringAccumulatedDelta += stepThreshold;
  }
});

wheel.addEventListener("pointerup", () => {
  isRingDragging = false;
  ringAccumulatedDelta = 0;
});

wheel.addEventListener("pointercancel", () => {
  isRingDragging = false;
  ringAccumulatedDelta = 0;
});

const syncResponsiveLayout = () => {
  updateResponsiveCoverSize();
  renderCoverflow();
};

window.addEventListener("resize", syncResponsiveLayout);
window.addEventListener("orientationchange", syncResponsiveLayout);
window.addEventListener("pageshow", syncResponsiveLayout);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", syncResponsiveLayout);
}
["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "touchmove"].forEach((eventName) => {
  window.addEventListener(eventName, onAnyUserActivity, { capture: true, passive: false });
});
window.addEventListener("blur", resetScreenSaverTimer);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    hideScreenSaver();
  }
  resetScreenSaverTimer();
});

updateResponsiveCoverSize();
scheduleProjectTitleUpdate(true);
renderCoverflow();
resetScreenSaverTimer();

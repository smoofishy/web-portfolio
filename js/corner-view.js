(function () {
  let active = false;

  function getFullscreenCard() {
    return document.getElementById("fullscreenCard");
  }

  function clear(fullscreenCopy, fullscreenContent, fullscreenInner) {
    active = false;
    if (fullscreenContent) {
      fullscreenContent.innerHTML = "";
    }
    if (fullscreenCopy) {
      fullscreenCopy.textContent = "";
      fullscreenCopy.style.display = "none";
    }
    if (fullscreenInner) {
      fullscreenInner.classList.remove("corner-fullscreen");
    }
    const fullscreenCard = getFullscreenCard();
    if (fullscreenCard) {
      fullscreenCard.classList.remove("corner-overlay");
    }
  }

  function render(project, fullscreenCopy, fullscreenContent, fullscreenInner) {
    clear(fullscreenCopy, fullscreenContent, fullscreenInner);
    if (!fullscreenContent || !fullscreenInner) return;

    active = true;
    fullscreenInner.classList.add("corner-fullscreen");
    fullscreenCopy.textContent = "";
    fullscreenCopy.style.display = "none";

    const fullscreenCard = getFullscreenCard();
    if (fullscreenCard) {
      fullscreenCard.classList.add("corner-overlay");
    }
  }

  function isActive() {
    return active;
  }

  window.CornerView = {
    clear,
    render,
    isActive,
  };
})();

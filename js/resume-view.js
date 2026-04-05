(function () {
  let activeScroll = null;

  function clear(fullscreenCopy, fullscreenContent) {
    activeScroll = null;
    fullscreenCopy.textContent = "";
    fullscreenCopy.style.display = "none";
    fullscreenContent.innerHTML = "";
  }

  function render(project, fullscreenCopy, fullscreenContent) {
    clear(fullscreenCopy, fullscreenContent);
    if (!project.resumeFile) return;

    const resumePath = encodeURI(project.resumeFile);
    const scroll = document.createElement("div");
    scroll.className = "resume-scroll";
    activeScroll = scroll;

    const img = document.createElement("img");
    img.className = "resume-embed";
    img.src = resumePath;
    img.alt = "Resume";
    img.setAttribute("loading", "lazy");
    img.decoding = "async";

    scroll.appendChild(img);

    const fallback = document.createElement("p");
    fallback.className = "resume-fallback";
    fallback.textContent = "Resume image could not be loaded. ";
    const link = document.createElement("a");
    link.href = resumePath;
    link.textContent = "Open resume";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    fallback.appendChild(link);

    fullscreenContent.appendChild(scroll);
    img.addEventListener("error", () => {
      scroll.remove();
      activeScroll = null;
      if (!fullscreenContent.contains(fallback)) {
        fullscreenContent.appendChild(fallback);
      }
    });
  }

  function isActive() {
    return Boolean(activeScroll && activeScroll.isConnected);
  }

  function scrollBy(deltaY) {
    if (!isActive()) return false;
    activeScroll.scrollTop += deltaY;
    return true;
  }

  window.ResumeView = { clear, render, isActive, scrollBy };
})();

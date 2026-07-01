(function () {
  const P5_URL = "https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.7.0/p5.min.js";
  let loadPromise = null;

  /** p5 is only needed by the Clock / Pretext Lab / Pretext Shapes views, so it's fetched on first use instead of blocking the initial page load. */
  function ensureP5() {
    if (window.p5) return Promise.resolve();
    if (loadPromise) return loadPromise;
    loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = P5_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        loadPromise = null;
        reject(new Error("Failed to load p5.js"));
      };
      document.head.appendChild(script);
    });
    return loadPromise;
  }

  window.ensureP5 = ensureP5;
})();

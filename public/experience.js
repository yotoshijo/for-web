(() => {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const splash = document.querySelector("#entrySplash");
  const skip = document.querySelector("#skipSplash");
  const edition = document.documentElement.dataset.edition;
  const storageKey = "quote-intro-v2-" + edition;
  let seen = false;
  try { seen = sessionStorage.getItem(storageKey) === "1"; } catch { /* Storage is optional. */ }

  if (!seen && !reducedMotion.matches && typeof splash.showModal === "function") {
    splash.showModal();
    let closeTimer;
    const enterTimer = setTimeout(finish, 1400);
    skip.addEventListener("click", finish);
    splash.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish();
    });
    function finish() {
      if (closeTimer !== undefined) return;
      clearTimeout(enterTimer);
      splash.classList.add("is-leaving");
      try { sessionStorage.setItem(storageKey, "1"); } catch { /* Storage is optional. */ }
      closeTimer = setTimeout(() => {
        splash.close();
        document.body.classList.add("page-entered");
      }, 240);
    }
  }

  let lastResult;
  window.quoteMotion = {
    result(element) {
      if (reducedMotion.matches || splash.open || !element.animate) return;
      lastResult?.cancel();
      lastResult = element.animate(
        [{ opacity: 0.66, transform: "translateY(5px)" }, { opacity: 1, transform: "translateY(0)" }],
        { duration: 240, easing: "cubic-bezier(.2,.72,.28,1)" }
      );
    }
  };
})();

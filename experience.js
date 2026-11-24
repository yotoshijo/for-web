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
    const enterTimer = setTimeout(finish, 1320);
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

  const active = new WeakMap();
  function animate(element, frames, duration) {
    if (reducedMotion.matches || splash.open || !element?.animate) return;
    active.get(element)?.cancel();
    active.set(element, element.animate(frames, { duration, easing: "cubic-bezier(.2,.72,.28,1)" }));
  }
  window.quoteMotion = {
    result(element) {
      animate(element, [
        { color: "#fff2a9", transform: "translateY(3px)" },
        { color: "#aee9cd", transform: "translateY(0)" }
      ], 310);
    },
    price(input) {
      animate(input.closest("tr"), [{ backgroundColor: "#67503c" }, { backgroundColor: "#202a34" }], 380);
    },
    saved(element) {
      animate(element, [{ opacity: .3, transform: "translateY(4px)" }, { opacity: 1, transform: "translateY(0)" }], 270);
    }
  };
})();

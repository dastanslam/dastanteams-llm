(function () {
  const layout = document.getElementById("layout");
  if (!layout) return;

  let w1 = 1, w2 = 1, w3 = 1;

  const apply = () => {
    layout.style.gridTemplateColumns = `${w1}fr 10px ${w2}fr 10px ${w3}fr`;
  };
  apply();

  const resizers = layout.querySelectorAll(".resizer");
  let active = null;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  resizers.forEach((r, idx) => {
    r.addEventListener("mousedown", (e) => {
      if (window.matchMedia("(max-width: 1200px)").matches) return;
      e.preventDefault();

      active = {
        idx,
        startX: e.clientX,
        start: [w1, w2, w3],
      };

      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    });
  });

  window.addEventListener("mousemove", (e) => {
    if (!active) return;

    const containerWidth = layout.getBoundingClientRect().width;
    const dx = e.clientX - active.startX;

    // dx(px) -> delta(fr)
    const delta = (dx / containerWidth) * 6;

    let [a, b, c] = active.start;

    if (active.idx === 0) {
      a = clamp(a + delta, 0.6, 5);
      b = clamp(b - delta, 0.6, 5);
    } else {
      b = clamp(b + delta, 0.6, 5);
      c = clamp(c - delta, 0.6, 5);
    }

    w1 = a; w2 = b; w3 = c;
    apply();
  });

  window.addEventListener("mouseup", () => {
    if (!active) return;
    active = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  });
})();

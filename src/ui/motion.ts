// Animaciones que dependen de JavaScript.
// Si el usuario pidió "reducir movimiento" en su sistema, se desactivan.
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!reduceMotion && "IntersectionObserver" in window) {
  document.documentElement.classList.add("motion");
}

const observer =
  "IntersectionObserver" in window
    ? new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              observer?.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
      )
    : null;

// Hace aparecer suavemente los elementos con [data-reveal] cuando entran en pantalla
export function observeReveal(root: ParentNode) {
  root.querySelectorAll("[data-reveal]:not(.is-visible)").forEach((el) => {
    if (observer) observer.observe(el);
    else el.classList.add("is-visible");
  });
}

// Una bolita dorada vuela desde el botón hasta el pedido
export function flyToCart(from: HTMLElement): Promise<void> {
  const target = [...document.querySelectorAll<HTMLElement>(".header-cart, .cart-bar")].find(
    (el) => el.getClientRects().length > 0, // el que está visible en esta pantalla
  );
  if (reduceMotion || !target) return Promise.resolve();

  const a = from.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const start = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
  const end = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  const lift = Math.min(start.y, end.y) - 80; // la curva sube antes de caer

  const dot = document.createElement("span");
  dot.className = "fly-dot";
  dot.style.left = "0";
  dot.style.top = "0";
  document.body.appendChild(dot);

  const at = (x: number, y: number, s: number) => `translate(${x}px, ${y}px) scale(${s})`;
  const animation = dot.animate(
    [
      { transform: at(start.x, start.y, 1), opacity: 1 },
      { transform: at((start.x + end.x) / 2, lift, 1.2), opacity: 1, offset: 0.45 },
      { transform: at(end.x, end.y, 0.4), opacity: 0.6 },
    ],
    { duration: 650, easing: "cubic-bezier(0.4, 0, 0.6, 1)" },
  );

  return animation.finished.then(() => dot.remove()).catch(() => dot.remove());
}

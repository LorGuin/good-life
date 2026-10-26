// Aviso breve que aparece abajo de la pantalla y se va solo
let timer: number | undefined;

export function showToast(message: string, type: "ok" | "error" = "ok") {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.dataset.type = type;
  el.classList.add("visible");
  window.clearTimeout(timer);
  timer = window.setTimeout(() => el!.classList.remove("visible"), 2500);
}

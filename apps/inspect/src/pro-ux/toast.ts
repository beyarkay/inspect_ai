import { el } from "./dom";

let node: HTMLDivElement | null = null;
let timer: number | undefined;

export const toast = (message: string, ms = 2500): void => {
  if (!node) {
    node = el("div", { class: "pro-toast", role: "status" });
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.style.display = "flex";
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    if (node) node.style.display = "none";
  }, ms);
};

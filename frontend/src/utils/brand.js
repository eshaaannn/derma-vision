export const LOGO_CANDIDATES = [
  "/derma-vision-logo.svg",
  "/company-logo.png",
  "/logo.png",
  "/derma-logo.png",
  "/derma.png",
  "/DERMA.png",
];

export function setFavicon(url) {
  let link = document.querySelector("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "icon");
    document.head.appendChild(link);
  }
  const isSvg = String(url).toLowerCase().endsWith(".svg");
  link.setAttribute("type", isSvg ? "image/svg+xml" : "image/png");
  link.setAttribute("href", url);
}

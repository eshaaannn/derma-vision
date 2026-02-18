export const LOGO_CANDIDATES = [
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
  link.setAttribute("type", "image/png");
  link.setAttribute("href", url);
}

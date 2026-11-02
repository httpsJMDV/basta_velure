/**
 * The second lock on a seller's rich text: the server cleans a description too, but anything that can run code in a
 * buyer's or admin's browser should not rely on one check. Same rules as backend/app/Support/SafeHtml.php.
 */
const ALLOWED = new Set([
  'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'UL', 'OL', 'LI',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'DIV', 'SPAN', 'HR', 'IMG',
]);

/** These go with everything inside them. Any other tag that is not allowed is removed and its text kept. */
const DROPPED = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'APPLET', 'SVG', 'MATH', 'TEMPLATE', 'NOSCRIPT', 'NOEMBED',
  'NOFRAMES', 'FRAME', 'FRAMESET', 'HEAD', 'TITLE', 'META', 'LINK', 'BASE', 'FORM', 'INPUT', 'BUTTON', 'SELECT',
  'TEXTAREA', 'AUDIO', 'VIDEO', 'SOURCE', 'TRACK', 'CANVAS', 'XMP', 'PLAINTEXT', 'LISTING',
]);

/** True for a picture in this site's public storage, the only place the editor uploads to. */
function isOwnImage(src: string): boolean {
  try {
    const url = new URL(src, window.location.origin);
    const api = new URL(import.meta.env.VITE_API_URL ?? window.location.origin, window.location.origin);
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && url.host === api.host
      && url.pathname.startsWith('/storage/')
      && !url.pathname.includes('..');
  } catch {
    return false;
  }
}

function cleanChildren(parent: Element): void {
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) continue;
    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.remove();
      continue;
    }
    const el = node as Element;
    const tag = el.tagName.toUpperCase();
    if (DROPPED.has(tag)) {
      el.remove();
      continue;
    }
    cleanChildren(el);
    if (!ALLOWED.has(tag)) {
      el.replaceWith(...Array.from(el.childNodes));
      continue;
    }
    if (tag === 'IMG' && !isOwnImage(el.getAttribute('src') ?? '')) {
      el.remove();
      continue;
    }
    for (const attribute of Array.from(el.attributes)) {
      const keep = tag === 'IMG' && (attribute.name === 'src' || attribute.name === 'alt');
      if (!keep) el.removeAttribute(attribute.name);
    }
  }
}

/** A DOMParser document never loads images or runs scripts, unlike setting innerHTML on a real element. */
function parse(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, 'text/html').body;
}

export function safeHtml(html: string): string {
  const body = parse(html);
  cleanChildren(body);
  return body.innerHTML;
}

/** The text a person would see, read without letting the HTML do anything. */
export function htmlText(html: string): string {
  return parse(html).textContent ?? '';
}

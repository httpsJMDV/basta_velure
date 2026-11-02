<?php

namespace App\Support;

use DOMDocument;
use DOMElement;
use DOMNode;
use DOMText;

/**
 * Cleans the rich text a seller writes before anyone else sees it. A product description is shown as HTML on the buyer
 * and admin pages, so without this a seller could plant a script that runs in their browsers and steals their sign-in.
 *
 * Only the tags the description editor makes survive, with no attributes except an image's address and text. An image
 * must come from this site's own storage, so a description cannot load a tracking picture from somewhere else.
 */
final class SafeHtml
{
    private const ALLOWED = [
        'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'ul', 'ol', 'li',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'div', 'span', 'hr', 'img',
    ];

    /** These go with everything inside them. Any other tag that is not allowed is removed and its text kept. */
    private const DROPPED = [
        'script', 'style', 'iframe', 'object', 'embed', 'applet', 'svg', 'math', 'template', 'noscript', 'noembed',
        'noframes', 'frame', 'frameset', 'head', 'title', 'meta', 'link', 'base', 'form', 'input', 'button', 'select',
        'textarea', 'audio', 'video', 'source', 'track', 'canvas', 'xmp', 'plaintext', 'listing',
    ];

    public static function clean(?string $html): ?string
    {
        // Plain text with no tag in it is shown as text, so it has nothing to clean.
        if ($html === null || ! str_contains($html, '<')) {
            return $html;
        }

        $doc = new DOMDocument('1.0', 'UTF-8');
        $previous = libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="utf-8"?><html><body>' . $html . '</body></html>', LIBXML_NONET | LIBXML_HTML_NODEFDTD);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        $body = $doc->getElementsByTagName('body')->item(0);
        if (! $body) {
            return '';
        }

        self::cleanChildren($body);

        $out = '';
        foreach ($body->childNodes as $child) {
            $out .= $doc->saveHTML($child);
        }

        return trim($out);
    }

    private static function cleanChildren(DOMNode $parent): void
    {
        foreach (iterator_to_array($parent->childNodes) as $node) {
            if ($node instanceof DOMText && $node->nodeType === XML_TEXT_NODE) {
                continue;
            }
            if (! $node instanceof DOMElement) {
                // Comments, CDATA and processing instructions.
                $parent->removeChild($node);

                continue;
            }

            $tag = strtolower($node->tagName);
            if (in_array($tag, self::DROPPED, true)) {
                $parent->removeChild($node);

                continue;
            }

            self::cleanChildren($node);

            if (! in_array($tag, self::ALLOWED, true)) {
                while ($node->firstChild) {
                    $parent->insertBefore($node->firstChild, $node);
                }
                $parent->removeChild($node);

                continue;
            }

            if ($tag === 'img' && ! self::isOwnImage($node->getAttribute('src'))) {
                $parent->removeChild($node);

                continue;
            }

            foreach (iterator_to_array($node->attributes) as $attribute) {
                $keep = $tag === 'img' && in_array(strtolower($attribute->name), ['src', 'alt'], true);
                if (! $keep) {
                    $node->removeAttributeNode($attribute);
                }
            }
        }
    }

    /** True for a picture in this site's public storage, the only place the editor uploads to. */
    private static function isOwnImage(string $src): bool
    {
        $parts = parse_url(trim($src));
        if ($parts === false || ! str_starts_with($parts['path'] ?? '', '/storage/') || str_contains($parts['path'], '..')) {
            return false;
        }
        if (! isset($parts['host'])) {
            return ! isset($parts['scheme']) && ! str_starts_with(trim($src), '//');
        }

        return in_array($parts['scheme'] ?? '', ['http', 'https'], true)
            && strtolower($parts['host']) === strtolower((string) parse_url((string) config('app.url'), PHP_URL_HOST));
    }
}

// Loved-IT's own icons for the catalog pages: one drawing style (20×20 grid, 1.6 strokes, round ends) with a soft
// filled shape behind the line work, so they read as a set instead of a mix from icon packs.
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

function Base({ children, className = 'w-4 h-4', ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" className={className} {...rest}>
      {children}
    </svg>
  );
}

/** The category tree: one parent branching into its sub-categories. */
export function IconTaxonomy(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="7.25" y="2.5" width="5.5" height="4.5" rx="1.4" fill="currentColor" fillOpacity={0.14} />
      <path d="M10 7v3M4.5 13v-1.6a1.4 1.4 0 0 1 1.4-1.4h8.2a1.4 1.4 0 0 1 1.4 1.4V13M10 10v3" />
      <rect x="2.5" y="13" width="4" height="4.5" rx="1.2" />
      <rect x="8" y="13" width="4" height="4.5" rx="1.2" />
      <rect x="13.5" y="13" width="4" height="4.5" rx="1.2" />
    </Base>
  );
}

/** A sub-category: a branch from its parent ending in a node. */
export function IconSubcategory(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 3v7.5a2 2 0 0 0 2 2h3" />
      <rect x="10" y="9.5" width="7.5" height="6" rx="1.6" fill="currentColor" fillOpacity={0.14} />
      <circle cx="5" cy="3.5" r="1" fill="currentColor" stroke="none" />
    </Base>
  );
}

/** Products: a shipping box. */
export function IconProducts(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10 2.75 16.5 6v8L10 17.25 3.5 14V6L10 2.75Z" fill="currentColor" fillOpacity={0.12} />
      <path d="M3.5 6 10 9.25 16.5 6M10 9.25v8M6.75 4.4l6.5 3.25" />
    </Base>
  );
}

/** FDA rule: a shield with a check. */
export function IconFda(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10 2.5 16 4.8v4.6c0 3.6-2.5 6.6-6 8.1-3.5-1.5-6-4.5-6-8.1V4.8L10 2.5Z" fill="currentColor" fillOpacity={0.14} />
      <path d="m7.25 10 1.9 1.9 3.6-3.8" />
    </Base>
  );
}

/** Commission: a price tag with a percent sign. */
export function IconCommission(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10.6 2.75h5.15a1.5 1.5 0 0 1 1.5 1.5V9.4a1.5 1.5 0 0 1-.44 1.06l-6.35 6.35a1.5 1.5 0 0 1-2.12 0L3.2 11.67a1.5 1.5 0 0 1 0-2.12l6.35-6.36a1.5 1.5 0 0 1 1.06-.44Z" fill="currentColor" fillOpacity={0.12} />
      <path d="m8.4 12.6 3.9-3.9" />
      <circle cx="8.9" cy="9.1" r=".9" fill="currentColor" stroke="none" />
      <circle cx="11.8" cy="12.2" r=".9" fill="currentColor" stroke="none" />
    </Base>
  );
}

/** Hidden from shoppers (an inactive category). */
export function IconHidden(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 3l14 14" />
      <path d="M8.2 5.1A7.7 7.7 0 0 1 10 4.9c4.4 0 7 4.1 7.5 5.1-.25.5-1 1.75-2.3 2.95M5.3 6.6C3.85 7.75 2.8 9.4 2.5 10c.5 1 3.1 5.1 7.5 5.1 1.4 0 2.6-.4 3.6-1" />
      <path d="M8.3 8.4a2.4 2.4 0 0 0 3.3 3.3" />
    </Base>
  );
}

/** Edit: a pencil. */
export function IconEdit(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12.9 3.6a1.9 1.9 0 0 1 2.7 2.7L7 14.9l-3.5.9.9-3.5 8.5-8.7Z" fill="currentColor" fillOpacity={0.12} />
      <path d="m11.5 5 3.5 3.5" />
    </Base>
  );
}

/** Delete: a bin with its lid. */
export function IconDelete(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" />
      <path d="M5 5.5l.8 10.1A1.5 1.5 0 0 0 7.3 17h5.4a1.5 1.5 0 0 0 1.5-1.4L15 5.5" fill="currentColor" fillOpacity={0.12} />
      <path d="M8.5 9v4.5M11.5 9v4.5" />
    </Base>
  );
}

/** Add: a plus. */
export function IconAdd(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10 4.5v11M4.5 10h11" />
    </Base>
  );
}

/** Locked: the catch-all "Others" cannot be removed. */
export function IconLock(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4" y="8.5" width="12" height="8.5" rx="2" fill="currentColor" fillOpacity={0.14} />
      <path d="M6.75 8.5V6.5a3.25 3.25 0 0 1 6.5 0v2M10 12v1.75" />
    </Base>
  );
}

/** Search: a magnifier. */
export function IconSearch(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="8.75" cy="8.75" r="5.25" fill="currentColor" fillOpacity={0.1} />
      <path d="m16.5 16.5-3.9-3.9" />
    </Base>
  );
}

/** Open in the store: an arrow leaving a frame. */
export function IconOpenInStore(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8.5 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16h9a1.5 1.5 0 0 0 1.5-1.5v-3" />
      <path d="M11.5 3.5h5v5M16.25 3.75 9.5 10.5" />
    </Base>
  );
}

/** A photo: a framed picture with a hill and a sun. */
export function IconPhoto(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="2.75" y="4" width="14.5" height="12" rx="2" fill="currentColor" fillOpacity={0.14} />
      <path d="m3.5 14 4-4.25 3 3 2-2 4 3.75" />
      <circle cx="13" cy="7.75" r="1.25" />
    </Base>
  );
}

/** Back to the default: an arrow turning back on itself. */
export function IconRestore(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 10a6 6 0 1 0 1.8-4.3" />
      <path d="M4 3.5v3.25h3.25" />
      <circle cx="10" cy="10" r="1.6" fill="currentColor" stroke="none" fillOpacity={0.5} />
    </Base>
  );
}

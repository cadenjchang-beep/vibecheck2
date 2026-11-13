/**
 * Which parts of the product are built. Navigation, the mode picker and the
 * landing page read this, so the interface never links to a screen that does
 * not exist yet. Flip a flag when its phase lands (see docs/STATUS.md).
 */
export const BUILT = {
  test: true,
  match: true,
  review: true,
  listen: true,
  search: true,
  folders: true,
  classes: false,
  stats: true,
  settings: true,
  upgrade: false,
  ai: false,
} as const;

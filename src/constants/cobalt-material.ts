/**
 * The Post a job page's cobalt material: the lit finish of its primary button (CobaltButton in
 * `@/components/cobalt-ui`), the sheen on chosen surfaces and the cobalt shadow, kept here so every
 * cobalt surface draws from one source. Plain style strings, no React Native import. Pair each image
 * with its solid colour as `backgroundColor` (colors.accent at rest, colors.accentPressed pressed),
 * which shows wherever the image is not drawn.
 */

/** A button lit from above: a lighter cobalt at the top settling into the brand cobalt. */
export const COBALT_LIT = 'linear-gradient(180deg, #2D4DC8 0%, #1C3AA6 100%)';

/** The lit button under the finger, a shade deeper: brand cobalt down to colors.accentPressed. */
export const COBALT_LIT_PRESSED = 'linear-gradient(180deg, #1C3AA6 0%, #142B7F 100%)';

/** Chosen surfaces (chips, the Review ticket, a cobalt radio row): lightest top-left, deepest bottom-right. */
export const COBALT_SHEEN = 'linear-gradient(135deg, #2F55D4 0%, #1C3AA6 55%, #142B7F 100%)';

/** The sheen under the finger, a shade deeper along the same diagonal. */
export const COBALT_SHEEN_PRESSED = 'linear-gradient(135deg, #1C3AA6 0%, #142B7F 100%)';

/** Cobalt floats on a shadow in its own hue, deeper than a neutral M3 elevation. */
export const COBALT_SHADOW = '0px 14px 28px rgba(28, 58, 166, 0.30), 0px 4px 10px rgba(20, 43, 127, 0.18)';

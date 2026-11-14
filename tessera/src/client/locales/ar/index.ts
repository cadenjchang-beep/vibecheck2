import common from './common.json';
import home from './home.json';
import nav from './nav.json';

/**
 * Partial catalogue: the app shell and home screen are translated; every other
 * key falls back to English until it is translated.
 */
const ar = { common, home, nav };
export default ar;

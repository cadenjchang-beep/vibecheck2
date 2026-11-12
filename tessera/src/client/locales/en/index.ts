import auth from './auth.json';
import common from './common.json';
import editor from './editor.json';
import errors from './errors.json';
import landing from './landing.json';
import nav from './nav.json';
import onboarding from './onboarding.json';
import print from './print.json';
import sets from './sets.json';
import stages from './stages.json';
import subjects from './subjects.json';

/** English is the source catalogue: every key must exist here. */
const en = { common, nav, auth, onboarding, errors, landing, sets, editor, subjects, stages, print };
export default en;

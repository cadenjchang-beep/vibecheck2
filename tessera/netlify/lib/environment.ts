// Applies what this Netlify deploy implies (see src/server/platform/netlify.ts)
// before any server module reads its settings. Import it first.
import { applyNetlifyDefaults } from '../../src/server/platform/netlify';
import deploy from '../generated/deploy.json' with { type: 'json' };

applyNetlifyDefaults(process.env, deploy);

/** The built index.html, used to render public set pages. */
export const indexHtml: string = deploy.indexHtml;

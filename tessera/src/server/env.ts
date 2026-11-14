import { parseEnv } from './config';

/** The validated configuration of this process. Rules live in config.ts. */
export const env = parseEnv(process.env);
export type Env = typeof env;

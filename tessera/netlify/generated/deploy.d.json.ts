// Shape of deploy.json, which scripts/netlify-build.ts writes on every build.
declare const deploy: {
  context: string;
  url: string;
  deployUrl: string;
  commit: string;
  previewSecret: string;
  indexHtml: string;
};
export default deploy;

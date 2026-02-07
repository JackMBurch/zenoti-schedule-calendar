/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required so Turbopack doesn't bundle packages that use dynamic path resolution.
  // In dev, bundling `tesseract.js` can cause missing internal worker-script modules.
  serverExternalPackages: ['tesseract.js', 'tesseract.js-core', 'sharp'],
};

module.exports = nextConfig;

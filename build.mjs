/**
 * 构建：把 Three.js、场景脚本、样式与全部纹理压进一个 index.html。
 * 产物可双击运行，不需要服务器、CDN 或任何网络请求。
 */
import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = file => readFile(path.join(root, file), 'utf8');

const ASSET_FILES = {
  sun: 'sun.jpg',
  mercury: 'mercury.jpg',
  venus: 'venus-atmosphere.jpg',
  earthDay: 'earth-day.jpg',
  earthNight: 'earth-night.jpg',
  earthClouds: 'earth-clouds.jpg',
  moon: 'moon.jpg',
  mars: 'mars.jpg',
  jupiter: 'jupiter.jpg',
  saturn: 'saturn.jpg',
  saturnRings: 'saturn-rings.png',
  uranus: 'uranus.jpg',
  neptune: 'neptune.jpg',
};

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

async function inlineAssets() {
  const entries = [];
  let bytes = 0;
  for (const [key, file] of Object.entries(ASSET_FILES)) {
    const buffer = await readFile(path.join(root, 'assets', file));
    bytes += buffer.byteLength;
    const mime = MIME[path.extname(file)] || 'application/octet-stream';
    entries.push(`  ${JSON.stringify(key)}: "data:${mime};base64,${buffer.toString('base64')}"`);
  }
  return { script: `window.ORBIT_ASSETS = {\n${entries.join(',\n')}\n};`, bytes };
}

async function bundleJS() {
  const result = await esbuild.build({
    entryPoints: [path.join(root, 'src/universe.js')],
    bundle: true,
    format: 'iife',
    target: ['es2020'],
    minify: true,
    write: false,
    legalComments: 'none',
    logLevel: 'warning',
  });
  const code = result.outputFiles[0].text;
  return code.replace(/<\/script/gi, '<\\/script');
}

async function minifyCSS() {
  const css = await read('src/style.css');
  const result = await esbuild.transform(css, { loader: 'css', minify: true });
  return result.code;
}

async function main() {
  const args = process.argv.slice(2);
  const standalone = args.includes('--standalone');
  const outIndex = args.indexOf('--out');
  const outFile = outIndex >= 0 ? args[outIndex + 1] : 'index.html';

  const [shellSource, css, js, assets] = await Promise.all([
    read('src/shell.html'),
    minifyCSS(),
    bundleJS(),
    inlineAssets(),
  ]);

  let shell = shellSource;
  if (standalone) {
    shell = shell.replace(
      '<script>/* INLINE_JS */</script>',
      '<script>window.ORBIT_CONFIG = { standalone: true };</script>\n  <script>/* INLINE_JS */</script>'
    );
  }

  let html = shell
    .replace('/* INLINE_CSS */', () => css)
    .replace('/* INLINE_JS */', () => js)
    .replace('/* INLINE_ASSETS */', () => assets.script);

  if (html.includes('/* INLINE_')) {
    throw new Error('仍有占位符未被替换');
  }

  const output = path.resolve(root, outFile);
  await writeFile(output, html, 'utf8');
  const info = await stat(output);
  console.log(`${path.relative(root, output)}  ${(info.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  纹理原始体积 ${(assets.bytes / 1024 / 1024).toFixed(2)} MB`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

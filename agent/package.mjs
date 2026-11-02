// Builds the installable tool into web/public, so the site itself hosts it: npx -y <site>/secondeyes-agent.tgz
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(out);

await build({
  entryPoints: [join(here, 'index.mjs')],
  outfile: join(out, 'secondeyes-agent.mjs'),
  bundle: true,
  minify: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __cr } from 'node:module';const require = __cr(import.meta.url);" },
});

writeFileSync(
  join(out, 'package.json'),
  JSON.stringify({ name: 'secondeyes-agent', version: '0.1.0', type: 'module', license: 'MIT', bin: { 'secondeyes-agent': 'secondeyes-agent.mjs' }, files: ['secondeyes-agent.mjs'], engines: { node: '>=20' } }, null, 2),
);

// npm on Windows needs its .cmd run through a shell.
const name = execFileSync('npm pack --silent', { cwd: out, shell: true, encoding: 'utf8' }).trim().split('\n').pop();
copyFileSync(join(out, name), join(here, '..', 'web', 'public', 'secondeyes-agent.tgz'));
console.log('built web/public/secondeyes-agent.tgz');

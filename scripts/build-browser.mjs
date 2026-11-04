import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  symlinkSync,
  mkdtempSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, fingerprintRepository } from '../src/verification.mjs';
import { runtimeArtifactMatches } from '../src/artifact-integrity.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ui = join(root, 'reference-repos/swagger-ui'),
  sdk = join(root, 'reference-repos/swagger-client');
const binding = JSON.parse(readFileSync(join(root, 'evidence/runs/sdk-artifact-binding.json')));
const manifestBytes = readFileSync(join(root, 'case.json')),
  manifest = JSON.parse(manifestBytes);
const baseRevision = (id) => manifest.repositories.find((r) => r.id === id).commit;
if (
  !runtimeArtifactMatches({
    installed: join(ui, 'node_modules/swagger-client'),
    packageRoot: join(root, binding.packageRoot),
    dependencies: join(sdk, 'node_modules'),
    expectedFingerprint: binding.runtimeFingerprint,
  })
)
  throw Error('SDK artifact is not currently bound');
const source = fingerprintRepository(ui),
  sdkSource = fingerprintRepository(sdk);
const cache = join(root, '.cache/browser');
mkdirSync(cache, { recursive: true });
function snapshot(repository, label, revision) {
  const directory = mkdtempSync(join(cache, label));
  const archive = execFileSync('git', ['-C', repository, 'archive', revision], {
    maxBuffer: 100 * 1024 * 1024,
  });
  execFileSync('tar', ['-xf', '-', '-C', directory], { input: archive });
  symlinkSync(join(repository, 'node_modules'), join(directory, 'node_modules'), 'dir');
  return directory;
}
const baseline = snapshot(ui, 'ui-original-', baseRevision('ui'));
const baseSdk = snapshot(sdk, 'sdk-original-', baseRevision('sdk'));
for (const [original, current] of [
  [baseline, ui],
  [baseSdk, sdk],
]) {
  if (
    digest(readFileSync(join(original, 'package-lock.json'))) !==
    digest(readFileSync(join(current, 'package-lock.json')))
  )
    throw Error(
      'Baseline dependency lock differs; a separate locked installation is required, not shared changed dependencies'
    );
}
let sdkBuildLog = '';
for (const target of ['build:es', 'build:commonjs'])
  sdkBuildLog += execFileSync(join(dirname(process.execPath), 'npm'), ['run', target], {
    cwd: baseSdk,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      PATH: dirname(process.execPath) + ':' + process.env.PATH,
      HUSKY: '0',
      SCARF_ANALYTICS: 'false',
      NPM_CONFIG_UPDATE_NOTIFIER: 'false',
    },
  });
writeFileSync(join(cache, 'base-sdk-build.log'), sdkBuildLog);
process.env.NODE_ENV = 'production';
process.env.BABEL_ENV = 'production';
process.env.BROWSERSLIST_ENV = 'browser-production';
const requireUI = createRequire(join(ui, 'package.json')),
  webpack = requireUI('webpack');
const outputs = [];
for (const [variant, directory, sdkPackage] of [
  ['neither-fixed', baseline, baseSdk],
  ['sdk-only', baseline, join(root, binding.packageRoot)],
  ['ui-only', ui, baseSdk],
  ['both-fixed', ui, join(root, binding.packageRoot)],
]) {
  process.chdir(directory);
  const requireSource = createRequire(join(directory, 'package.json'));
  const builder = requireSource('./webpack/_config-builder.js');
  const output = join(cache, variant);
  mkdirSync(output, { recursive: true });
  const config = builder(
    { minimize: false, mangle: false, sourcemaps: false, includeDependencies: true },
    {
      context: directory,
      entry: { 'swagger-ui': ['./src/index.js'] },
      output: {
        path: output,
        publicPath: '/',
        library: { name: 'SwaggerUIBundle', export: 'default' },
      },
    }
  );
  if (sdkPackage === baseSdk) config.resolve.alias['swagger-client'] = baseSdk;
  for (const rule of config.module.rules)
    if (rule.loader === 'babel-loader')
      rule.options.configFile = join(directory, 'babel.config.js');
  const stats = await new Promise((ok, no) => {
    const compiler = webpack(config);
    compiler.run((error, stats) =>
      compiler.close((closeError) => (error || closeError ? no(error || closeError) : ok(stats)))
    );
  });
  writeFileSync(
    join(output, 'build.log'),
    stats.toString({ colors: false, all: false, errors: true, warnings: true })
  );
  if (stats.hasErrors())
    throw Error(
      `Browser bundle ${variant} failed: ${stats.toString({ all: false, errors: true })}`
    );
  const json = stats.toJson({ all: false, modules: true, nestedModules: true });
  const resources = [];
  function visit(rows) {
    for (const m of rows || []) {
      if (m.nameForCondition) resources.push(m.nameForCondition);
      visit(m.modules);
    }
  }
  visit(json.modules);
  const sdkModules = resources.filter((p) => p.startsWith(sdkPackage + '/'));
  if (!sdkModules.some((p) => p === join(sdkPackage, 'es/execute/index.js')))
    throw Error('Browser bundle did not consume identified ES execute module');
  outputs.push({
    variant,
    uiSource: directory === baseline ? `tracked revision ${baseRevision('ui')} snapshot` : source,
    sdkSelection:
      sdkPackage === baseSdk
        ? 'fresh compiled tracked HEAD snapshot'
        : 'identified repaired artifact',
    sdkExecuteHash: digest(readFileSync(join(sdkPackage, 'es/execute/index.js'))),
    bundleHash: digest(readFileSync(join(output, 'swagger-ui.js'))),
    sdkModules: [...new Set(sdkModules)],
    directory: output.slice(root.length + 1),
  });
}
// Reuse upstream styling; this is a behavioural fixture, not a new branded interface.
process.chdir(ui);
const style = requireUI('./webpack/stylesheets.js');
style.context = ui;
style.output.path = cache;
const styleStats = await new Promise((ok, no) => {
  const c = webpack(style);
  c.run((e, s) => c.close((x) => (e || x ? no(e || x) : ok(s))));
});
writeFileSync(
  join(cache, 'styles.log'),
  styleStats.toString({ all: false, errors: true, warnings: true })
);
if (styleStats.hasErrors()) throw Error('Stylesheet build failed');
if (source !== fingerprintRepository(ui) || sdkSource !== fingerprintRepository(sdk))
  throw Error('Source changed during browser build');
const baselineCommit = baseRevision('ui');
const report = {
  baselineCommit,
  caseHash: digest(manifestBytes),
  baseSdk: {
    commit: baseRevision('sdk'),
    directory: baseSdk.slice(root.length + 1),
    executeHash: digest(readFileSync(join(baseSdk, 'es/execute/index.js'))),
  },
  styleHash: digest(readFileSync(join(cache, 'swagger-ui.css'))),
  buildScriptHash: digest(readFileSync(fileURLToPath(import.meta.url))),
  recordedAt: new Date().toISOString(),
  uiSourceFingerprint: source,
  sdkSourceFingerprint: sdkSource,
  artifactHash: binding.artifactHash,
  outputs,
  note: 'Four-way fixture matrix. Original UI/SDK are freshly extracted declared base-revision snapshots. Original SDK is compiled with its locked dependency installation and selected by an explicit test-only Webpack alias; live UI dependency links are never retargeted. Actual ES modules/hashes are recorded.',
};
writeFileSync(
  join(root, 'evidence/runs/browser-build.json'),
  JSON.stringify(report, null, 2) + '\n'
);
console.log(JSON.stringify(report, null, 2));

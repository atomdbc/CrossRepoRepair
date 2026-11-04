import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { connectCDP, evaluate, click } from '../src/cdp.mjs';
import { startFixture } from './browser-fixture.mjs';
import { classifyBrowserObservation } from '../src/browser-verification.mjs';
import { digest, fingerprintRepository } from '../src/verification.mjs';
import { runtimeArtifactMatches } from '../src/artifact-integrity.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = JSON.parse(readFileSync(join(root, 'evidence/runs/browser-build.json')));
const binding = JSON.parse(readFileSync(join(root, 'evidence/runs/sdk-artifact-binding.json')));
const contractBytes = readFileSync(join(root, 'browser-contract.json')),
  contract = JSON.parse(contractBytes);
const sourceInputs = () => ({
  sdk: fingerprintRepository(join(root, 'reference-repos/swagger-client')),
  ui: fingerprintRepository(join(root, 'reference-repos/swagger-ui')),
});
const sources = sourceInputs();
if (
  sources.sdk !== build.sdkSourceFingerprint ||
  sources.ui !== build.uiSourceFingerprint ||
  binding.artifactHash !== build.artifactHash
)
  throw Error('Browser build is stale; rebuild it');
function checkBundleBytes() {
  for (const output of build.outputs)
    if (digest(readFileSync(join(root, output.directory, 'swagger-ui.js'))) !== output.bundleHash)
      throw Error('Browser bundle bytes changed');
  if (digest(readFileSync(join(root, '.cache/browser/swagger-ui.css'))) !== build.styleHash)
    throw Error('Stylesheet bytes changed');
}
checkBundleBytes();
if (
  !runtimeArtifactMatches({
    installed: join(root, 'reference-repos/swagger-ui/node_modules/swagger-client'),
    packageRoot: join(root, binding.packageRoot),
    dependencies: join(root, 'reference-repos/swagger-client/node_modules'),
    expectedFingerprint: binding.runtimeFingerprint,
  })
)
  throw Error('Runtime artifact changed');
const chrome =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(chrome))
  throw Error('Existing Google Chrome required; this command does not download a browser');
const folder = join(root, '.cache/browser');
mkdirSync(folder, { recursive: true });
const profile = mkdtempSync(join(folder, 'profile-'));
const child = spawn(
  chrome,
  [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    'about:blank',
  ],
  { stdio: 'ignore' }
);
const fixture = await startFixture();
let browser, cdp;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const startedAt = new Date().toISOString();
const results = [];
try {
  for (let i = 0; i < 100 && !existsSync(join(profile, 'DevToolsActivePort')); i++)
    await sleep(100);
  const port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  browser = await connectCDP(version.webSocketDebuggerUrl);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  cdp = await connectCDP(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await cdp.call('Page.enable');
  await cdp.call('Runtime.enable');
  await cdp.call('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const exceptions = [];
  cdp.on('Runtime.exceptionThrown', (p) =>
    exceptions.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text)
  );
  for (const variant of contract.variants)
    for (const mode of contract.modes) {
      const start = fixture.requests.length,
        exceptionStart = exceptions.length;
      const url = `${fixture.baseUrl}/?variant=${variant}&mode=${mode}`;
      await cdp.call('Page.navigate', { url });
      let ready = false;
      for (let i = 0; i < 100; i++) {
        await sleep(100);
        if (
          await evaluate(
            cdp,
            `location.href===${JSON.stringify(url)}&&window.fixture?.variant===${JSON.stringify(variant)}&&window.fixture?.mode===${JSON.stringify(mode)}&&document.readyState==='complete'&&!!document.querySelector('.parameters-container')&&!!document.querySelector('button.execute')`
          )
        ) {
          ready = true;
          break;
        }
      }
      await sleep(500);
      if (!ready)
        throw Error(
          'Swagger UI Execute did not render: ' + (await evaluate(cdp, 'document.body.innerText'))
        );
      if (mode === 'encoded-union') {
        await click(cdp, 'textarea');
        await cdp.call('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: 'a',
          code: 'KeyA',
          commands: ['selectAll'],
        });
        await cdp.call('Input.insertText', { text: '["a","b"]' });
        await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA' });
        await sleep(200);
      }
      const parameterValues = await evaluate(
        cdp,
        `window.ui.specSelectors.parameterValues(['/echo','get']).toJS()`
      );
      const before = await evaluate(
        cdp,
        `({body:document.body.innerText,fields:[...document.querySelectorAll('input,textarea')].map(e=>({tag:e.tagName,value:e.value,type:e.type}))})`
      );
      await click(cdp, 'button.execute');
      const observationMs =
        ['neither-fixed', 'sdk-only'].includes(variant) && mode === 'invalid-array' ? 7000 : 1500;
      await sleep(observationMs);
      const after = await evaluate(
        cdp,
        `(()=>{const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none';return {body:document.body.innerText,loading:visible(document.querySelector('.loading-container')),errors:[...document.querySelectorAll('.validation-errors,.errors-wrapper,.parameter__error')].filter(visible).map(e=>e.innerText)}})()`
      );
      const screenshot = await cdp.call('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      });
      const screenshotBytes = Buffer.from(screenshot.data, 'base64'),
        screenshotPath = `evidence/runs/browser-${variant}-${mode}.png`;
      writeFileSync(join(root, screenshotPath), screenshotBytes);
      results.push({
        screenshotPath,
        screenshotHash: digest(screenshotBytes),
        variant,
        mode,
        interaction:
          mode === 'encoded-union'
            ? 'Real browser text entry and mouse Execute'
            : 'Real browser mouse Execute',
        parameterValues,
        observationMs,
        before,
        after,
        requests: fixture.requests.slice(start),
        exceptions: exceptions.slice(exceptionStart),
      });
      Object.assign(results.at(-1), classifyBrowserObservation(results.at(-1)));
      console.log(
        JSON.stringify({
          variant,
          mode,
          passed: results.at(-1).passed,
          classification: results.at(-1).classification,
        })
      );
    }
  checkBundleBytes();
  if (JSON.stringify(sources) !== JSON.stringify(sourceInputs()))
    throw Error('Sources changed during browser checks');
  const expectedCount = contract.variants.length * contract.modes.length;
  const allPassed = results.length === expectedCount && results.every((r) => r.passed);
  const report = {
    startedAt: startedAt,
    recordedAt: new Date().toISOString(),
    browser: version.Browser,
    sourceFingerprints: sources,
    artifactHash: binding.artifactHash,
    contractHash: digest(contractBytes),
    buildReportHash: digest(readFileSync(join(root, 'evidence/runs/browser-build.json'))),
    harnessHash: digest(
      Buffer.concat(
        [
          'scripts/check-browser.mjs',
          'scripts/browser-fixture.mjs',
          'src/cdp.mjs',
          'src/browser-verification.mjs',
        ].map((p) => readFileSync(join(root, p)))
      )
    ),
    candidatePassed: results.filter((r) => r.variant === 'both-fixed').every((r) => r.passed),
    allPassed,
    results,
    limitations: contract.limits,
  };
  writeFileSync(
    join(root, 'evidence/runs/browser-observations.json'),
    JSON.stringify(report, null, 2) + '\n'
  );
  process.exitCode = allPassed ? 0 : 1;
} finally {
  cdp?.close();
  if (browser) {
    try {
      await browser.call('Browser.close');
    } catch {}
    browser.close();
  } else child.kill('SIGTERM');
  await new Promise((r) => fixture.server.close(r));
}

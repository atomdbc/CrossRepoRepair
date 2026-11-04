import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fingerprintPackage, runtimeArtifactMatches } from '../src/artifact-integrity.mjs';
test('artifact hashing detects changes outside the execute entry point', () => {
  const root=mkdtempSync(join(tmpdir(),'crossrepo-artifact-'));
  try { writeFileSync(join(root,'helper.js'),'original');const before=fingerprintPackage(root);writeFileSync(join(root,'helper.js'),'changed');assert.notEqual(fingerprintPackage(root),before); } finally { rmSync(root,{recursive:true,force:true}); }
});
test('an intact archive identity cannot hide a retargeted UI dependency', () => {
  const root=mkdtempSync(join(tmpdir(),'crossrepo-link-'));
  try {
    const pkg=join(root,'package'),deps=join(root,'dependencies'),other=join(root,'other');
    for(const d of [pkg,deps,other])mkdirSync(d);writeFileSync(join(pkg,'package.json'),'{}');symlinkSync(deps,join(pkg,'node_modules'),'dir');
    const args={installed:pkg,packageRoot:pkg,dependencies:deps,expectedFingerprint:fingerprintPackage(pkg)};
    assert.equal(runtimeArtifactMatches(args),true);assert.equal(runtimeArtifactMatches({...args,installed:other}),false);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

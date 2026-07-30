import assert from 'node:assert/strict';
import {access, readFile} from 'node:fs/promises';

const requiredFiles = [
  'AGENTS.md',
  'LICENSE',
  'README.md',
  'schemas/demo-v1.schema.json',
  'schemas/compiled-demo-v1.schema.json',
  'src/contracts/types.ts',
  'src/cli/doctor.ts',
  'src/cli/validate.ts',
  'src/cli/compile.ts',
  'src/cli/render.ts',
  'src/cli/generate.ts',
  '.github/workflows/ci.yml',
];

await Promise.all(requiredFiles.map((path) => access(path)));

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
assert.deepEqual(Object.keys(packageJson.scripts).sort(), [
  'compile',
  'doctor',
  'generate',
  'render',
  'test',
  'test:repo',
  'test:unit',
  'typecheck',
  'validate',
]);
assert.equal(packageJson.engines.node, '>=20.18');
assert.equal(packageJson.license, 'MIT');

const sourceSchema = JSON.parse(await readFile('schemas/demo-v1.schema.json', 'utf8'));
const compiledSchema = JSON.parse(await readFile('schemas/compiled-demo-v1.schema.json', 'utf8'));
assert.equal(sourceSchema.properties.schemaVersion.const, 'demo-v1');
assert.equal(compiledSchema.properties.schemaVersion.const, 'compiled-demo-v1');

console.log(`Repository gates passed (${requiredFiles.length} required files, 2 frozen schemas).`);

// Contributor-only build. Runtime uses the checked-in plain JavaScript.
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const upstream = path.join(root, 'vendor/tesserae');
const check = process.argv.includes('--check');
if (ts.version !== '5.8.3') throw new Error('Use the lockfile-pinned TypeScript 5.8.3');
const sources = ['types.ts', ...fs.readdirSync(path.join(upstream, 'src/engine'))
  .filter(n => n.endsWith('.ts') && !n.endsWith('.test.ts')).sort().map(n => `engine/${n}`)];
for (const relative of sources) {
  const source = fs.readFileSync(path.join(upstream, 'src', relative), 'utf8');
  const result = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020,
    newLine: ts.NewLineKind.LineFeed, removeComments: false,
  }, fileName: relative, reportDiagnostics: true });
  const errors = result.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
    getCurrentDirectory: () => root, getCanonicalFileName: f => f, getNewLine: () => '\n',
  }));
  // Upstream uses extensionless relative imports. Native Node ESM requires .js.
  const output = result.outputText.replace(/(from\s+["'])(\.{1,2}\/[^"']+)(["'])/g,
    (_, before, specifier, after) => `${before}${specifier.endsWith('.js') ? specifier : specifier + '.js'}${after}`);
  const destination = path.join(upstream, 'dist', relative.replace(/\.ts$/, '.js'));
  if (check) {
    if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== output)
      throw new Error(`Generated file differs: ${destination}`);
  } else {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, output);
  }
}
const packagePath = path.join(upstream, 'dist/package.json');
const packageText = '{"type":"module","private":true}\n';
if (check) {
  if (fs.readFileSync(packagePath, 'utf8') !== packageText) throw new Error('ESM metadata differs');
} else fs.writeFileSync(packagePath, packageText);
console.log(JSON.stringify({ modules: sources.length, mode: check ? 'verified' : 'generated',
  compiler: ts.version, type_checked: false, note: 'Transpilation only; runtime probes are separate.' }));

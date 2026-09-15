import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runInNewContext } from 'node:vm'

// Exercise the shared forms/email entry points without compiling the application
// or requiring a database. Use the same Webpack and external resolver as Next.
const root = process.cwd()
const web = path.join(root, 'apps/web')
const require = createRequire(path.join(web, 'package.json'))
const nextRequire = createRequire(require.resolve('next/package.json'))
const { webpack } = require('next/dist/compiled/webpack/webpack')
const { makeExternalHandler } = require('next/dist/build/handle-externals')
await require('next/dist/build/swc').loadBindings()
const scratch = await mkdtemp(path.join(tmpdir(), 'uvanoo-sanitizer-boundary-'))
const entry = path.join(scratch, 'entry.js')
await writeFile(
  entry,
  `
export { htmlToText, sanitizeDocumentHtml } from ${JSON.stringify(path.join(root, 'packages/forms-core/src/index.ts'))};
export { sanitizeEmailHtml, renderTemplate } from ${JSON.stringify(path.join(root, 'packages/email-render/src/index.ts'))};
`,
)

async function compile(target) {
  const server = target === 'node'
  const handleExternals = makeExternalHandler({
    config: { experimental: { esmExternals: true }, bundlePagesRouterDependencies: false },
    optOutBundlingPackageRegex: /[/\\]node_modules[/\\](isomorphic-dompurify|jsdom|canvas)[/\\]/,
    transpiledPackages: [],
    dir: web,
  })
  const compiler = webpack({
    mode: 'production',
    context: web,
    target: server ? 'node24' : 'web',
    entry,
    devtool: false,
    cache: false,
    experiments: { layers: true },
    output: {
      path: path.join(scratch, target),
      filename: 'boundary.cjs',
      library: { type: 'commonjs2' },
    },
    optimization: { minimize: false, concatenateModules: false },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.json'],
      alias: { '@swc/helpers': path.dirname(nextRequire.resolve('@swc/helpers/package.json')) },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: {
            loader: require.resolve('next/dist/build/webpack/loaders/next-swc-loader'),
            options: { isServer: server, rootDir: root, nextConfig: {} },
          },
        },
      ],
    },
    externals: server
      ? [
          ({ context, request, dependencyType, getResolve }) =>
            handleExternals(context, request, dependencyType, 'ssr', (options) => {
              const resolve = getResolve(options)
              return (from, name) =>
                new Promise((accept, reject) => {
                  resolve(from, name, (error, result, data) => {
                    if (error) return reject(error)
                    const esm =
                      /\.mjs$/i.test(result ?? '') ||
                      (/\.js$/i.test(result ?? '') && data?.descriptionFileData?.type === 'module')
                    accept([result || null, esm])
                  })
                })
            }),
        ]
      : [],
  })
  try {
    const stats = await new Promise((resolve, reject) =>
      compiler.run((error, stats) => (error ? reject(error) : resolve(stats))),
    )
    const result = stats.toJson({ all: false, errors: true, modules: true, nestedModules: true })
    assert.equal(
      stats.hasErrors(),
      false,
      `${target} dependency compilation failed:\n${result.errors?.map((error) => error.message).join('\n')}`,
    )
    const modules = JSON.stringify(result.modules)
    assert.doesNotMatch(
      modules,
      /node_modules[\\/]+(?:jsdom|canvas)[\\/]/,
      `${target} bundled a Node DOM/native canvas implementation`,
    )
    if (server) {
      assert.match(
        modules,
        /external .*isomorphic-dompurify/,
        'SSR must load the Node sanitizer at runtime',
      )
    } else {
      assert.match(
        modules,
        /isomorphic-dompurify.*browser\.mjs/,
        'Browser must select the browser sanitizer export',
      )
      assert.doesNotMatch(
        modules,
        /external .*isomorphic-dompurify/,
        'Browser sanitizer must be included, not externalized',
      )
    }
    console.log(`PASS ${target}: shared forms/email graph has the correct sanitizer boundary`)
    return path.join(scratch, target, 'boundary.cjs')
  } finally {
    await new Promise((resolve, reject) =>
      compiler.close((error) => (error ? reject(error) : resolve())),
    )
  }
}

try {
  const browserBundle = await compile('web')
  const serverBundle = await compile('node')
  await symlink(path.join(web, 'node_modules'), path.join(scratch, 'node_modules'), 'dir')
  const { JSDOM } = require('jsdom')
  const dom = new JSDOM('<!DOCTYPE html>')
  try {
    for (const [target, bundle] of [
      ['web', browserBundle],
      ['node', serverBundle],
    ]) {
      const module = { exports: {} }
      if (target === 'node') module.exports = await require(bundle)
      else
        runInNewContext(await readFile(bundle, 'utf8'), {
          module,
          exports: module.exports,
          ...(target === 'web'
            ? { window: dom.window, document: dom.window.document }
            : { require }),
        })
      const { htmlToText, sanitizeDocumentHtml, sanitizeEmailHtml, renderTemplate } = module.exports
      assert.equal(htmlToText('<p>One &amp; two</p><p>Three<br>Four</p>'), 'One & two\nThree\nFour')
      const clean = sanitizeDocumentHtml(
        '<p onclick="alert(1)" style="color:#334155">Safe</p><script>alert(1)</script><img src="https://tracker.example/pixel">',
      )
      assert.match(clean, /Safe/)
      assert.doesNotMatch(clean, /onclick|script|alert|tracker/)
      const email =
        '<table style="width:100%;border-collapse:collapse"><tr><td style="padding:24px">Hi</td></tr></table>'
      const before = sanitizeEmailHtml(email)
      sanitizeDocumentHtml('<p style="position:fixed">Document</p>')
      assert.equal(sanitizeEmailHtml(email), before)
      assert.match(before, /padding:24px/)
      assert.equal(typeof renderTemplate, 'function')
      console.log(
        `PASS ${target}: compiled helpers retain text, XSS protection, and independent email styling`,
      )
    }
  } finally {
    dom.window.close()
  }
} finally {
  await rm(scratch, { recursive: true, force: true })
}

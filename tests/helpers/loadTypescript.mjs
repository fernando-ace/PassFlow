import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
import ts from 'typescript'

// Run production TS processors with injected models, without adding a test runtime dependency.
export async function loadTypescript(relative) {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const cache = new Map()
  async function compile(path) {
    if (cache.has(path)) return cache.get(path)
    let code = ts.transpileModule(await readFile(path, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
    }).outputText
    const imports = [...code.matchAll(/from ['"]([^'"]+)['"]/g)]
    for (const match of imports) {
      const specifier = match[1]
      if (!specifier.startsWith('.') && !specifier.startsWith('@/')) continue
      const base = specifier.startsWith('@/') ? resolve(root, specifier.slice(2)) : resolve(dirname(path), specifier)
      const file = [base, `${base}.ts`, `${base}.mjs`].find((candidate) => existsSync(candidate))
      if (!file) throw new Error(`Unresolved production import: ${specifier}`)
      const url = file.endsWith('.ts') ? await compile(file) : pathToFileURL(file).href
      code = code.replace(match[0], `from '${url}'`)
    }
    const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
    cache.set(path, url)
    return url
  }
  return import(await compile(resolve(root, relative)))
}

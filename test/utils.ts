import path from 'node:path'

import { TSESLint } from '@typescript-eslint/utils'
import type { TSESTree } from '@typescript-eslint/utils'
import type { RuleTester as ESLintRuleTester } from 'eslint'
import eslintPkg from 'eslint/package.json'
import semver from 'semver'
import typescriptPkg from 'typescript/package.json'

import type { PluginSettings, RuleContext } from 'eslint-plugin-import-x/types'
import type { RuleModuleWithCustomMeta } from 'eslint-plugin-import-x/utils'

// warms up the module cache. this import takes a while (>500ms)
import '@babel/eslint-parser'

export const parsers = {
  ESPREE: require.resolve('espree'),
  TS: require.resolve('@typescript-eslint/parser'),
  BABEL: require.resolve('@babel/eslint-parser'),
}

export function tsVersionSatisfies(specifier: string) {
  return semver.satisfies(typescriptPkg.version, specifier)
}

export function typescriptEslintParserSatisfies(specifier: string) {
  return semver.satisfies(
    require('@typescript-eslint/parser/package.json').version,
    specifier,
  )
}

export const FIXTURES_PATH = path.resolve('test/fixtures')

export function testFilePath(relativePath = 'foo.js') {
  return path.resolve(FIXTURES_PATH, relativePath)
}

export function getNonDefaultParsers() {
  return [parsers.TS, parsers.BABEL] as const
}

export const TEST_FILENAME = testFilePath()

export function eslintVersionSatisfies(specifier: string) {
  return semver.satisfies(eslintPkg.version, specifier)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- simplify testing
export type ValidTestCase = TSESLint.ValidTestCase<any> & {
  errors?: readonly InvalidTestCaseError[] | number
}

export type InvalidTestCase = // eslint-disable-next-line @typescript-eslint/no-explicit-any -- simplify testing
  TSESLint.InvalidTestCase<any, readonly any[]>

export function testVersion<T extends ValidTestCase>(
  specifier: string,
  t: () => T,
): T extends { errors: readonly InvalidTestCaseError[] }
  ? InvalidTestCase[]
  : ValidTestCase[] {
  // @ts-expect-error -- simplify testing
  return eslintVersionSatisfies(specifier) ? [test(t())] : []
}

export type InvalidTestCaseError =
  | string
  | InvalidTestCase['errors'][number]
  | (ESLintRuleTester.TestCaseError & {
      type?: `${TSESTree.AST_NODE_TYPES}`
    })

// eslint-disable-next-line eslint-plugin/require-meta-docs-description, eslint-plugin/require-meta-type, eslint-plugin/prefer-message-ids, eslint-plugin/prefer-object-rule, eslint-plugin/require-meta-schema
export function test<T extends ValidTestCase>(
  t: T,
): T extends { errors: InvalidTestCaseError[] | number }
  ? InvalidTestCase
  : ValidTestCase {
  if (arguments.length !== 1) {
    throw new SyntaxError('`test` requires exactly one object argument')
  }
  // @ts-expect-error -- simplify testing
  return {
    filename: TEST_FILENAME,
    ...t,
    parserOptions: {
      sourceType: 'module',
      ecmaVersion: 9,
      ...t.parserOptions,
    },
  }
}

export function testContext(settings?: PluginSettings) {
  return {
    physicalFilename: TEST_FILENAME,
    settings: settings || {},
  } as RuleContext
}

/**
 * to be added as valid cases just to ensure no nullable fields are going
 * to crash at runtime
 */
export const SYNTAX_CASES = [
  test({ code: 'for (let { foo, bar } of baz) {}' }),
  test({ code: 'for (let [ foo, bar ] of baz) {}' }),

  test({ code: 'const { x, y } = bar' }),
  test({ code: 'const { x, y, ...z } = bar', parser: parsers.BABEL }),

  // all the exports
  test({ code: 'let x; export { x }' }),
  test({ code: 'let x; export { x as y }' }),

  // not sure about these since they reference a file
  // test({ code: 'export { x } from "./y.js"'}),
  // test({ code: 'export * as y from "./y.js"', parser: parsers.BABEL}),

  test({ code: 'export const x = null' }),
  test({ code: 'export var x = null' }),
  test({ code: 'export let x = null' }),

  test({ code: 'export default x' }),
  test({ code: 'export default class x {}' }),

  // issue #267: parser opt-in extension list
  test({
    code: 'import json from "./data.json"',
    settings: { 'import-x/extensions': ['.js'] }, // breaking: remove for v2
  }),

  // JSON
  test({
    code: 'import foo from "./foobar.json";',
    settings: { 'import-x/extensions': ['.js'] }, // breaking: remove for v2
  }),
  test({
    code: 'import foo from "./foobar";',
    settings: { 'import-x/extensions': ['.js'] }, // breaking: remove for v2
  }),

  // issue #370: deep commonjs import
  test({
    code: 'import { foo } from "./issue-370-commonjs-namespace/bar"',
    settings: { 'import-x/ignore': ['foo'] },
  }),

  // issue #348: deep commonjs re-export
  test({
    code: 'export * from "./issue-370-commonjs-namespace/bar"',
    settings: { 'import-x/ignore': ['foo'] },
  }),

  test({
    code: 'import * as a from "./commonjs-namespace/a"; a.b',
  }),

  // ignore invalid extensions
  test({
    code: 'import { foo } from "./ignore.invalid.extension"',
  }),
]

export const testCompiled = process.env.TEST_COMPILED === '1'

export const srcDir = testCompiled ? 'lib' : 'src'

type RuleTesterOptions = {
  parser?: string
} & Omit<TSESLint.RuleTesterConfig, 'parser'>

export class RuleTester extends TSESLint.RuleTester {
  constructor(option: RuleTesterOptions = {}) {
    /**
     * The parser option is required in TSESLint.RuleTester, but not in ESLint.RuleTester.
     * Since TSESLint.RuleTester is just an alias of ESLint.RuleTester, we can safely ignore the type error.
     */
    // @ts-expect-error -- parser is not required
    super(option)
  }

  /**
   * Since we can't override the original `run` method, we have to create a new one that accepts our custom rule module with custom meta.
   */
  run$<MessageIds extends string, Options extends Readonly<unknown[]>>(
    ruleName: string,
    rule: RuleModuleWithCustomMeta<MessageIds, Options>,
    tests: TSESLint.RunTests<MessageIds, Options>,
  ) {
    const { meta, ...ruleWithoutMeta } = rule
    const { docs, ...metaWithoutDocs } = meta
    const {
      category: _1,
      recommended: _2,
      ...docsWithoutCategoryAndRecommend
    } = docs

    const modifiedRule: Parameters<TSESLint.RuleTester['run']>[1] = {
      ...ruleWithoutMeta,
      meta: {
        ...metaWithoutDocs,
        docs: docsWithoutCategoryAndRecommend,
      },
    }

    return super.run(ruleName, modifiedRule, tests)
  }
}

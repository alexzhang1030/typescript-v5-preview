# TypeScript V5 前瞻

通过这篇[博客](https://devblogs.microsoft.com/typescript/announcing-typescript-5-0-beta/)得知，TypeScript V5 即将发布，那么我们就来看看 TypeScript V5 带来了哪些新特性吧。

## 1. 装饰器

> [原始 PR](https://github.com/microsoft/TypeScript/pull/50820)

装饰器即将成为 ES 标准，所以 TypeScript V5 也落地了符合规范的装饰器。

### 快速预览类方法装饰器

```ts
function loggedMethod<
  This,
  Args extends any[],
  Return,
  Fn extends (this: This, args: Args) => Return,
  >(target: Fn, context: ClassMethodDecoratorContext<This, Fn>) {
  const methodName = String(context.name)
  return function (this: This, ...args: Args): Return {
    console.log(`Into ${methodName}`)
    const result = target.apply(this, args)
    //             ^======================^
    //             调用原始方法 <Person.greet>
    console.log(`Out ${methodName}`)
    return result
  }
}

class Person {
  name: string
  constructor(name: string) {
    this.name = name
  }

  // 直接在 ClassFunction 上使用装饰器
  // 或者也可以 @loggedMethod greet() { 这样
  @loggedMethod
  greet() {
    console.log(`Hello, my name is ${this.name}.`)
  }
}

const p = new Person('Alex')
p.greet()

// 打印如下：
// Into greet
// Hello, my name is Alex
// Out greet
```

TypeScript 提供了一个叫做 `ClassMethodDecoratorContext` 的类型，它为方法装饰器的上下文对象建模。

通过 `context` 属性，我们能拿到一个方法的元数据 `name`, `args`...

```ts
const context = {
  kind: 'method',
  name: 'greet',
  static: false,
  private: false,
  addInitializer: Function,
}
```

### addInitializer

在 `context` 中，存在一个方法 `addInitializer`，它会挂在类的构造函数开始。（当我们在 `static class function` 中使用的时候，则会挂在类本身的初始化上）

举个简单的例子，当我们为了保证类方法在调用时 `this` 为当前类实例时，我们会这样做：

在构造函数中绑定 this：

```ts
class Person {
  constructor(public name: string) {
    this.greet = this.greet.bind(this)
  }

  greet() {
    console.log(`Hello, my name is ${this.name}`)
  }
}

const person = new Person('John')
const greet = person.greet
greet()
```

或者将某个方法使用箭头函数作为属性：

```ts
class Person {
  greet = () => {
    // 保证调用时不会丢失 this
    console.log(this.name)
  }
}
```

那么使用 `addInitializer` 就可以来解决这个问题：

假设我们定义一个装饰器，它可以将类方法的 `this` 绑定到当前类实例上：

```ts
function bound<
  This, Args extends any[], Return,
  Fn extends (this: This, ...args: Args) => Return,
>(originalMethod: Fn, context: ClassMethodDecoratorContext<This, Fn>) {
  const methodName = context.name.toString()
  // 注册钩子，可以挂在构造函数开始执行
  // 注意不要使用箭头函数，否则会丢失 this
  context.addInitializer(function () {
    this[methodName] = this[methodName].bind(this)
  })
  return originalMethod
}

class Person {
  constructor(public name: string) {
    this.greet = this.greet.bind(this)
  }

  @bound
  greet() {
    console.log(`Hello, my name is ${this.name}`)
  }
}

const person = new Person('John')
const greet = person.greet
greet() // 这样就不会丢失 this 了
```

那么这段代码通过 tsc 会编译为啥样呢？我简化了一下：

```js
function bound(originalMethod, context) {
  const methodName = context.name.toString()
  context.addInitializer(function () {
    this[methodName] = this[methodName].bind(this)
  })
  return originalMethod
}

const __esDecorate = function (ctor, descriptorIn, decorators, contextIn, extraInitializers) {
  const target = ctor.prototype
  const descriptor = Object.getOwnPropertyDescriptor(target, contextIn.name)
  for (let i = decorators.length - 1; i >= 0; i--) {
    const context = {}
    for (const k in contextIn) context[k] = contextIn[k]
    context.addInitializer = function (f) {
      extraInitializers.push(f)
    }
    decorators[i](descriptor, context)
  }
}

function __runInitializers(thisArg, initializers) {
  for (let i = 0; i < initializers.length; i++)
    initializers[i].call(thisArg)
}

const Person = (function () {
  const _instanceExtraInitializers = []

  function Person(name) {
    this.name = (__runInitializers(this, _instanceExtraInitializers), name)
  }

  Person.prototype.greet = function () {
    console.log('Hello, my name is '.concat(this.name))
  }
  const _a = Person

  const _greet_decorators = [bound]
  __esDecorate(_a, null, _greet_decorators, { name: 'greet' }, _instanceExtraInitializers)

  return _a
}())

const person = new Person('John')
const greet = person.greet
greet()
```

根据上述代码可以看出：

- 在构造 Person 之前，就已经执行了每个装饰器，将新注册的 `addInitializer` 方法挂在了 `_instanceExtraInitializers` 上 (`__esDecorate` 中)
- 然后在构造函数中依次调用了这些方法 (`__runInitializers` 中)

### 与旧装饰器的差异

`--experimentalDecorators` 在未来继续存在，但是如果不开启这个选项，默认 tsc 编译的就是新装饰器的语法。

新装饰器与 `--emitDecoratorMetadata` 同样不兼容，不允许存在装饰器参数，也许未来 ECMA 会弥补这一缺陷。

新装饰器要求类的装饰器需要放在 `export` 关键词后，也就是：

```ts
export @register class Foo {
  // ...
}

export
@Component({
  // ...
})
class Bar {
  // ...
}
```

### 一些应用场景

#### 1. Log

```ts
function log(level: 'WARN' | 'INFO') {
  return function<
  This,
  Args extends any[],
  Return,
>(originalMethod: (this: This, ...args: Args) => Return, context: ClassMethodDecoratorContext<This, any>) {
    return function (this: This, ...args: Args): Return {
      console.log(`${level}: log from ${context.name.toString()}`)
      return originalMethod.apply(this, args)
    }
  }
}

class Foo {
  @log('WARN')
  bar() {
    console.log('I\'m in bar')
  }
}

const f = new Foo()
f.bar()
```

虽然不允许有装饰器参数，但是可以通过闭包来传递参数。

## 2. 泛型参数可以使用 const

> [原始 PR](https://github.com/microsoft/TypeScript/pull/51865)

当推断一个对象的类型时，TypeScript 倾向于选择更通用的类型：

```ts
interface HasNames { readonly names: string[] }
function getNamesExactly<T extends HasNames>(arg: T): T['names'] {
  return arg.names
}

// 推断出类型 string，而不是 ['Alice', 'Bob', 'Eve'] 的元组
const names = getNamesExactly({ names: ['Alice', 'Bob', 'Eve'] })
```

如果想要推断出更具体的类型，TypeScript 4.x 只能是向给定的参数增加 `as const`

```ts
const names = getNamesExactly({ names: ['Alice', 'Bob', 'Eve'] } as const)
//                                                               ^^^^^^^^
```

但是在 TypeScript V5  中，我们可以给泛型参数增加 `const`

```ts
interface HasNames { names: readonly string[] }
function getNamesExactly<const T extends HasNames>(arg: T): T['names'] {
  //                     ^^^^^
  return arg.names
}

// 推断出来类型 readonly ['Alice', 'Bob', 'Eve']
// 无需使用 as const
const names = getNamesExactly({ names: ['Alice', 'Bob', 'Eve'] })
```

值得注意的是：const 修饰符无法推断可变的值：

```ts
declare function fnBad<const T extends string[]>(args: T): void
// T 依然是 string[]，因为这里的 T 不是 readonly
fnBad(['a', 'b', 'c'])
```

但是如果改成 readonly 了呢？

```ts
declare function fnBad<const T extends readonly string[]>(args: T): void
// T 就会变为 readonly ['a', 'b', 'c']
fnBad(['a', 'b', 'c'])
```

## 3. 支持继承多个配置文件

> [原始 PR](https://github.com/microsoft/TypeScript/pull/50403)

```json
{
  "compilerOptions": {
    "extends": ["./tsconfig1.json", "./tsconfig2.json"]
  }
}
```

如果配置发生冲突，则会根据先后顺序覆盖，后面的配置会覆盖前面的配置。

## 4. 优化枚举

> [原始 PR](https://github.com/microsoft/TypeScript/pull/50528)

这有一个例子：

```ts
const BaseValue = 10
const Prefix = '/data'
const enum Values {
  First = BaseValue, // 10
  Second, // 11
  Third, // 12
}
const enum Routes {
  Parts = `${Prefix}/parts`, // "/data/parts"
  Invoices = `${Prefix}/invoices`, // "/data/invoices"
}
```

TypeScript V5 中枚举值将支持表达式，但是表达式必须是常量之间进行计算，并且常量必须声明在枚举前

## 5. `--moduleResolution` 增加配置 `bundler`

> [原始 PR](https://github.com/microsoft/TypeScript/pull/51669)

在 TypeScript 4.7 中，为 `--module` 和 `--moduleResolution` 增加了 `node16` 和 `nodenext` 选项。主要是为了更好的模拟 ESM 快速查找文件的规则。但是这个规则存在很多限制，以至于其他工具没有真正的强制执行。

例如，在 Node 中执行一个 ESM 模块，必须指定文件扩展名：

```ts
// entry.mjs
import * as utils from './utils' // 错误，找不到文件
import * as utils from './utils.mjs' //  正确
```

对于 Node.js 和浏览器来说，这样的行为有助于更快找到文件。但是对于大部分使用打包器的开发者来说，它存在了一定的限制。

所以可以配置 `--moduleResolution` 为 `bundler`，来模拟诸如 `Webpack`、`Vite`、`Rollup` 等打包器的行为

## 6. customConditions

通过配置 `customConditions`，TypeScript 可以从 `package.json` -> `exports`/`imports` 中读取自定义的条件。

```json
{
  "compilerOptions": {
    "target": "es2022",
    "moduleResolution": "bundler",
    "customConditions": ["production", "development"]
  }
}
```

```json
// package.json
{
  "exports": {
    ".": {
      "development": "./index.js",
      "production": "./index.min.js"
    }
  }
}
```

## 7. --verbatimModuleSyntax

> [原始 PR](https://github.com/microsoft/TypeScript/pull/52203)

默认情况下，tsc 会检测你的导入，并检测是否需要省略，例如：

```ts
import { Type } from 'xx'
export function foo(type: Type) {}
```

当 tsc 检测出来导入了一个类型时，将会自动将该条导入省略：

```js
// 编译为
export function foo(type) {}
```

大多数情况下，这个行为是没问题的。但是如果 `Type` 并不是一个类型，而是一个值的时候，我们可能会得到一个运行时错误。

所以 tsc 会考虑导入值的声明方式，如果 Car 被声明为类似于类的东西，那么它可以被保留在结果的 JavaScript 文件中。但如果 Car 只是被声明为类型别名或接口，那么 JavaScript 文件根本就不应该导出 Car。

虽然 tsc 可以跨文件获取信息，但是并不是所有的 TypeScript 编译器都能做到这件事情。所以 `type` 标识符是存在一定意义的：

```ts
// 可以完全丢弃
import type * as car from './car'

// 可以完全丢弃
import { type Car } from './car'
export { type Car } from './car'
```

不过在加上 `type` 标识符的默认情况下，tsc 的模块精简仍然可能会出现上述的问题，所以可以启用 `--importsNotUsedAsValues` 和 `--preserveValueImports` 来避免这种情况，启用 `--isolatedModules` 来在不同的编译器中正常工作。

TypeScript V5 引入了一个新的选项 `--verbatimModuleSyntax`，这个配置就很简单粗暴了：

```ts
// 整个丢弃
import type { A } from 'a'

// 重写为 'import { b } from "bcd";'
import { b, type c, type d } from 'bcd'

// 重写为 'import {} from "xyz";'
import { type xyz } from 'xyz'
```

任何不存在 `type` 的导入都会完全保留下来。由于 `--verbatimModuleSyntax` 的行为更加明确，`--importsNotUsedAsValues` 和 `--preserveValueImports` 将会被废弃。

## 8. 支持 `export type *`

```ts
// models/vehicles.ts
// main.ts
import { vehicles } from './models'

export class Spaceship {
  // ...
}

// models/index.ts
export type * as vehicles from './spaceship'

function takeASpaceship(s: vehicles.Spaceship) {
  //  vehicles 可以被用作为类型
}

function makeASpaceship() {
  return new vehicles.Spaceship()
  //         ^^^^^^^^
  // vehicles 不能被用作为一个值
}
```

## 9. JSDoc 优化

### 支持 `@satisfies`

```ts
// @ts-check

/**
 * @typedef CompilerOptions
 * @prop {boolean} [strict]
 * @prop {string} [outDir]
 * @prop {string | string[]} [extends]
 */

/**
 * @satisfies {CompilerOptions}
 */
const myCompilerOptions = {
  outdir: '../lib',
  // Error: outdir 与 outDir 不兼容
}
```

### 支持 `@overload`

```ts
/**
 * @overload
 * @param {string} value
 * @return {void}
 */

/**
 * @overload
 * @param {number} value
 * @param {number} [maximumFractionDigits]
 * @return {void}
 */

/**
 * @param {string | number} value
 * @param {number} [maximumFractionDigits]
 */
function printValue(value, maximumFractionDigits) {
  if (typeof value === 'number') {
    const formatter = Intl.NumberFormat('en-US', {
      maximumFractionDigits,
    })
    value = formatter.format(value)
  }

  console.log(value)
}
```

## 10. CLI 配置增加

现在可以使用 `tsc --build` 可以传递如下配置：

- declaration
- emitDeclarationOnly
- declarationMap
- soureMap
- inlineSourceMap

例如：

```bash
tsc --build -p ./my-project-dir --declaration
```

## 11. switch-case 优化

如果 switch case 的分支是字面量时，会检测每个字面量是否覆盖完毕，并提供一个快捷指令补全未覆盖的分支：

![img](https://devblogs.microsoft.com/typescript/wp-content/uploads/sites/11/2023/01/switchCaseSnippets-5-0_1.gif)

## 12. 破坏性变化和废弃的特性

Node.js 10.0.0 以下版本将不再支持。

### `lib.d.ts` 更改

有关 DOM 的相关代码可能会产生问题，某些属性已经从数字转换为数字字面类型。

### API 破坏性变化

详情看 [API 破坏性变化](https://github.com/microsoft/TypeScript/wiki/API-Breaking-Changes)

### 禁止关系操作符的隐式转换

如果你的代码中存在从字符串到数字的隐式转换，现在 TypeScript 会出现警告：

```ts
function func(ns: number | string) {
  return ns * 4 // 错误：可能会出现隐式转换
}
```

在 V5 中，同样会检测 `>`、`<`、`<=`、和 `>=:`

```ts
function func(ns: number | string) {
  return ns > 4 // 报错
  // return +ns > 4 // 这个没问题
}
```

### 更好的枚举

在 TypeScript V5 中，修复了一些关于枚举的问题：

例如：

```ts
enum SomeEvenDigit {
  Zero = 0,
  Two = 2,
  Four = 4
}

// 在 V5 会直接报错
const m: SomeEvenDigit = 1
```

### 对原有装饰器的更细致的类型检查

提升了 `--experimentalDecorators` 下的装饰器的类型检查，主要是对于构造函数参数上使用装饰器的类型。

具体可以看 [这个 PR](https://github.com/microsoft/TypeScript/issues/52435)

### 废弃配置

在 V5 中，会逐渐废弃以下配置/配置值

- target: ES3
- out
- noImplicitUseStrict
- keyofStringsOnly
- suppressExcessPropertyErrors
- suppressImplicitAnyIndexErrors
- noStrictGenericChecks
- charset
- importsNotUsedAsValues
- preserveValueImports
- prepend in project references

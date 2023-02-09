interface HasNames { names: readonly string[] }
function getNamesExactly<const T extends HasNames>(arg: T): T['names'] {
  return arg.names
}

const names = getNamesExactly({ names: ['Alice', 'Bob', 'Eve'] })
//    ^?: readonly ['ALice', 'Bob', 'Eve']

// declare function fnBad<const T extends string[]>(args: T): void

// // 'T' is still 'string[]' since 'readonly ["a", "b", "c"]' is not assignable to 'string[]'
// fnBad(['a', 'b', 'c'])

declare function fnBad<const T extends readonly string[]>(args: T): void
// T 依然是 string[]，因为这里的 T 不是 readonly
fnBad(['a', 'b', 'c'])

function foo(a) {

}

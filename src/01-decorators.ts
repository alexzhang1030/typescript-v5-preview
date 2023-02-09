function bound<
  This, Args extends any[], Return,
  Fn extends (this: This, ...args: Args) => Return,
  >(originalMethod: Fn, context: ClassMethodDecoratorContext<This, Fn>) {
  const methodName = context.name.toString()
  if (context.private)
    throw new Error(`@bound decorator cannot be applied to private method ${methodName}`)
  context.addInitializer(function () {
    this[methodName] = this[methodName].bind(this)
  })
  return originalMethod
}

class Person {
  constructor(public name: string) {
  }

  @bound
  greet() {
    console.log(`Hello, my name is ${this.name}`)
  }
}

const person = new Person('John')
const greet = person.greet
greet()

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

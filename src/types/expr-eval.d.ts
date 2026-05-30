declare module 'expr-eval' {
  export class Parser {
    parse(expression: string): Expression;
  }
  interface Expression {
    evaluate(variables?: Record<string, unknown>): unknown;
  }
}

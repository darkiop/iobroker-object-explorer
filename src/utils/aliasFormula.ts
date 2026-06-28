import { Parser as ExprParser } from 'expr-eval';

export function evalFormula(formula: string, val: unknown): { value?: string; error?: string } {
  try {
    const parser = new ExprParser();
    const expr = parser.parse(formula.trim());
    const output = expr.evaluate({ val });
    return { value: String(output) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

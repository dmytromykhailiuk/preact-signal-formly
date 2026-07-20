/**
 * Expression evaluation. An expression is a static value, a signal, a
 * callback, or — for configs that arrive as JSON — a string expression
 * (`{ $expr: "..." }`, see `core/expression-lang`). Expressions are only ever
 * evaluated inside computeds, so signal reads (model, formState, config) are
 * tracked and drive reactive updates without component re-renders.
 */

import { Signal } from "@preact/signals";
import type { ReadonlySignal } from "@preact/signals";
import type { FormlyExprRef, FormlyExpression, FormlyExpressionCtx } from "../types";
import { runExpression } from "./expression-lang";

/** `{ $expr: "..." }` — the JSON-friendly form of a callback. */
export function isExprRef(value: unknown): value is FormlyExprRef {
  return (
    typeof value === "object" &&
    value !== null &&
    !(value instanceof Signal) &&
    typeof (value as FormlyExprRef).$expr === "string"
  );
}

function run(source: string, ctx: FormlyExpressionCtx): unknown {
  return runExpression(source, {
    model: ctx.model,
    formState: ctx.formState,
    field: ctx.field,
    namePath: ctx.namePath,
  });
}

export function evalExpression<T>(
  expression: FormlyExpression<T> | undefined,
  ctx: FormlyExpressionCtx,
): T | undefined {
  if (expression === undefined) return undefined;
  if (expression instanceof Signal) return (expression as ReadonlySignal<T>).value;
  if (typeof expression === "function") {
    return (expression as (c: FormlyExpressionCtx) => T)(ctx);
  }
  if (isExprRef(expression)) return run(expression.$expr, ctx) as T;
  return expression as T;
}

/**
 * `hide` is the one slot where a bare string cannot be a meaningful static
 * value — the target is a boolean — so a string there is read as an
 * expression, without the `$expr` wrapper. Everywhere else a string stays a
 * literal (`"props.label": "Name"` must keep working).
 */
export function evalHideExpression(
  expression: FormlyExpression<boolean> | string | undefined,
  ctx: FormlyExpressionCtx,
): boolean | undefined {
  if (typeof expression === "string") return run(expression, ctx) as boolean;
  return evalExpression(expression, ctx);
}

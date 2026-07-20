/**
 * Map a resolved field config to the base library's `RegisterOptions`.
 *
 * The returned object uses getters that peek the latest resolved config, so
 * built-in rules and validators always see current values at validation time
 * — config/expression edits take effect on the next validation run without
 * re-registering the field.
 */

import type { RegisterOptions, Validator } from "@dmytromykhailiuk/preact-signal-hook-forms";
import type { ReadonlySignal } from "@preact/signals";
import type { FormlyBaseProps, FormlyFieldConfig, FormlyValidatorFn } from "../types";
import type { FormlyRegistry } from "./registry";
import { resolveValidator } from "./registry";

function wrapValidator(
  fn: FormlyValidatorFn,
  resolved: ReadonlySignal<FormlyFieldConfig>,
): Validator {
  // Our validator contract matches the base library's exactly (true/undefined
  // valid, false invalid, string message) — only the extra `field` argument
  // needs threading, peeked so validation always sees the current config.
  return (value, formValues, signal) => fn(value, formValues, resolved.peek(), signal);
}

export function buildRules(
  resolved: ReadonlySignal<FormlyFieldConfig>,
  registry: FormlyRegistry,
): RegisterOptions {
  const props = (): FormlyBaseProps => resolved.peek().props ?? {};

  return {
    get required() {
      return props().required === true ? true : undefined;
    },
    get min() {
      return props().min;
    },
    get max() {
      return props().max;
    },
    get minLength() {
      return props().minLength;
    },
    get maxLength() {
      return props().maxLength;
    },
    get pattern() {
      const pattern = props().pattern;
      if (pattern === undefined) return undefined;
      return typeof pattern === "string" ? new RegExp(pattern) : pattern;
    },
    get validate() {
      const validators = resolved.peek().validators;
      if (!validators) return undefined;
      const out: Record<string, Validator> = {};
      for (const name of validators.validation ?? []) {
        out[name] = wrapValidator(resolveValidator(registry, name).fn, resolved);
      }
      for (const [name, entry] of Object.entries(validators)) {
        if (name === "validation" || entry === undefined) continue;
        const fn =
          typeof entry === "function"
            ? entry
            : (entry as { expression: FormlyValidatorFn }).expression;
        out[name] = wrapValidator(fn, resolved);
      }
      return Object.keys(out).length > 0 ? out : undefined;
    },
  } as RegisterOptions;
}

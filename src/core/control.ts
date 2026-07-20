/**
 * Per-field view of the `FormControl` handed to field types.
 *
 * A field type binds its input itself — `control.register(namePath)` or
 * `<Controller control={control} name={namePath}>`. Two things have to hold on
 * both of those paths, and neither is something the base library can know:
 *
 * 1. **Rules.** `register` *replaces* the node's rules with the options it is
 *    given, so a bare `register(namePath)` would silently drop the rules
 *    derived from the field config. They are re-injected here, explicit
 *    options winning.
 * 2. **Timing.** The base control is built so that it never auto-validates
 *    (see `core/timing`); the change/blur decision is made here instead,
 *    against this field's effective mode.
 *
 * The uncontrolled path routes through the `onChange`/`onBlur` callbacks of
 * `RegisterOptions`; the controlled path routes through `afterChange`/
 * `afterBlur`, which `useController` calls on whichever control it was handed.
 */

import type {
  FieldValues,
  FormControl,
  RegisterOptions,
} from "@dmytromykhailiuk/preact-signal-hook-forms";
import type { ValidationTiming } from "./timing";
import { shouldValidateOnBlur, shouldValidateOnChange } from "./timing";

/**
 * Merge two rule objects while preserving property descriptors — `buildRules`
 * returns getters that peek the current config, so copying values here would
 * freeze the rules at registration time.
 */
function mergeRules(base: RegisterOptions, override?: RegisterOptions): RegisterOptions {
  if (!override) return base;
  const merged: RegisterOptions = {};
  for (const source of [base, override]) {
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(source))) {
      Object.defineProperty(merged, key, descriptor);
    }
  }
  return merged;
}

export interface FieldControlOptions {
  /** Config-derived rules for this field. */
  rules: RegisterOptions;
  /**
   * The field's effective timing, read at decision time rather than captured,
   * so `validation.mode` can be changed through a config replacement.
   */
  timing: () => ValidationTiming;
}

/**
 * Wrap `control` so that registering *this* field carries the config-derived
 * rules and validates on this field's own schedule. Everything else is
 * inherited untouched, so the object stays a fully usable `FormControl`
 * (`setFieldValue`, `trigger`, `<Controller>`, …).
 */
export function scopeControlToField<Model extends FieldValues>(
  control: FormControl<Model>,
  namePath: string,
  { rules, timing }: FieldControlOptions,
): FormControl<Model> {
  const state = () => {
    const node = control.getField(namePath);
    return {
      isSubmitted: control.formState.isSubmitted.peek(),
      hasError: node.error.peek() !== undefined,
      isTouched: node.isTouched.peek(),
    };
  };
  const validate = (): void => {
    void control.validateField(namePath);
  };

  const scoped: FormControl<Model> = Object.create(control);

  // Defined rather than assigned: the base control exposes some members as
  // getters, which a plain assignment on the derived object would throw on.
  Object.defineProperty(scoped, "register", {
    value: (name: string, options?: RegisterOptions) => {
      if (name !== namePath) return control.register(name as never, options as never);
      const merged = mergeRules(rules, options);
      // Compose rather than override: a type may pass its own handlers, and
      // both those and the timing decision have to run.
      const { onChange, onBlur } = merged;
      Object.defineProperties(merged, {
        onChange: {
          value: (event: Event) => {
            onChange?.(event);
            if (shouldValidateOnChange(timing(), state())) validate();
          },
          enumerable: true,
          configurable: true,
        },
        onBlur: {
          value: (event: Event) => {
            onBlur?.(event);
            if (shouldValidateOnBlur(timing(), state())) validate();
          },
          enumerable: true,
          configurable: true,
        },
      });
      return control.register(name as never, merged as never);
    },
  });

  // `afterChange`/`afterBlur` are what `useController` calls after writing a
  // value / on blur. The base implementations still run (they mark the field
  // touched); only the validation decision is ours.
  Object.defineProperty(scoped, "afterChange", {
    value: (name: string) => {
      control.afterChange(name as never);
      if (name === namePath && shouldValidateOnChange(timing(), state())) validate();
    },
  });
  Object.defineProperty(scoped, "afterBlur", {
    value: (name: string) => {
      control.afterBlur(name as never);
      if (name === namePath && shouldValidateOnBlur(timing(), state())) validate();
    },
  });

  // `control.control` is the self-reference handed to declarative components;
  // it must point at the scoped object so `<Controller control={ctx.control}>`
  // and `useFormContext()` consumers keep the field-aware behaviour.
  Object.defineProperty(scoped, "control", { value: scoped });
  return scoped;
}

/**
 * When validation runs.
 *
 * The base library decides this globally, from the `mode`/`reValidateMode` it
 * was constructed with — there is no per-field hook. So formly takes the
 * decision over: the underlying control is built with a mode under which it
 * never auto-validates, and the same matrix is re-evaluated here per field,
 * against that field's effective timing (its own config, falling back to the
 * form's). Explicit validation — `trigger`, `handleSubmit`, `validateField`,
 * `setValue({ shouldValidate })` — is untouched by any of this.
 */

import type {
  ReValidateMode,
  UseFormOptions,
  ValidationMode,
} from "@dmytromykhailiuk/preact-signal-hook-forms";
import { createContext } from "preact";

export interface ValidationTiming {
  mode: ValidationMode;
  reValidateMode: ReValidateMode;
}

/**
 * What a form does when `formOptions` says nothing.
 *
 * This deliberately departs from the base library, which defaults to
 * `"onSubmit"`: a config-driven form is usually a long one, and telling
 * someone at submit time about a field they filled in ten fields ago is the
 * worse default. `"all"` validates on change and on blur from the start.
 * `reValidateMode` still only matters after a submit or while an error is
 * showing — with `mode: "all"` it changes nothing on its own.
 */
export const DEFAULT_TIMING: ValidationTiming = {
  mode: "all",
  reValidateMode: "onChange",
};

/**
 * Handed to `useForm` so the control never validates on its own: with both
 * modes set to `"onSubmit"`, every branch of its internal decision is `false`.
 */
export const CONTROL_TIMING_OFF = {
  mode: "onSubmit",
  reValidateMode: "onSubmit",
} satisfies Pick<UseFormOptions, "mode" | "reValidateMode">;

/** State of a field at the moment a change/blur is being judged. */
export interface TimingState {
  isSubmitted: boolean;
  hasError: boolean;
  isTouched: boolean;
}

/**
 * Once the form has been submitted — or while an error is on screen —
 * `reValidateMode` takes over from `mode`. That is what makes a form quiet
 * until submit and then responsive per keystroke.
 */
export function shouldValidateOnChange(timing: ValidationTiming, state: TimingState): boolean {
  if (state.isSubmitted || state.hasError) return timing.reValidateMode === "onChange";
  return (
    timing.mode === "onChange" ||
    timing.mode === "all" ||
    (timing.mode === "onTouched" && state.isTouched)
  );
}

export function shouldValidateOnBlur(timing: ValidationTiming, state: TimingState): boolean {
  if (state.isSubmitted || state.hasError) return timing.reValidateMode === "onBlur";
  return timing.mode === "onBlur" || timing.mode === "onTouched" || timing.mode === "all";
}

/**
 * The form-wide timing, published by `FormlyForm` for the field tree. Stable
 * for the life of the form — `formOptions` is read once at mount, like
 * `useForm` itself.
 */
export const ValidationTimingContext = createContext<ValidationTiming>(DEFAULT_TIMING);

/** A field's timing: its own overrides on top of the form's. */
export function resolveTiming(
  form: ValidationTiming,
  field?: Partial<ValidationTiming>,
): ValidationTiming {
  if (!field) return form;
  return {
    mode: field.mode ?? form.mode,
    reValidateMode: field.reValidateMode ?? form.reValidateMode,
  };
}

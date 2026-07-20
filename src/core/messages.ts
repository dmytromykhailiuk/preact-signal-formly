/**
 * Validation-message resolution. Precedence:
 * field `validation.messages[type]` → inline validator entry message →
 * registry message → validator's default message → the error's own message →
 * the error type as a last resort.
 */

import type { FieldError } from "@dmytromykhailiuk/preact-signal-hook-forms";
import { computed } from "@preact/signals";
import type { ReadonlySignal } from "@preact/signals";
import type { FormlyFieldConfig, FormlyValidatorEntry } from "../types";
import type { FormlyRegistry } from "./registry";

function inlineEntryMessage(
  config: FormlyFieldConfig,
  errorType: string,
): FormlyValidatorEntry["message"] {
  const entry = config.validators?.[errorType];
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    return (entry as FormlyValidatorEntry).message;
  }
  return undefined;
}

export function buildErrorMessage(
  error: ReadonlySignal<FieldError | undefined>,
  resolved: ReadonlySignal<FormlyFieldConfig>,
  registry: FormlyRegistry,
): ReadonlySignal<string | undefined> {
  return computed(() => {
    const err = error.value;
    if (!err) return undefined;
    const config = resolved.value;
    const message =
      config.validation?.messages?.[err.type] ??
      inlineEntryMessage(config, err.type) ??
      registry.messages.get(err.type) ??
      registry.validators.get(err.type)?.message;
    if (typeof message === "function") return message(err, config);
    if (message !== undefined) return message;
    return err.message || err.type;
  });
}

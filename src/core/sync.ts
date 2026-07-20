/**
 * Two-way synchronisation between the writable signals the consumer passes to
 * `FormlyForm` and the base library's form control.
 *
 * Loop analysis (bindModel):
 * - `control.values` deep-clones on every recompute, so identity can never be
 *   used to detect an echo. Instead we track the exact reference last accepted
 *   in either direction (`last`) and fall back to `deepEqual`.
 * - User types → `values` recomputes (fresh clone `v`) → form→model effect:
 *   `v` is not `last`, not deep-equal → `last = v; model.value = v` →
 *   model→form effect fires, sees `m === last` → stops. One deepEqual per edit.
 * - Consumer writes `model.value = obj` → model→form: `last = obj`,
 *   `setValue(obj)` (whole-model replace — this dirties the form, documented)
 *   → `values` recomputes → form→model: deep-equal to `model.peek()` → absorbed.
 * - A deep-equal-but-new external write is absorbed without touching the form.
 */

import type { FieldValues, FormControl } from "@dmytromykhailiuk/preact-signal-hook-forms";
import { batch, effect } from "@preact/signals";
import type { Signal } from "@preact/signals";
import type { FormlySharedState } from "../types";
import { deepEqual } from "./equality";

/** Two-way sync between the `model` prop and `control.values`. */
export function bindModel<Model extends FieldValues>(
  model: Signal<Model>,
  control: FormControl<Model>,
): () => void {
  // The model prop seeded `defaultValues`, so both sides start consistent.
  let last: unknown = model.peek();

  const disposeFormToModel = effect(() => {
    const v = control.values.value;
    if (v === last) return;
    if (deepEqual(v, model.peek())) {
      last = v;
      return;
    }
    last = v;
    model.value = v;
  });

  const disposeModelToForm = effect(() => {
    const m = model.value;
    if (m === last) return;
    if (deepEqual(m, control.getValues())) {
      last = m;
      return;
    }
    last = m;
    batch(() => control.setValue(m));
  });

  return () => {
    disposeFormToModel();
    disposeModelToForm();
  };
}

/**
 * Two-way sync between the `formState` prop and `control.formState.shared`.
 * Both sides always end up holding the same object reference, so an echo write
 * stops on the `!==` guard — loop-proof without any flags.
 */
export function bindSharedState(
  prop: Signal<FormlySharedState>,
  shared: Signal<FormlySharedState>,
): () => void {
  // Initial direction: a defined prop wins; otherwise adopt the shared value.
  if (prop.peek() === undefined && shared.peek() !== undefined) {
    prop.value = shared.peek();
  }

  const disposePropToShared = effect(() => {
    const v = prop.value;
    if (shared.peek() !== v) shared.value = v;
  });

  const disposeSharedToProp = effect(() => {
    const v = shared.value;
    if (prop.peek() !== v) prop.value = v;
  });

  return () => {
    disposePropToShared();
    disposeSharedToProp();
  };
}

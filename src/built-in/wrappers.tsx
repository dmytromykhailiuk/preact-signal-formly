import { useComputed } from "@preact/signals";
import { Show } from "@preact/signals/utils";
import { createWrapper } from "../create";

/**
 * Built-in `"field"` wrapper: label (with required marker), the control,
 * an optional description, and the resolved validation message.
 */
export const FieldWrapper = createWrapper((ctx) => {
  const { id, props, errorMessage, children } = ctx;
  const label = useComputed(() => props.value.label);
  const required = useComputed(() => props.value.required === true);
  const description = useComputed(() => props.value.description);
  // `ctx.className` already has `expressions["className"]` applied.
  const className = useComputed(() => ctx.className.value ?? "formly-field");
  return (
    <div class={className}>
      <Show when={label}>
        <label for={id}>
          {label}
          <Show when={required}>
            <span aria-hidden="true"> *</span>
          </Show>
        </label>
      </Show>
      {children}
      <Show when={description}>{(text) => <div class="formly-description">{text}</div>}</Show>
      <Show when={errorMessage}>
        {(message) => (
          <div class="formly-error" role="alert">
            {message}
          </div>
        )}
      </Show>
    </div>
  );
}, "FormlyFieldWrapper");

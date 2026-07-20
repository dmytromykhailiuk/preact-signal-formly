import { useComputed } from "@preact/signals";
import { createFieldType } from "../create";
import type { FormlyBaseProps } from "../types";

/**
 * Built-in `input` type. `control.register(namePath)` binds the element to the
 * field (value signal, handlers, ref) and carries the rules derived from the
 * config, so the component renders exactly once — every dynamic prop is a
 * signal bound straight to the DOM.
 */
export const InputType = createFieldType<FormlyBaseProps>(
  ({ id, control, namePath, props, fieldState }) => {
    const field = control.register(namePath);
    const type = useComputed(() => props.value.type ?? "text");
    const placeholder = useComputed(() => props.value.placeholder ?? "");
    const disabled = useComputed(() => props.value.disabled === true);
    const invalid = useComputed(() => (fieldState.error.value ? "true" : "false"));

    return (
      <input
        {...field}
        id={id}
        type={type}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid}
      />
    );
  },
  "FormlyInput",
);

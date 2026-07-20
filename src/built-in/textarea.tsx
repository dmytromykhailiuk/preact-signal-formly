import { useComputed } from "@preact/signals";
import { createFieldType } from "../create";
import type { FormlyBaseProps } from "../types";

/** Built-in `textarea` type. */
export const TextareaType = createFieldType<FormlyBaseProps>(
  ({ id, control, namePath, props, fieldState }) => {
    const field = control.register(namePath);
    const placeholder = useComputed(() => props.value.placeholder ?? "");
    const disabled = useComputed(() => props.value.disabled === true);
    const invalid = useComputed(() => (fieldState.error.value ? "true" : "false"));
    return (
      <textarea
        {...field}
        id={id}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid}
      />
    );
  },
  "FormlyTextarea",
);

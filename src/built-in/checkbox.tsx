import { useComputed } from "@preact/signals";
import { createFieldType } from "../create";
import type { FormlyBaseProps } from "../types";

/**
 * Built-in `checkbox` type. `register` reads and writes `checked` for
 * checkbox elements, so the field's `value` must not be bound to the `value`
 * attribute — it is dropped from the spread.
 */
export const CheckboxType = createFieldType<FormlyBaseProps>(
  ({ id, control, namePath, props, fieldState }) => {
    const { value: _value, ...field } = control.register(namePath);
    const disabled = useComputed(() => props.value.disabled === true);
    const invalid = useComputed(() => (fieldState.error.value ? "true" : "false"));
    return <input {...field} id={id} type="checkbox" disabled={disabled} aria-invalid={invalid} />;
  },
  "FormlyCheckbox",
);

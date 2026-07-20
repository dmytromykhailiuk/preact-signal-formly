import { useComputed } from "@preact/signals";
import { For } from "@preact/signals/utils";
import { createFieldType } from "../create";
import type { FormlyBaseProps, FormlySelectOption } from "../types";

/** Built-in `select` type. Options come from `props.options`. */
export const SelectType = createFieldType<FormlyBaseProps>(
  ({ id, control, namePath, props, fieldState }) => {
    const field = control.register(namePath);
    const options = useComputed(() => props.value.options ?? []);
    const disabled = useComputed(() => props.value.disabled === true);
    const invalid = useComputed(() => (fieldState.error.value ? "true" : "false"));
    return (
      <select {...field} id={id} disabled={disabled} aria-invalid={invalid}>
        <For each={options} getKey={(option: FormlySelectOption) => String(option.value)}>
          {(option: FormlySelectOption) => (
            <option value={option.value} disabled={option.disabled === true}>
              {option.label}
            </option>
          )}
        </For>
      </select>
    );
  },
  "FormlySelect",
);

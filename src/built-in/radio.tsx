import { useComputed } from "@preact/signals";
import { For } from "@preact/signals/utils";
import { createFieldType } from "../create";
import type { FormlyBaseProps, FormlySelectOption } from "../types";

/** Built-in `radio` type. Options come from `props.options`. */
export const RadioType = createFieldType<FormlyBaseProps>(
  ({ id, control, namePath, props, fieldState }) => {
    // One registration shared by every option input: the base library keeps a
    // ref per element and drives `checked` from the field value. `setValueAs`
    // maps the DOM's string back to the option's own value, so non-string
    // option values (numbers, booleans) survive a selection.
    const { value: _value, ...field } = control.register(namePath, {
      setValueAs: (raw: string) => {
        const option = props.peek().options?.find((o) => String(o.value) === raw);
        return option ? option.value : raw;
      },
    });
    const options = useComputed(() => props.value.options ?? []);
    const disabled = useComputed(() => props.value.disabled === true);
    const invalid = useComputed(() => (fieldState.error.value ? "true" : "false"));
    return (
      <div id={id} role="radiogroup" aria-invalid={invalid}>
        <For each={options} getKey={(option: FormlySelectOption) => String(option.value)}>
          {(option: FormlySelectOption) => (
            <label>
              <input {...field} type="radio" value={option.value} disabled={disabled} />
              {option.label}
            </label>
          )}
        </For>
      </div>
    );
  },
  "FormlyRadio",
);

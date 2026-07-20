import type { FormlyFormBuilder } from "../builder";
import type { FormlyBaseProps } from "../types";
import { CheckboxType } from "./checkbox";
import { InputType } from "./input";
import { defaultValidationMessages } from "./messages";
import { RadioType } from "./radio";
import { SelectType } from "./select";
import { TextareaType } from "./textarea";
import { FieldWrapper } from "./wrappers";

/** Props map of the built-in types, used for typed `defineFields` configs. */
export interface BuiltInTypes {
  input: FormlyBaseProps;
  textarea: FormlyBaseProps;
  select: FormlyBaseProps;
  checkbox: FormlyBaseProps;
  radio: FormlyBaseProps;
}

/**
 * Register the built-in types, the `"field"` wrapper, and the default
 * validation messages. Everything goes through the same public builder API a
 * consumer would use, so any name can be overridden by re-registering it.
 */
export function registerBuiltIns(builder: FormlyFormBuilder<any>): void {
  builder
    .registerType("input", InputType, { wrappers: ["field"] })
    .registerType("textarea", TextareaType, { wrappers: ["field"] })
    .registerType("select", SelectType, { wrappers: ["field"] })
    .registerType("checkbox", CheckboxType, { wrappers: ["field"] })
    .registerType("radio", RadioType, { wrappers: ["field"] })
    .registerWrapper("field", FieldWrapper);
  for (const [errorType, message] of Object.entries(defaultValidationMessages)) {
    builder.registerValidationMessage(errorType, message);
  }
}

export { CheckboxType, InputType, RadioType, SelectType, TextareaType, FieldWrapper };
export { defaultValidationMessages };

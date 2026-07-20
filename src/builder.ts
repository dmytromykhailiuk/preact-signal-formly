/**
 * `createFormlyFormBuilder` — the library's entry point. Register field types,
 * array types, wrappers, validators, validation messages, and extensions, then
 * call `build()` to obtain a `FormlyForm` component bound to an immutable
 * snapshot of the registrations (later registrations never affect it).
 */

import type { FieldValues } from "@dmytromykhailiuk/preact-signal-hook-forms";
import { registerBuiltIns } from "./built-in";
import type { BuiltInTypes } from "./built-in";
import { createFormlyForm } from "./components/FormlyForm";
import { createMutableRegistry, snapshotRegistry } from "./core/registry";
import type {
  ArrayTypeComponent,
  FieldTypeComponent,
  FormlyBaseProps,
  FormlyExtension,
  FormlyFormComponent,
  FormlyValidationMessage,
  FormlyValidatorFn,
  TypeRegistrationOptions,
  WrapperComponent,
} from "./types";

export interface FormlyBuilderOptions {
  /** Register the built-in basic types/wrapper/messages (default `true`). */
  builtIns?: boolean;
}

export interface FormlyFormBuilder<Types extends Record<string, any> = {}> {
  /** Register a leaf field type. Re-registering a name overrides it. */
  registerType<Name extends string, Props extends Record<string, any> = FormlyBaseProps>(
    name: Name,
    component: FieldTypeComponent<Props, any>,
    options?: TypeRegistrationOptions<Props>,
  ): FormlyFormBuilder<Types & Record<Name, Props>>;
  /** Register an array type (owns the layout and add/remove controls). */
  registerArrayType<Item = any>(
    name: string,
    component: ArrayTypeComponent<Item>,
  ): FormlyFormBuilder<Types>;
  registerWrapper(name: string, component: WrapperComponent): FormlyFormBuilder<Types>;
  /** Register a named validator, referenced via `validators.validation: [name]`. */
  registerValidator(
    name: string,
    fn: FormlyValidatorFn,
    defaultMessage?: FormlyValidationMessage,
  ): FormlyFormBuilder<Types>;
  /** Register a message for an error type (built-in rule types included). */
  registerValidationMessage(
    errorType: string,
    message: FormlyValidationMessage,
  ): FormlyFormBuilder<Types>;
  registerExtension(name: string, extension: FormlyExtension): FormlyFormBuilder<Types>;
  /** Snapshot the registrations and produce the `FormlyForm` component. */
  build<Model extends FieldValues = FieldValues>(): FormlyFormComponent<Model>;
}

export function createFormlyFormBuilder(
  options: FormlyBuilderOptions = {},
): FormlyFormBuilder<BuiltInTypes> {
  const registry = createMutableRegistry();

  const builder: FormlyFormBuilder<any> = {
    registerType(name, component, typeOptions) {
      registry.types.set(name, { component, options: typeOptions ?? {} });
      return builder;
    },
    registerArrayType(name, component) {
      registry.arrayTypes.set(name, component);
      return builder;
    },
    registerWrapper(name, component) {
      registry.wrappers.set(name, component);
      return builder;
    },
    registerValidator(name, fn, defaultMessage) {
      registry.validators.set(name, { fn, message: defaultMessage });
      return builder;
    },
    registerValidationMessage(errorType, message) {
      registry.messages.set(errorType, message);
      return builder;
    },
    registerExtension(name, extension) {
      registry.extensions.set(name, extension);
      return builder;
    },
    build<Model extends FieldValues = FieldValues>() {
      return createFormlyForm<Model>(snapshotRegistry(registry));
    },
  };

  if (options.builtIns !== false) registerBuiltIns(builder);

  return builder;
}

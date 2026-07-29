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
import { createLazyBoundary } from "./core/lazy";
import { createMutableRegistry, snapshotRegistry } from "./core/registry";
import type {
  ArrayTypeComponent,
  FieldTypeComponent,
  FormlyBaseProps,
  FormlyExtension,
  FormlyFormComponent,
  FormlyValidationMessage,
  FormlyValidatorFn,
  LazyComponentLoader,
  LazyRegistrationOptions,
  LazyTypeRegistrationOptions,
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
  /**
   * Register a code-split leaf type: `registerLazyType("rating", () =>
   * import("./Rating"))`. The chunk is fetched when a field of this type first
   * renders, once per registration however many fields use it, and the slot
   * stays empty until it lands.
   *
   * `wrappers`/`defaultProps`/`extends` work exactly as on `registerType` and
   * are **eager** — they are plain data the config resolution reads
   * synchronously, so a lazy type's wrappers (label, error, …) render right
   * away, around the still-empty slot. The field is live meanwhile: its
   * `defaultValue` is seeded and its validation rules are attached at mount,
   * before the component exists.
   *
   * `Props` is only inferred through the loader when TypeScript can see it;
   * name it explicitly to be sure:
   * `registerLazyType<"rating", RatingProps>("rating", loader)`.
   */
  registerLazyType<Name extends string, Props extends Record<string, any> = FormlyBaseProps>(
    name: Name,
    loader: LazyComponentLoader<FieldTypeComponent<Props, any>>,
    options?: LazyTypeRegistrationOptions<Props>,
  ): FormlyFormBuilder<Types & Record<Name, Props>>;
  /** Register a code-split array type. Items render once the chunk lands. */
  registerLazyArrayType<Item = any>(
    name: string,
    loader: LazyComponentLoader<ArrayTypeComponent<Item>>,
    options?: LazyRegistrationOptions,
  ): FormlyFormBuilder<Types>;
  /**
   * Register a code-split wrapper. Its children mount with it — a field
   * wrapped in a wrapper that is still loading renders nothing.
   */
  registerLazyWrapper(
    name: string,
    loader: LazyComponentLoader<WrapperComponent>,
    options?: LazyRegistrationOptions,
  ): FormlyFormBuilder<Types>;
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
    // The lazy variants store a boundary component under the ordinary key, so
    // resolution stays synchronous and nothing downstream knows the difference.
    // Only `errorFallback` belongs to the boundary; the rest of the options are
    // eager registration data and stay on the registration.
    registerLazyType(name, loader, options) {
      const { errorFallback, ...typeOptions } = options ?? {};
      registry.types.set(name, {
        component: createLazyBoundary(loader, { errorFallback }, "type", name),
        options: typeOptions,
      });
      return builder;
    },
    registerLazyArrayType(name, loader, options) {
      registry.arrayTypes.set(name, createLazyBoundary(loader, options ?? {}, "array type", name));
      return builder;
    },
    registerLazyWrapper(name, loader, options) {
      registry.wrappers.set(name, createLazyBoundary(loader, options ?? {}, "wrapper", name));
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

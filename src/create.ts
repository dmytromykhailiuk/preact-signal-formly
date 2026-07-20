/**
 * Authoring utilities. They are identity helpers whose only job is to give
 * strong TypeScript typing to user-defined field types, wrappers, validators,
 * array types, and extensions — users write exactly what the built-ins are
 * written with.
 */

import type { FieldValues } from "@dmytromykhailiuk/preact-signal-hook-forms";
import type { VNode } from "preact";
import type {
  ArrayTypeComponent,
  FieldArrayContext,
  FieldTypeComponent,
  FormlyBaseProps,
  FormlyExtension,
  FormlyFieldConfig,
  FormlyFieldContext,
  FormlyValidatorFn,
  WrapperComponent,
  WrapperContext,
} from "./types";

/**
 * Create a field type component. The callback receives the field context:
 * `control` (the form controller, scoped to this field), `namePath` (the
 * field's `name`), `formState` (shared), `config` (readonly signal of the
 * resolved field config), plus `props`/`fieldState`/`errorMessage`/`id`.
 *
 * Bind the input yourself, either uncontrolled:
 *
 * ```tsx
 * createFieldType(({ control, namePath, props }) => (
 *   <input {...control.register(namePath)} placeholder={useComputed(() => props.value.placeholder ?? "")} />
 * ));
 * ```
 *
 * …or controlled, with `<Controller>` / `useController` from
 * `@dmytromykhailiuk/preact-signal-hook-forms`:
 *
 * ```tsx
 * createFieldType(({ control, namePath }) => (
 *   <Controller
 *     control={control}
 *     name={namePath}
 *     render={({ field }) => <MyPicker value={field.value} onChange={field.onChange} />}
 *   />
 * ));
 * ```
 *
 * `control.register(namePath)` carries the rules derived from the field config
 * (`required`, `pattern`, `validators`, …); options you pass explicitly win.
 * The component never re-renders — bind the provided signals directly to DOM
 * attributes and text content.
 */
export function createFieldType<
  Props extends Record<string, any> = FormlyBaseProps,
  Model extends FieldValues = FieldValues,
>(
  render: (ctx: FormlyFieldContext<Props, Model>) => VNode | null,
  displayName?: string,
): FieldTypeComponent<Props, Model> {
  if (displayName) {
    Object.defineProperty(render, "displayName", { value: displayName });
  }
  return render;
}

/** Create a wrapper component (`ctx.children` is the wrapped content). */
export function createWrapper(
  render: (ctx: WrapperContext) => VNode | null,
  displayName?: string,
): WrapperComponent {
  if (displayName) {
    Object.defineProperty(render, "displayName", { value: displayName });
  }
  return render;
}

/** Create a typed validator function. */
export function createValidator<Value = any, Model = any>(
  fn: FormlyValidatorFn<Value, Model>,
): FormlyValidatorFn<Value, Model> {
  return fn;
}

/**
 * Create an array type component. The context additionally carries `array`
 * (the stable field-array API) and `renderItems()` (the `<For>` list of items).
 */
export function createArrayType<Item = any>(
  render: (ctx: FieldArrayContext<Item>) => VNode | null,
  displayName?: string,
): ArrayTypeComponent<Item> {
  if (displayName) {
    Object.defineProperty(render, "displayName", { value: displayName });
  }
  return render;
}

/** Create a typed extension (`prePopulate`/`onPopulate`/`postPopulate`). */
export function createExtension(extension: FormlyExtension): FormlyExtension {
  return extension;
}

/* ------------------------------------------------------------------ *
 * Typed config authoring
 * ------------------------------------------------------------------ */

/** Extract the accumulated type map from a builder instance type. */
export type BuilderTypes<Builder> = Builder extends import("./builder").FormlyFormBuilder<
  infer Types extends Record<string, any>
>
  ? Types
  : Record<string, any>;

/** A leaf config whose `props` are narrowed by the registered type name. */
type TypedLeafConfig<Types extends Record<string, any>> = {
  [Name in keyof Types & string]: Omit<
    FormlyFieldConfig<Types[Name] & Record<string, any>>,
    "type" | "fieldGroup" | "fieldArray"
  > & { type: Name };
}[keyof Types & string];

type TypedGroupConfig<Types extends Record<string, any>> = Omit<
  FormlyFieldConfig,
  "type" | "fieldGroup" | "fieldArray"
> & {
  type?: undefined;
  fieldGroup: Array<TypedFieldConfig<Types>>;
};

/**
 * A field config narrowed by the builder's registered types: `type: "input"`
 * suggests and checks the props registered for `"input"`. Unregistered names
 * and array fields fall back to the loose `FormlyFieldConfig`.
 */
export type TypedFieldConfig<Types extends Record<string, any>> =
  | TypedLeafConfig<Types>
  | TypedGroupConfig<Types>
  | FormlyFieldConfig;

/**
 * Author a typed config array. `Types` defaults to the built-in types; pass
 * `BuilderTypes<typeof builder>` to pick up custom registrations:
 *
 * ```ts
 * const builder = createFormlyFormBuilder().registerType("rating", Rating);
 * const fields = defineFields<BuilderTypes<typeof builder>>([
 *   { type: "rating", key: "score", props: { ... } },
 * ]);
 * ```
 */
export function defineFields<Types extends Record<string, any> = import("./built-in").BuiltInTypes>(
  fields: Array<TypedFieldConfig<Types>>,
): FormlyFieldConfig[] {
  return fields as FormlyFieldConfig[];
}

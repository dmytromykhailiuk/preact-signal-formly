/**
 * preact-signal-formly — dynamic, config-driven forms for Preact, built on
 * `@preact/signals` and `@dmytromykhailiuk/preact-signal-hook-forms`.
 * Signal-first, zero re-render.
 *
 * @packageDocumentation
 */

// Builder
export { createFormlyFormBuilder } from "./builder";
export type { FormlyBuilderOptions, FormlyFormBuilder } from "./builder";

// Authoring utilities
export {
  createArrayType,
  createExtension,
  createFieldType,
  createValidator,
  createWrapper,
  defineFields,
} from "./create";
export type { BuilderTypes, TypedFieldConfig } from "./create";

// Built-ins (exported so they can be composed/extended)
export {
  CheckboxType,
  FieldWrapper,
  InputType,
  RadioType,
  SelectType,
  TextareaType,
  defaultValidationMessages,
  registerBuiltIns,
} from "./built-in";
export type { BuiltInTypes } from "./built-in";

// Types
export type {
  ArrayTypeComponent,
  FieldArrayContext,
  FieldTypeComponent,
  FormlyBaseProps,
  FormlyExprRef,
  FormlyExpression,
  FormlyExpressionKey,
  FormlyExpressions,
  FormlyExpressionCtx,
  FormlyExtension,
  FormlyFieldBaseContext,
  FormlyFieldConfig,
  FormlyFieldContext,
  FormlyFieldHooks,
  FormlyFormComponent,
  FormlyFormProps,
  FormlyHookContext,
  FormlySelectOption,
  FormlySharedState,
  FormlyValidationMessage,
  FormlyValidatorEntry,
  FormlyValidatorFn,
  FormlyValidatorsConfig,
  TypeRegistrationOptions,
  WrapperComponent,
  WrapperContext,
} from "./types";

// Re-exported from the base library so `mode`/`reValidateMode` can be typed
// without importing it directly.
export type {
  ReValidateMode,
  UseFormOptions,
  ValidationMode,
} from "@dmytromykhailiuk/preact-signal-hook-forms";

// Registry (advanced: custom rendering on top of the registry)
export type { FormlyRegistry } from "./core/registry";
export { RegistryContext } from "./core/registry";

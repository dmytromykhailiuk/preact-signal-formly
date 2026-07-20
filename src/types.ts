/**
 * preact-signal-formly — public type model.
 *
 * The whole contract is signal-first: every dynamic value handed to a field
 * type / wrapper is either a signal, a callback, or a stable reference, so a
 * mounted component never re-renders — all updates flow through signals bound
 * directly to DOM attributes and text content.
 *
 * @packageDocumentation
 */

import type {
  FieldError,
  FieldPath,
  FieldState,
  FieldValues,
  FormControl,
  ReValidateMode,
  UseFieldArrayReturn,
  UseFormOptions,
  ValidationMode,
} from "@dmytromykhailiuk/preact-signal-hook-forms";
import type { ReadonlySignal, Signal } from "@preact/signals";
import type { ComponentChildren, VNode } from "preact";

/* ------------------------------------------------------------------ *
 * Shared-state / model signals
 * ------------------------------------------------------------------ */

/** Shape of the `formState` signal — the two-way mirror of `form.formState.shared`. */
export type FormlySharedState = Record<string, any> | undefined;

/* ------------------------------------------------------------------ *
 * Expressions
 * ------------------------------------------------------------------ */

/**
 * Context handed to expressions and validators. Signals inside it must only be
 * unwrapped within `computed`/`useComputed`/`effect` — the library itself only
 * evaluates expressions inside computeds.
 */
export interface FormlyExpressionCtx<Model extends FieldValues = FieldValues> {
  /** The whole form model (`control.values`). */
  model: ReadonlySignal<Model>;
  /** The shared form state (`control.formState.shared`). */
  formState: Signal<FormlySharedState>;
  /** Resolved config of the field the expression belongs to. */
  field: ReadonlySignal<FormlyFieldConfig>;
  control: FormControl<Model>;
  /** Dot-path of the field, e.g. `"items.0.name"`. */
  namePath: string;
}

/**
 * A string expression, for configs that arrive as JSON — which cannot carry a
 * callback. The string is parsed and interpreted, never compiled as
 * JavaScript: it may read `model`, `formState`, `field` and `namePath`,
 * compare and combine them, and call a fixed list of pure methods. See
 * `core/expression-lang`.
 *
 * ```json
 * { "hide": { "$expr": "!model.value.address.country" } }
 * ```
 */
export interface FormlyExprRef {
  $expr: string;
}

/**
 * A value that may be static, a signal, a `{ $expr }` string expression, or a
 * callback evaluated reactively inside a computed (model access is tracked —
 * no component re-renders).
 */
export type FormlyExpression<T, Model extends FieldValues = FieldValues> =
  | T
  | ReadonlySignal<T>
  | FormlyExprRef
  | ((ctx: FormlyExpressionCtx<Model>) => T);

/* ------------------------------------------------------------------ *
 * Validators & messages
 * ------------------------------------------------------------------ */

/**
 * A formly validator. Return `true`/`undefined` for valid, `false` for invalid
 * (message resolved from the registry), or a string as an inline error message.
 * Async validators receive an `AbortSignal` that fires when the run is superseded.
 */
export type FormlyValidatorFn<Value = any, Model = any> = (
  value: Value,
  model: Model,
  field: FormlyFieldConfig,
  signal?: AbortSignal,
) => boolean | string | undefined | Promise<boolean | string | undefined>;

/** A validation message: a static string or a function of the error and config. */
export type FormlyValidationMessage =
  | string
  | ((error: FieldError, field: FormlyFieldConfig) => string);

/** Inline validator entry with an optional message override. */
export interface FormlyValidatorEntry {
  expression: FormlyValidatorFn;
  message?: FormlyValidationMessage;
}

/**
 * `validators` section of a field config:
 * - `validation` — names of validators registered on the builder;
 * - any other key — an inline validator (fn or `{ expression, message }`);
 *   the key becomes the error type used for message lookup.
 */
export interface FormlyValidatorsConfig {
  validation?: string[];
  [name: string]: FormlyValidatorFn | FormlyValidatorEntry | string[] | undefined;
}

/* ------------------------------------------------------------------ *
 * Field config
 * ------------------------------------------------------------------ */

/**
 * The keys an `expressions` block may carry. `props.<name>` is open-ended
 * because prop names are, but the *prefix* is checked — which is what catches
 * the class of typo that used to fail silently (`"prop.disabled"`).
 */
export type FormlyExpressionKey = "hide" | "className" | `props.${string}`;

/**
 * Dynamic overrides for a field, evaluated inside computeds. `hide` also
 * accepts a bare string expression; the others take `{ $expr }` for the string
 * form, so plain strings stay plain strings.
 */
export type FormlyExpressions = {
  hide?: FormlyExpression<boolean> | string;
  className?: FormlyExpression<string>;
} & {
  [Key in `props.${string}`]?: FormlyExpression<any>;
};

/** Option item for select/radio-like types. */
export interface FormlySelectOption {
  value: any;
  label: string;
  disabled?: boolean;
}

/** Props understood by built-in types and the built-in rules mapping. */
export interface FormlyBaseProps {
  label?: string;
  placeholder?: string;
  description?: string;
  disabled?: boolean;
  /** Maps to the base library's `required` rule. */
  required?: boolean;
  /** Maps to the base library's `min`/`max` rules. */
  min?: number | string;
  max?: number | string;
  /** Maps to the base library's `minLength`/`maxLength` rules. */
  minLength?: number;
  maxLength?: number;
  /** Maps to the base library's `pattern` rule. */
  pattern?: RegExp | string;
  /** Options for select/radio types. */
  options?: FormlySelectOption[];
  /** `<input type>` for the built-in input type. */
  type?: string;
  [key: string]: any;
}

export interface FormlyFieldHooks {
  /** Runs once after the field mounts; may return a cleanup callback. */
  // biome-ignore lint/suspicious/noConfusingVoidType: void here means "no cleanup returned"
  onInit?: (ctx: FormlyHookContext) => void | (() => void);
  /** Runs when the field unmounts (config removal / form unmount). */
  onDestroy?: (ctx: FormlyHookContext) => void;
}

/**
 * One field of the form config — the Formly-style building block.
 * A field is exactly one of: a leaf (has `type`), a group (`fieldGroup`),
 * or an array (`fieldArray`).
 */
export interface FormlyFieldConfig<Props extends Record<string, any> = FormlyBaseProps> {
  /** Path segment relative to the parent (dot-paths compose automatically). */
  key?: string | number;
  /** Name of a type registered on the builder. */
  type?: string;
  props?: Props & FormlyBaseProps;
  defaultValue?: any;
  className?: string;
  /** Overrides the type's default wrappers. `wrappers[0]` is outermost. */
  wrappers?: string[];
  /**
   * Hide the field (value and registration are kept while hidden). A bare
   * string here is read as an expression — `hide` is boolean, so a string
   * could not have been a meaningful static value.
   */
  hide?: FormlyExpression<boolean> | string;
  /**
   * Dynamic overrides evaluated in computeds. An unknown key is reported once
   * through `console.error` and ignored — a silently dropped `"prop.disabled"`
   * is the whole reason this is typed and checked.
   */
  expressions?: FormlyExpressions;
  validators?: FormlyValidatorsConfig;
  validation?: {
    /** Per-field message overrides keyed by error type. */
    messages?: Record<string, FormlyValidationMessage>;
    /**
     * When this field validates before the form has been submitted, overriding
     * the form's `formOptions.mode` (which itself defaults to `"all"`).
     * `"onTouched"` = first on blur, then on every change.
     */
    mode?: ValidationMode;
    /**
     * When this field re-validates once it has been submitted or while it is
     * showing an error, overriding the form's `formOptions.reValidateMode`.
     */
    reValidateMode?: ReValidateMode;
  };
  /** Nested group of fields. A keyless group is transparent (no path prefix). */
  fieldGroup?: FormlyFieldConfig[];
  fieldGroupClassName?: string;
  /** Template for array items — a config or a factory by index. */
  fieldArray?: FormlyFieldConfig | ((index: number) => FormlyFieldConfig);
  hooks?: FormlyFieldHooks;
}

/* ------------------------------------------------------------------ *
 * Field type / wrapper / array-type contracts
 * ------------------------------------------------------------------ */

/**
 * Context shared by every field kind (leaf, group, array). All members are
 * signals, callbacks, or stable references — never plain changing values.
 */
export interface FormlyFieldBaseContext<
  Props extends Record<string, any> = FormlyBaseProps,
  Model extends FieldValues = FieldValues,
> {
  /**
   * The form controller, scoped to this field: `control.register(namePath)`
   * automatically carries the rules derived from the field config
   * (`required`/`min`/`pattern`/`validators`…), and explicit options passed to
   * `register` win over them. Also accepted by `<Controller control={control}
   * name={namePath} …>` and every other API of the base library.
   */
  control: FormControl<Model>;
  /** Dot-path of this field, e.g. `"items.0.name"` — the `name` of the field. */
  namePath: FieldPath<Model>;
  /** The shared form state (`control.formState.shared`), two-way synced with the `formState` prop. */
  formState: Signal<FormlySharedState>;
  /** Resolved config (defaults + extensions applied), reactive to config edits. */
  config: ReadonlySignal<FormlyFieldConfig<Props>>;
  /** Merged props: type defaults + `config.props` + `expressions["props.*"]`. */
  props: ReadonlySignal<Props & FormlyBaseProps>;
  /** `config.className`, with `expressions["className"]` applied. */
  className: ReadonlySignal<string | undefined>;
  /** Stable DOM id for label/input association. */
  id: string;
}

/** Context passed to `hooks.onInit`/`hooks.onDestroy`. */
export type FormlyHookContext<
  Props extends Record<string, any> = FormlyBaseProps,
  Model extends FieldValues = FieldValues,
> = FormlyFieldBaseContext<Props, Model>;

/**
 * Full context a registered leaf type component receives as its props.
 *
 * Bind the input with either `control.register(namePath)` (uncontrolled, the
 * DOM element is the source of truth) or `<Controller control={control}
 * name={namePath} render={…}>` / `useController` (controlled, `field.value` is
 * a signal). Both come from `@dmytromykhailiuk/preact-signal-hook-forms`.
 */
export interface FormlyFieldContext<
  Props extends Record<string, any> = FormlyBaseProps,
  Model extends FieldValues = FieldValues,
> extends FormlyFieldBaseContext<Props, Model> {
  /** Signals: `error`, `isDirty`, `isTouched`, `isValidating`, `invalid`. */
  fieldState: FieldState;
  /** Resolved human-readable message for the current error. */
  errorMessage: ReadonlySignal<string | undefined>;
}

/** A registered field type is a Preact component whose props ARE the context. */
export type FieldTypeComponent<
  Props extends Record<string, any> = FormlyBaseProps,
  Model extends FieldValues = FieldValues,
> = (ctx: FormlyFieldContext<Props, Model>) => VNode | null;

/** Context a wrapper receives: the leaf context plus `children`. */
export interface WrapperContext<
  Props extends Record<string, any> = FormlyBaseProps,
  Model extends FieldValues = FieldValues,
> extends FormlyFieldBaseContext<Props, Model> {
  fieldState: FieldState;
  errorMessage: ReadonlySignal<string | undefined>;
  children: ComponentChildren;
}

export type WrapperComponent = (ctx: WrapperContext) => VNode | null;

/** Context a registered array type receives. */
export interface FieldArrayContext<
  Item = any,
  Props extends Record<string, any> = FormlyBaseProps,
  Model extends FieldValues = FieldValues,
> extends FormlyFieldBaseContext<Props, Model> {
  fieldState: FieldState;
  errorMessage: ReadonlySignal<string | undefined>;
  /** Stable array API from the base library (append/remove/move/…). */
  array: UseFieldArrayReturn<Item>;
  /** Renders the `<For>` list of item sub-fields. */
  renderItems: () => VNode;
}

export type ArrayTypeComponent<Item = any> = (ctx: FieldArrayContext<Item>) => VNode | null;

/* ------------------------------------------------------------------ *
 * Extensions & registration options
 * ------------------------------------------------------------------ */

/**
 * An extension mutates the config draft during resolution (Formly semantics).
 * Order: `prePopulate` → type defaults merge → `onPopulate` → `postPopulate`.
 */
export interface FormlyExtension {
  prePopulate?(field: FormlyFieldConfig): void;
  onPopulate?(field: FormlyFieldConfig): void;
  postPopulate?(field: FormlyFieldConfig): void;
}

export interface TypeRegistrationOptions<Props extends Record<string, any> = FormlyBaseProps> {
  /** Default wrappers for this type. `wrappers[0]` is outermost. */
  wrappers?: string[];
  defaultProps?: Partial<Props & FormlyBaseProps>;
  /**
   * Inherit `wrappers` and `defaultProps` from another registered type. The
   * component is **not** inherited — `registerType` always takes its own.
   */
  extends?: string;
}

/* ------------------------------------------------------------------ *
 * FormlyForm component contract
 * ------------------------------------------------------------------ */

export interface FormlyFormProps<Model extends FieldValues = FieldValues> {
  /** Writable model signal, two-way synced with `form.values`. */
  model: Signal<Model>;
  /** Writable config signal — replace it to update mounted fields in place. */
  config: Signal<FormlyFieldConfig[]>;
  /** Writable shared-state signal, two-way synced with `form.formState.shared`. */
  formState: Signal<FormlySharedState>;
  /**
   * Options forwarded to the base library's `useForm`, read once at mount:
   * `mode`, `reValidateMode`, `resolver`, `criteriaMode`, `delayError`,
   * `shouldFocusError`. `mode`/`reValidateMode` are the form-wide default,
   * which any field can override through `validation.mode` /
   * `validation.reValidateMode` in its config.
   *
   * `mode` defaults to `"all"` (validate on change and on blur) — note this
   * departs from the base library's `"onSubmit"`. Pass `{ mode: "onSubmit" }`
   * for a form that stays quiet until it is submitted.
   *
   * `defaultValues` is owned by the `model` prop and by each field's
   * `defaultValue`, so it is not accepted here.
   */
  formOptions?: Omit<UseFormOptions<Model>, "defaultValues">;
  onSubmit?: (values: Model, event?: Event) => unknown | Promise<unknown>;
  /** Escape hatch to the underlying FormControl (reset/trigger/handleSubmit…). */
  controlRef?: (control: FormControl<Model>) => void;
  /** Rendered inside the `<form>` after the fields (submit button etc.). */
  children?: ComponentChildren;
  className?: string;
}

/** The component returned by `builder.build()`. */
export type FormlyFormComponent<Model extends FieldValues = FieldValues> = (
  props: FormlyFormProps<Model>,
) => VNode;

# @dmytromykhailiuk/preact-signal-formly

Dynamic, config-driven forms for **Preact** — a [Formly](https://formly.dev/) analogue built
entirely on [@preact/signals](https://github.com/preactjs/signals) and
[@dmytromykhailiuk/preact-signal-hook-forms](https://www.npmjs.com/package/@dmytromykhailiuk/preact-signal-hook-forms/).

> **Full documentation:** open [Docs](https://dmytromykhailiuk.github.io/preact-signal-formly/) in a browser — every option, with
> examples, a table of contents and cross-links. This README is the short form.

**Signal-first, zero re-render.** Field components mount once; every update — values, dynamic
props, validation messages, visibility — flows through signals bound directly to DOM attributes
and text content. Iteration and conditional display use `For`/`Show` from `@preact/signals/utils`
instead of re-rendering conditions and loops.

## Install

```sh
npm i @dmytromykhailiuk/preact-signal-formly @dmytromykhailiuk/preact-signal-hook-forms @preact/signals preact
```

> Requires `@preact/signals` **^2.0.0** (the `For`/`Show` utilities live in the `/utils`
> subpath, which is a signals v2 feature).

## Quick start

```tsx
import { signal } from "@preact/signals";
import {
  createFormlyFormBuilder,
  defineFields,
} from "@dmytromykhailiuk/preact-signal-formly";

// 1. Build once (module scope) — register anything you need, then build().
const FormlyForm = createFormlyFormBuilder().build<{
  email: string;
  bio: string;
}>();

// 2. Three writable signals: model, config, formState.
const model = signal({ email: "", bio: "" });
const formState = signal(undefined);
const config = signal(
  defineFields([
    { key: "email", type: "input", props: { label: "Email", required: true } },
    { key: "bio", type: "textarea", props: { label: "Bio" } },
  ])
);

export function App() {
  return (
    <FormlyForm
      model={model}
      config={config}
      formState={formState}
      onSubmit={console.log}
    >
      <button type="submit">Send</button>
    </FormlyForm>
  );
}
```

- `model` is two-way synced with the form values: typing updates `model.value`; writing a
  new object to `model.value` updates the inputs. Treat the value as immutable — always write a
  new object. A deep-equal write is a no-op; a different value goes through `setValue`, which
  **dirties** the form (use `controlRef` + `control.reset()` to set a new pristine baseline).
- `formState` is two-way synced with `form.formState.shared` from the base library — a
  writable scratch signal for cross-field/app state (both sides always hold the same reference).
- `config` is read reactively. Replace it with a new array and mounted fields update in
  place through signals (matched by `key`), without remounting.
- `defaultValue` on a field config applies when the model holds no value at that path (the
  model always wins). It is registered as the control's default for that path, so the field
  starts pristine and `control.reset()` restores it — including for fields that appear in the
  config later. It works on every kind of field: a scalar on a leaf, a whole object on a group,
  the initial rows on an array. Values are deep-cloned, so the form can never mutate your
  config object. An array field whose `defaultValue` is not an array throws, naming the path.
- `formOptions` is forwarded to the base library's `useForm`, read once at mount — most
  notably `mode`/`reValidateMode`, which any field can override. See
  [When validation runs](#when-validation-runs).

## The signal rules

The whole API hands you signals and callbacks — never changing plain values:

1. Never read `signal.value` in a component body — that subscribes the component and causes
   re-renders. Unwrap only inside `computed` / `useComputed` / `effect` / `useSignalEffect`.
2. Pass signals directly to DOM attributes and text content: `disabled={disabledComputed}`,
   `<span>{label}</span>`.
3. Use `<For each={signal}>` for lists and `<Show when={signal}>` for conditionals
   (both from `@preact/signals/utils`).

## Field config

```ts
interface FormlyFieldConfig {
  key?: string | number;        // path segment relative to the parent
  type?: string;                // registered type name
  props?: { label, placeholder, description, disabled, required,
            min, max, minLength, maxLength, pattern, options, type, ... };
  defaultValue?: any;           // applied when the model has no value at this path
  className?: string;
  wrappers?: string[];          // overrides the type's default wrappers; [0] is outermost
  hide?: boolean | Signal<boolean> | ((ctx) => boolean) | string;  // string = expression
  expressions?: {               // dynamic overrides, evaluated in computeds
    "hide"?: ((ctx) => boolean) | string,
    "className"?: value | Signal | ((ctx) => value) | { $expr: string },
    "props.<name>"?: value | Signal | ((ctx) => value) | { $expr: string },
  };
  validators?: {
    validation?: string[];      // names registered via registerValidator
    [name: string]: fn | { expression: fn; message?: string | fn };
  };
  validation?: {
    messages?: Record<string, string | ((error, field) => string)>;
    mode?: ValidationMode;      // overrides formOptions.mode for this field
    reValidateMode?: ReValidateMode;
  };
  fieldGroup?: FormlyFieldConfig[];      // nested group (keyless = transparent)
  fieldGroupClassName?: string;
  fieldArray?: FormlyFieldConfig | ((index: number) => FormlyFieldConfig);
  hooks?: { onInit?, onDestroy? };
}
```

Expression callbacks receive `{ model, formState, field, control, namePath }` — `model` and
`formState` are signals; reading them inside the expression makes it reactive (expressions are
evaluated inside computeds, so no component re-renders).

The three keys are `"hide"`, `"className"` and `"props.<name>"`. Anything else is a mistake:
it is reported once through `console.error`, naming the field, rather than being silently
ignored. TypeScript rejects a wrong _prefix_ (`"prop.disabled"`) outright; a wrong prop _name_
(`"props.disbaled"`) can only be caught at runtime, and is — which matters most for configs
parsed from JSON, where there are no types at all.

`expressions["className"]` overrides `config.className`. Field types and wrappers read the
resolved value as `ctx.className` (a signal), not from `config.className`.

### String expressions (JSON configs)

A config that arrives from a backend is JSON, and JSON cannot carry a callback. So an
expression may also be written as a string:

```json
{
  "key": "city",
  "type": "input",
  "hide": "!model.value.address.country",
  "expressions": {
    "props.disabled": { "$expr": "!model.value.address.country" },
    "props.placeholder": {
      "$expr": "model.value.address.country ? 'Enter a city' : 'Pick a country'"
    }
  }
}
```

`hide` accepts a **bare string** — its target is a boolean, so a string there could never have
been a static value. Everywhere else an expression must be wrapped in `{ "$expr": "..." }`, so
that a plain string stays a plain string (`"props.label": "Name"` keeps working).

The string is **parsed and interpreted, never compiled** — no `eval`, no `new Function`. This
is not only a CSP question: a config from a backend is untrusted input, and compiling it would
be remote code execution in the user's browser. The grammar is the security boundary:

- read from `model`, `formState`, `field`, `namePath` — and nothing else; there is no way to
  name `window`, `fetch` or `constructor`;
- member access and indexing: `model.value.items[0].id` (a missing branch yields `undefined`
  rather than throwing, so `?.` is never required);
- literals, `!`, `- + * / %`, `=== !== == != < > <= >=`, `&& || ??`, and `a ? b : c`;
- calls to a fixed list of pure, non-mutating methods — `includes`, `startsWith`, `endsWith`,
  `indexOf`, `lastIndexOf`, `slice`, `toLowerCase`, `toUpperCase`, `trim`, `charAt`, `at`,
  `split` on strings; `includes`, `indexOf`, `lastIndexOf`, `slice`, `join`, `at` on arrays.
  Anything that can amplify its input (`repeat`, `padStart`) is deliberately excluded.

There is no assignment, no `new`, and no way to call an arbitrary function — including one
that happens to live in your own model. A malformed expression throws, naming the source;
parsed expressions are cached, so a string is parsed once however often it is evaluated.

`props.required/min/max/minLength/maxLength/pattern` map to the base library's built-in rules.

## Builder API

```ts
const builder = createFormlyFormBuilder({ builtIns: true })
  .registerType(name, component, { wrappers, defaultProps, extends })
  .registerArrayType(name, component)
  .registerWrapper(name, component)
  .registerValidator(name, fn, defaultMessage?)
  .registerValidationMessage(errorType, message)
  .registerExtension(name, { prePopulate, onPopulate, postPopulate });

const FormlyForm = builder.build<Model>();
```

- `build()` snapshots the registry — registrations made afterwards don't affect already-built
  components. Call `build()` again to pick them up.
- Re-registering a name overrides it (including built-ins). `{ builtIns: false }` starts headless.
- Built-ins: types `input`, `textarea`, `select`, `checkbox`, `radio`; wrapper `"field"`
  (label + description + error); default messages for the built-in rules.
- `extends` inherits `wrappers` and `defaultProps` from another registered type. The component
  is **not** inherited — `registerType` always takes its own. A circular chain throws.
- Extensions mutate the config draft during resolution, in the order
  `prePopulate` → type defaults merge → `onPopulate` → `postPopulate`. The draft is a private
  clone, so the config object you passed is never touched.
- `hooks.onInit` runs once after a field mounts and may return a cleanup function;
  `hooks.onDestroy` runs on unmount, including when the field is removed from the config.

## Writing a custom type

A type gets `control` and `namePath` and binds its input itself, exactly as it would with
`@dmytromykhailiuk/preact-signal-hook-forms` outside of formly.

**Uncontrolled** — spread `control.register(namePath)` onto the element:

```tsx
import { useComputed } from "@preact/signals";
import { createFieldType } from "@dmytromykhailiuk/preact-signal-formly";

const Text = createFieldType<{ placeholder?: string }>(
  ({ control, namePath, props, errorMessage, id }) => {
    // Renders exactly once. All dynamism = signals.
    const placeholder = useComputed(() => props.value.placeholder ?? "");
    return (
      <div>
        <input
          {...control.register(namePath)}
          id={id}
          placeholder={placeholder}
        />
        <span role="alert">{errorMessage}</span>
      </div>
    );
  }
);
```

**Controlled** — for widgets with no DOM input of their own, use `<Controller>` or
`useController` from the base library:

```tsx
import { Controller } from "@dmytromykhailiuk/preact-signal-hook-forms";

const Rating = createFieldType<{ max?: number }>(
  ({ control, namePath, props, id }) => {
    const max = useComputed(() => props.value.max ?? 5);
    return (
      <Controller
        control={control}
        name={namePath}
        // field.value is a signal; field.onChange/onBlur are callbacks
        render={({ field }) => (
          <div id={id}>
            <span>{field.value}</span> / <span>{max}</span>
            <button
              type="button"
              onClick={() => field.onChange((field.value.peek() ?? 0) + 1)}
            >
              +
            </button>
          </div>
        )}
      />
    );
  }
);

builder.registerType("rating", Rating, { wrappers: ["field"] });
```

`control.register(namePath)` carries the rules derived from the field config (`required`,
`pattern`, `validators`, …); options you pass explicitly win over them. `<Controller>` and
`useController` leave the rules alone, so they keep working too — and a type that binds
nothing at all still validates, because the rules live on the field node.

The context contains: `control` (the `FormControl`, scoped to this field), `namePath`
(the field's dot-path, e.g. `"items.0.name"` — the field's `name`), `formState` (the shared
signal), `config` (readonly signal of the resolved field config), plus `props`, `className`
(both signals, with their `expressions` applied), `fieldState`, `errorMessage`, `id`. Wrappers
get the same plus `children` (`createWrapper`). Array types get `array`
(append/remove/move/…) and `renderItems()` (`createArrayType`).

## Validation

Three layers, all reported per field as signals with resolved messages:

1. **Built-in rules** from `props`: `required`, `min`, `max`, `minLength`, `maxLength`, `pattern`.
2. **Registered validators**: `registerValidator("email", fn, "Invalid email")`, used via
   `validators: { validation: ["email"] }`.
3. **Inline validators**: `validators: { myCheck: (value, model, field) => boolean | string }`
   or `{ expression, message }`. Return `true`/`undefined` = valid, `false` = invalid (message
   resolved from the registry), a string = inline error message. Async validators are supported
   and receive an `AbortSignal`.

Message precedence: field `validation.messages` → inline entry `message` → registry message →
validator default → validator's returned string → error type. Messages may be functions
`(error, field) => string`.

### When validation runs

`mode` decides the behaviour before the first submit; `reValidateMode` takes over once the form
has been submitted **or** while the field is showing an error.

| `mode`              | before the first submit              |
| ------------------- | ------------------------------------ |
| `"all"` _(default)_ | on change and on blur                |
| `"onChange"`        | on every change                      |
| `"onBlur"`          | on blur                              |
| `"onTouched"`       | first on blur, then on every change  |
| `"onSubmit"`        | never — only on submit / `trigger()` |

`reValidateMode` is `"onChange"` (default), `"onBlur"` or `"onSubmit"`.

The default is `"all"` — a config-driven form is usually a long one, and telling someone at
submit time about a field they filled in ten fields ago is the worse default. Note that this
**differs from the base library**, which defaults to `"onSubmit"`. To get that behaviour back:

```tsx
<FormlyForm … formOptions={{ mode: "onSubmit" }} />
```

Set it for the whole form through `formOptions`, and override it per field through
`validation` in the field config — a field may be stricter _or_ looser than its form:

```tsx
<FormlyForm
  model={model}
  config={config}
  formState={formState}
  formOptions={{ mode: "onBlur", reValidateMode: "onChange" }}
/>
```

```ts
defineFields([
  // validates on every keystroke, though the form is "onBlur"
  { key: "slug", type: "input", validation: { mode: "onChange" } },
  // stays quiet until submit, though the form is not
  { key: "notes", type: "textarea", validation: { mode: "onSubmit" } },
]);
```

`formOptions` is forwarded to the base library's `useForm` and read once at mount, so it also
carries `resolver` (zod/yup schemas), `criteriaMode`, `delayError` and `shouldFocusError`.
`defaultValues` is not accepted — the `model` prop and each field's `defaultValue` own that.

Explicit validation — `trigger()`, `handleSubmit()`, `setValue({ shouldValidate: true })` — is
unaffected by any of this and always runs.

## Groups & arrays

- **Groups**: `fieldGroup` nests fields; a `key` prefixes child paths (`address.city`), a
  keyless group is purely visual.
- **Arrays**: `fieldArray` is the item template (or a factory receiving the index). Item paths
  are indexed automatically (`phones.0.number`). Register an array type to own layout and
  add/remove buttons; without one, items render bare. Rows remount on structural changes
  (append/remove/move) by design — the base library re-creates the child field nodes.

## Escape hatch

```tsx
<FormlyForm controlRef={(control) => { /* reset, trigger, handleSubmit, getValues, … */ }} … />
```

## TypeScript

`defineFields` narrows `props` by the registered type name. Pick up custom registrations with
`BuilderTypes`:

```ts
const builder = createFormlyFormBuilder().registerType("rating", Rating);
const fields = defineFields<BuilderTypes<typeof builder>>([
  { key: "score", type: "rating", props: { max: 10 } }, // ✓ typed
]);
```

## License

MIT

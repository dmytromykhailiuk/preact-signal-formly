/**
 * `FormlyField` — internal dispatcher rendering one config entry. Everything
 * dynamic is a computed created once at mount; the components below never
 * re-render on value/model/config changes — updates flow through signals bound
 * directly to the DOM (`For`/`Show` handle structure and visibility).
 */

import { FormControlContext, useFieldArray } from "@dmytromykhailiuk/preact-signal-hook-forms";
import type {
  FieldValues,
  FormControl,
  RegisterOptions,
} from "@dmytromykhailiuk/preact-signal-hook-forms";
import { computed } from "@preact/signals";
import type { ReadonlySignal } from "@preact/signals";
import { For, Show } from "@preact/signals/utils";
import { h } from "preact";
import type { VNode } from "preact";
import { useContext, useEffect, useMemo } from "preact/hooks";
import { scopeControlToField } from "../core/control";
import { seedFieldDefault } from "../core/defaults";
import { evalExpression, evalHideExpression } from "../core/expressions";
import { buildErrorMessage } from "../core/messages";
import type { FormlyRegistry } from "../core/registry";
import { RegistryContext, resolveType, resolveWrapper } from "../core/registry";
import { joinPath, kindOf, populate } from "../core/resolve";
import type { FieldKind } from "../core/resolve";
import { buildRules } from "../core/rules";
import type { ValidationTiming } from "../core/timing";
import { ValidationTimingContext, resolveTiming } from "../core/timing";
import type {
  FieldArrayContext,
  FormlyExpressionCtx,
  FormlyFieldBaseContext,
  FormlyFieldConfig,
  FormlyFieldContext,
  FormlyHookContext,
  WrapperContext,
} from "../types";

let domIdCounter = 0;
const EMPTY_CONFIG: FormlyFieldConfig = {};

export interface FormlyFieldProps {
  config: ReadonlySignal<FormlyFieldConfig | undefined>;
  parentPath: string;
}

interface FieldStatics {
  control: FormControl<FieldValues>;
  registry: FormlyRegistry;
  resolved: ReadonlySignal<FormlyFieldConfig>;
  kind: FieldKind;
  path: string;
  id: string;
  /** Config-derived `RegisterOptions` — `undefined` for groups (they own no value). */
  rules: RegisterOptions | undefined;
  visible: ReadonlySignal<boolean>;
  baseCtx: FormlyFieldBaseContext<any, any>;
}

function buildFieldStatics(
  control: FormControl<FieldValues>,
  registry: FormlyRegistry,
  formTiming: ValidationTiming,
  config: ReadonlySignal<FormlyFieldConfig | undefined>,
  parentPath: string,
): FieldStatics {
  const resolved = computed(() => populate(config.value ?? EMPTY_CONFIG, registry));
  const initial = resolved.peek();
  const kind = kindOf(initial);
  const path = initial.key != null ? joinPath(parentPath, initial.key) : parentPath;
  if (kind !== "group" && path === "") {
    throw new Error(
      `[preact-signal-formly] A ${kind} field${initial.type ? ` of type "${initial.type}"` : ""} needs a "key".`,
    );
  }
  const id = `formly-${domIdCounter++}`;

  // Seeded here, before the branch components mount: an array's row ids are
  // built by `useFieldArray` from the value it finds, so the default has to be
  // in place first. A keyless group is transparent — it addresses its parent's
  // path, so it must not seed anything there.
  if (initial.key != null) {
    if (kind === "array" && initial.defaultValue !== undefined) {
      if (!Array.isArray(initial.defaultValue)) {
        throw new Error(
          `[preact-signal-formly] "defaultValue" of the array field at "${path}" must be an array, got ${typeof initial.defaultValue}.`,
        );
      }
    }
    seedFieldDefault(control, path, initial.defaultValue);
  }

  // Groups own no value, so they carry no rules and need no field-scoped
  // control; leaves and arrays hand their type a control that knows this
  // field's rules and its validation timing. The timing is resolved per call
  // so a config replacement can change `validation.mode` on a mounted field.
  const rules = kind === "group" ? undefined : buildRules(resolved, registry);
  const fieldControl = rules
    ? scopeControlToField(control, path, {
        rules,
        timing: () => resolveTiming(formTiming, resolved.peek().validation),
      })
    : control;

  const exprCtx: FormlyExpressionCtx = {
    model: control.values,
    formState: control.formState.shared,
    field: resolved,
    control: fieldControl,
    namePath: path,
  };

  const props = computed(() => {
    const c = resolved.value;
    const out: Record<string, any> = { ...c.props };
    if (c.expressions) {
      for (const [target, expression] of Object.entries(c.expressions)) {
        if (target.startsWith("props.")) {
          out[target.slice("props.".length)] = evalExpression(expression, exprCtx);
        }
      }
    }
    return out;
  });

  const className = computed(() => {
    const c = resolved.value;
    const override = c.expressions?.className;
    return override === undefined
      ? c.className
      : (evalExpression<string>(override, exprCtx) ?? undefined);
  });

  const visible = computed(() => {
    const c = resolved.value;
    const hide = c.expressions?.hide ?? c.hide;
    return evalHideExpression(hide, exprCtx) !== true;
  });

  const baseCtx: FormlyFieldBaseContext<any, any> = {
    control: fieldControl,
    namePath: path,
    formState: control.formState.shared,
    config: resolved,
    props,
    className,
    id,
  };

  return { control, registry, resolved, kind, path, id, rules, visible, baseCtx };
}

function useFieldHooks(ctx: FormlyHookContext, resolved: ReadonlySignal<FormlyFieldConfig>): void {
  useEffect(() => {
    // Capture at mount: by unmount time the config may already be gone from
    // the list (that is exactly when onDestroy must still fire).
    const hooks = resolved.peek().hooks;
    const cleanup = hooks?.onInit?.(ctx);
    return () => {
      if (typeof cleanup === "function") cleanup();
      hooks?.onDestroy?.(ctx);
    };
  }, []);
}

export function FormlyField(props: FormlyFieldProps): VNode<any> {
  const control = useContext(FormControlContext);
  const registry = useContext(RegistryContext);
  const formTiming = useContext(ValidationTimingContext);
  if (!control || !registry) {
    throw new Error("[preact-signal-formly] FormlyField must be rendered inside a FormlyForm.");
  }

  const statics = useMemo(
    () => buildFieldStatics(control, registry, formTiming, props.config, props.parentPath),
    [],
  );

  // The kind is fixed at mount — a kind/type change remounts through the
  // parent-provided vnode key, so each branch keeps a stable hook order.
  if (statics.kind === "group") return h(FormlyGroupField, { statics });
  if (statics.kind === "array") return h(FormlyArrayField, { statics });
  return h(FormlyLeafField, { statics });
}

/* ------------------------------------------------------------------ *
 * Leaf
 * ------------------------------------------------------------------ */

function FormlyLeafField({ statics }: { statics: FieldStatics }): VNode<any> {
  const { control, registry, resolved, path, rules, baseCtx, visible } = statics;

  const fieldState = useMemo(() => {
    // The node carries the config rules from mount on, so validation works
    // even for types that bind through `<Controller>` (which leaves the rules
    // alone) or that render no input at all.
    control.getField(path).rules = rules as any;
    return control.getFieldState(path);
  }, []);

  const view = useMemo(() => {
    const errorMessage = buildErrorMessage(fieldState.error, resolved, registry);
    const ctx: FormlyFieldContext<any, any> = {
      ...baseCtx,
      fieldState,
      errorMessage,
    };
    const typeName = resolved.peek().type;
    if (!typeName) {
      throw new Error(`[preact-signal-formly] Field at "${path}" has no "type".`);
    }
    const TypeComponent = resolveType(registry, typeName).component;
    const wrapperCtx: Omit<WrapperContext<any, any>, "children"> = {
      ...baseCtx,
      fieldState,
      errorMessage,
    };
    // Wrapper set is fixed at mount; `wrappers[0]` ends up outermost.
    const wrapperNames = resolved.peek().wrappers ?? [];
    const vnode = wrapperNames.reduceRight<VNode<any> | null>(
      (children, name) => h(resolveWrapper(registry, name) as any, { ...wrapperCtx, children }),
      h(TypeComponent as any, ctx as any),
    );
    return { vnode, ctx };
  }, []);

  useFieldHooks(view.ctx, resolved);

  return <Show when={visible}>{view.vnode}</Show>;
}

/* ------------------------------------------------------------------ *
 * Group
 * ------------------------------------------------------------------ */

function FormlyGroupField({ statics }: { statics: FieldStatics }): VNode<any> {
  const { resolved, path, baseCtx, visible } = statics;

  const view = useMemo(() => {
    return {
      groupFields: computed(() => resolved.value.fieldGroup ?? []),
      groupClass: computed(() => resolved.value.fieldGroupClassName ?? ""),
    };
  }, []);

  useFieldHooks(baseCtx, resolved);

  return (
    <Show when={visible}>
      <div class={view.groupClass}>
        <FormlyFieldList fields={view.groupFields} parentPath={path} />
      </div>
    </Show>
  );
}

/* ------------------------------------------------------------------ *
 * Array
 * ------------------------------------------------------------------ */

function materializeItem(
  template: FormlyFieldConfig | ((index: number) => FormlyFieldConfig) | undefined,
  index: number,
): FormlyFieldConfig {
  const base = typeof template === "function" ? template(index) : (template ?? {});
  // The item's own key is always its index — the template describes the item
  // itself, nested keys compose below it ("items.0", "items.0.name", …).
  return { ...base, key: String(index) };
}

function FormlyArrayField({ statics }: { statics: FieldStatics }): VNode<any> {
  const { control, registry, resolved, path, rules, baseCtx, visible } = statics;

  const array = useFieldArray({ control, name: path as any });

  const view = useMemo(() => {
    // Array-level rules (required/minLength/validators) attach to the array node.
    control.getField(path).rules = rules as any;
    const fieldState = control.getFieldState(path);
    const errorMessage = buildErrorMessage(fieldState.error, resolved, registry);

    // Rows remount on every structural change (`mountSeq` in the key): the
    // base library drops and re-creates child field nodes on append/remove/
    // move, so controllers must never survive a structural change.
    let mountSeq = 0;
    const renderItems = (): VNode<any> => (
      <For each={array.fields} getKey={(item: { id: string }) => item.id}>
        {(item: { id: string }, index: number | undefined) => {
          const itemIndex = index ?? 0;
          const itemConfig = computed(() => materializeItem(resolved.value.fieldArray, itemIndex));
          return (
            <FormlyField key={`${item.id}#${mountSeq++}`} config={itemConfig} parentPath={path} />
          );
        }}
      </For>
    );

    const ctx: FieldArrayContext<any, any, any> = {
      ...baseCtx,
      fieldState,
      errorMessage,
      array,
      renderItems,
    };

    const typeName = resolved.peek().type;
    const ArrayComponent = typeName ? registry.arrayTypes.get(typeName) : undefined;
    if (typeName && !ArrayComponent) {
      throw new Error(
        `[preact-signal-formly] Unknown array type "${typeName}". Registered array types: ${
          registry.arrayTypes.size ? [...registry.arrayTypes.keys()].join(", ") : "(none)"
        }.`,
      );
    }
    const vnode = ArrayComponent ? h(ArrayComponent as any, ctx) : renderItems();
    return { vnode, ctx };
  }, []);

  useFieldHooks(view.ctx, resolved);

  return <Show when={visible}>{view.vnode}</Show>;
}

/* ------------------------------------------------------------------ *
 * List
 * ------------------------------------------------------------------ */

function rowKey(config: FormlyFieldConfig, index: number): string {
  return `${config.key ?? `@${index}`}|${kindOf(config)}|${config.type ?? ""}`;
}

export function FormlyFieldList({
  fields,
  parentPath,
}: {
  fields: ReadonlySignal<FormlyFieldConfig[]>;
  parentPath: string;
}): VNode<any> {
  return (
    <For each={fields} getKey={rowKey}>
      {(config: FormlyFieldConfig, index: number | undefined) => {
        const key = rowKey(config, index ?? 0);
        // Derive the row's own config signal from the list so replacing the
        // whole config signal updates mounted fields in place (same row key →
        // same component instance, new values flow through the computed).
        const rowConfig = computed(() => {
          const list = fields.value;
          const found = list.findIndex((c, i) => rowKey(c, i) === key);
          return found >= 0 ? list[found] : undefined;
        });
        return <FormlyField key={key} config={rowConfig} parentPath={parentPath} />;
      }}
    </For>
  );
}

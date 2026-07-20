/**
 * `defaultValue` from a field config, applied to the form control.
 *
 * Seeding the field node alone is not enough: `reset()` restores from — and
 * `isDirty` compares against — the control's `defaultValues`, so a config
 * default that never lands there is wiped by the first reset and reads as
 * dirty from mount. This writes both.
 *
 * `formState.defaultValues` is typed as a `ReadonlySignal` (the base library
 * only ever writes it from `reset`), so the write below is deliberate and
 * cast. It is additive: a path that already has a default — i.e. one the model
 * supplied — is left alone, so the model always wins over the config.
 */

import type { FieldValues, FormControl } from "@dmytromykhailiuk/preact-signal-hook-forms";
import type { Signal } from "@preact/signals";

function toPathSegments(path: string): string[] {
  return path
    .replace(/\[(\w+)\]/g, ".$1")
    .split(".")
    .filter((segment) => segment.length > 0);
}

function isIndex(segment: string): boolean {
  return /^\d+$/.test(segment);
}

function getByPath(root: unknown, segments: string[]): unknown {
  let current: any = root;
  for (const segment of segments) {
    if (current == null) return undefined;
    current = current[segment];
  }
  return current;
}

/**
 * Copy-on-write `set`: clones only the containers along `segments`, so the
 * signal gets a fresh identity (recomputing `isDirty`) without deep-cloning
 * the whole default model on every field mount.
 */
function setByPath(root: unknown, segments: string[], value: unknown): any {
  const [head, ...rest] = segments as [string, ...string[]];
  const base: any =
    root == null
      ? isIndex(head)
        ? []
        : {}
      : Array.isArray(root)
        ? [...root]
        : { ...(root as any) };
  base[head] = rest.length === 0 ? value : setByPath(base[head], rest, value);
  return base;
}

/**
 * Clone a config `defaultValue` before it enters form state, so the form can
 * never mutate the consumer's config object (nor the consumer the form's
 * defaults). Mirrors the base library's own clone semantics: `Date` is copied,
 * file-like values are shared, everything else structural is rebuilt.
 */
function cloneDefault<T>(value: T): T {
  if (value == null || typeof value !== "object") return value;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (typeof File !== "undefined" && (value instanceof File || value instanceof Blob)) return value;
  if (typeof FileList !== "undefined" && value instanceof FileList) return value;
  if (Array.isArray(value)) return value.map(cloneDefault) as T;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    out[key] = cloneDefault((value as Record<string, unknown>)[key]);
  }
  return out as T;
}

/**
 * Apply a config `defaultValue` to `namePath`: record it as the control's
 * default and seed the field's current value. Both steps are skipped when a
 * value is already present, so the model takes precedence over the config —
 * and so an outer field (a group seeding a whole object) wins over the inner
 * fields it already covered.
 *
 * Works for every field kind. For arrays this must run *before*
 * `useFieldArray` is created, since the hook builds its row ids from the value
 * it finds at mount.
 */
export function seedFieldDefault<Model extends FieldValues>(
  control: FormControl<Model>,
  namePath: string,
  defaultValue: unknown,
): void {
  if (defaultValue === undefined) return;
  const segments = toPathSegments(namePath);
  if (segments.length === 0) return;

  const defaults = control.formState.defaultValues as Signal<Partial<Model>>;
  if (getByPath(defaults.peek(), segments) === undefined) {
    defaults.value = setByPath(defaults.peek(), segments, cloneDefault(defaultValue));
  }

  const node = control.getField(namePath);
  if (node.value.peek() === undefined) {
    node.value.value = cloneDefault(defaultValue);
  }
}

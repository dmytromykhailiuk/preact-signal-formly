/**
 * Config resolution: turn a raw field config into a resolved one by applying
 * extensions and the registered type's defaults. Runs inside a computed, so it
 * re-executes whenever the raw config changes.
 *
 * Order (Formly semantics): `prePopulate` → type defaults merge → `onPopulate`
 * → `postPopulate`. Extensions mutate the draft — the raw config object is
 * cloned first so consumer objects are never touched.
 */

import type { FormlyFieldConfig, TypeRegistrationOptions } from "../types";
import type { FormlyRegistry } from "./registry";
import { resolveType } from "./registry";

/** Shallow-clone the draft deep enough that extension mutations stay private. */
function cloneDraft(config: FormlyFieldConfig): FormlyFieldConfig {
  return {
    ...config,
    props: config.props ? { ...config.props } : undefined,
    validators: config.validators ? { ...config.validators } : undefined,
    validation: config.validation
      ? { ...config.validation, messages: { ...config.validation.messages } }
      : undefined,
    expressions: config.expressions ? { ...config.expressions } : undefined,
    wrappers: config.wrappers ? [...config.wrappers] : undefined,
  };
}

/** Merge the type's `extends` chain (base first) into a single options object. */
export function resolveTypeOptions(
  registry: FormlyRegistry,
  typeName: string,
): TypeRegistrationOptions<any> {
  const chain: TypeRegistrationOptions<any>[] = [];
  let current: string | undefined = typeName;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current)) {
      throw new Error(`[preact-signal-formly] Circular "extends" chain for type "${typeName}".`);
    }
    seen.add(current);
    const registration = resolveType(registry, current);
    chain.unshift(registration.options);
    current = registration.options.extends;
  }
  const merged: TypeRegistrationOptions<any> = {};
  for (const options of chain) {
    if (options.wrappers) merged.wrappers = options.wrappers;
    if (options.defaultProps) {
      merged.defaultProps = { ...merged.defaultProps, ...options.defaultProps };
    }
  }
  return merged;
}

/**
 * Report an `expressions` key nothing will ever read.
 *
 * TypeScript catches this in a hand-written config, but a config parsed from
 * JSON has no types at all — and the old behaviour was to silently skip the
 * key, so a single wrong letter left the field mysteriously inert.
 *
 * This reports rather than throws, for two reasons. `populate` runs inside a
 * computed, so after mount a throw is swallowed by the signals effect that
 * reads it: the field would simply freeze, which is worse than the silence it
 * replaced. And a config can arrive from a backend at runtime — a cosmetic
 * typo there should not take the whole form down. Each key is reported once,
 * since resolution re-runs on every config change.
 */
const reportedKeys = new Set<string>();

function reportUnknownExpressionKeys(config: FormlyFieldConfig): void {
  if (!config.expressions) return;
  for (const key of Object.keys(config.expressions)) {
    if (key === "hide" || key === "className" || key.startsWith("props.")) continue;
    const field = config.key != null ? String(config.key) : "(keyless)";
    const seen = `${field}|${key}`;
    if (reportedKeys.has(seen)) continue;
    reportedKeys.add(seen);
    console.error(
      `[preact-signal-formly] Unknown expression key ${JSON.stringify(key)} on field "${field}" — it will be ignored. Expected "hide", "className", or "props.<name>".`,
    );
  }
}

/** Resolve a raw config draft: extensions + type defaults. */
export function populate(config: FormlyFieldConfig, registry: FormlyRegistry): FormlyFieldConfig {
  reportUnknownExpressionKeys(config);
  const draft = cloneDraft(config);
  const extensions = [...registry.extensions.values()];

  for (const extension of extensions) extension.prePopulate?.(draft);

  if (draft.type && registry.types.has(draft.type)) {
    const typeOptions = resolveTypeOptions(registry, draft.type);
    if (typeOptions.defaultProps) {
      draft.props = { ...typeOptions.defaultProps, ...draft.props };
    }
    if (draft.wrappers === undefined && typeOptions.wrappers) {
      draft.wrappers = [...typeOptions.wrappers];
    }
  }

  for (const extension of extensions) extension.onPopulate?.(draft);
  for (const extension of extensions) extension.postPopulate?.(draft);

  return draft;
}

/** Compose a child dot-path. */
export function joinPath(parentPath: string, key: string | number): string {
  const segment = String(key);
  return parentPath ? `${parentPath}.${segment}` : segment;
}

/** What kind of field a config describes. */
export type FieldKind = "group" | "array" | "leaf";

export function kindOf(config: FormlyFieldConfig): FieldKind {
  if (config.fieldGroup) return "group";
  if (config.fieldArray) return "array";
  return "leaf";
}

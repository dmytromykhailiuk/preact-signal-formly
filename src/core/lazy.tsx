/**
 * Code-split registrations — the machinery behind `registerLazyType`,
 * `registerLazyArrayType` and `registerLazyWrapper`.
 *
 * A lazy registration stores a *boundary* component under the ordinary registry
 * key, so every lookup stays synchronous and `core/registry` and `FormlyField`
 * need to know nothing about laziness.
 *
 * The zero-rerender guarantee survives because a chunk arriving is a **signal
 * flip consumed by `<Show>`**, never component state: the boundary's own body
 * reads no `.value`, so it renders exactly once; `Show` is the only subscriber
 * and it flips at most once per registration (`idle → loaded`). Nothing above
 * the boundary reads the signal, so the form, the field, its wrapper chain and
 * every sibling field are untouched when a chunk lands — and the loaded
 * component itself mounts once and never re-renders.
 */

import { computed, signal } from "@preact/signals";
import type { ReadonlySignal } from "@preact/signals";
import { Show } from "@preact/signals/utils";
import { h } from "preact";
import type { VNode } from "preact";
import { useMemo } from "preact/hooks";
import type { LazyComponentLoader, LazyComponentModule, LazyRegistrationOptions } from "../types";

/** What a lazy registration is: used in error messages and `displayName`. */
export type LazyKind = "type" | "array type" | "wrapper";

/** Any of the three component contracts — they all take a context and return a vnode. */
type AnyComponent = (ctx: any) => VNode | null;

type LoadState<C> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; component: C }
  | { status: "error"; error: unknown };

/** What the boundary renders once the load settles; `null` while it is in flight. */
interface LazyView<C> {
  component?: C;
  error?: unknown;
}

export interface LazyResource<C> {
  /**
   * Start the import. Idempotent: a second field using the same registration
   * joins the in-flight promise instead of importing again. A previous failure
   * is retried.
   */
  load(): void;
  /** `null` while idle/loading, then either the component or the error. */
  view: ReadonlySignal<LazyView<C> | null>;
}

/** Unwrap what the loader resolved to. Components are functions; anything else is a miss. */
function pickComponent<C>(module: LazyComponentModule<C>): C | undefined {
  if (typeof module === "function") return module as C;
  const fromDefault = (module as { default?: C } | null | undefined)?.default;
  return typeof fromDefault === "function" ? fromDefault : undefined;
}

/**
 * Memoised loader for one registration. Errors are never rethrown: `populate`
 * and the render path around the boundary must not be taken down by a chunk
 * that failed to arrive (same reasoning as the unknown-expression-key report in
 * `core/resolve`), so a failure is reported and recorded instead.
 */
export function createLazyResource<C extends AnyComponent>(
  loader: LazyComponentLoader<C>,
  kind: LazyKind,
  name: string,
): LazyResource<C> {
  const state = signal<LoadState<C>>({ status: "idle" });

  const view = computed<LazyView<C> | null>(() => {
    const current = state.value;
    if (current.status === "loaded") return { component: current.component };
    if (current.status === "error") return { error: current.error };
    return null;
  });

  const fail = (error: unknown): void => {
    console.error(`[preact-signal-formly] Failed to load lazy ${kind} "${name}".`, error);
    state.value = { status: "error", error };
  };

  const load = (): void => {
    // "error" is retryable — the next mount of a field using this name tries
    // again, so a transient network failure is not permanent.
    const { status } = state.peek();
    if (status === "loading" || status === "loaded") return;
    state.value = { status: "loading" };

    let pending: Promise<LazyComponentModule<C>>;
    try {
      pending = loader();
    } catch (error) {
      // A loader that throws synchronously must not break the render either.
      fail(error);
      return;
    }

    Promise.resolve(pending).then((module) => {
      const component = pickComponent(module);
      if (!component) {
        fail(
          new Error(
            `The loader resolved to a value that is not a component. Return the component itself or a module with a default export — for a named export, map it in the loader: () => import("./X").then((m) => m.X).`,
          ),
        );
        return;
      }
      state.value = { status: "loaded", component };
    }, fail);
  };

  return { load, view };
}

/**
 * Build the boundary component for a lazy registration. One factory covers all
 * three kinds: a field type, an array type and a wrapper all receive their
 * context as props and return a vnode, so the handoff is identical — the
 * per-kind typing lives on the builder methods.
 */
export function createLazyBoundary(
  loader: LazyComponentLoader<AnyComponent>,
  options: LazyRegistrationOptions,
  kind: LazyKind,
  name: string,
): AnyComponent {
  const resource = createLazyResource(loader, kind, name);
  const { errorFallback } = options;

  function LazyBoundary(ctx: any): VNode {
    // First render kicks the import off — before paint, and without touching
    // the render output (`load` writes signals asynchronously, never inline).
    useMemo(() => {
      resource.load();
    }, []);

    // The deliberate component-swapping boundary: `Show` is the single
    // subscriber, it swaps at most once, and `ctx` is handed to the loaded
    // component by reference — it holds only signals and stable references.
    return (
      <Show when={resource.view}>
        {(view) =>
          view.component ? h(view.component, ctx) : (errorFallback?.(view.error) ?? null)
        }
      </Show>
    ) as VNode;
  }

  Object.defineProperty(LazyBoundary, "displayName", { value: `Lazy(${name})` });
  return LazyBoundary;
}

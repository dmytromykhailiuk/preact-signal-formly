import type { FormControl } from "@dmytromykhailiuk/preact-signal-hook-forms";
import { useComputed } from "@preact/signals";
import { act, waitFor } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { createFormlyFormBuilder } from "../src/builder";
import { createArrayType, createFieldType, createWrapper, defineFields } from "../src/create";
import type { BuilderTypes } from "../src/create";
import type { FieldTypeComponent, FormlyBaseProps, FormlyFieldConfig } from "../src/types";
import { renderForm, typeInto } from "./helpers";

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

/** A loader whose resolution moment the test controls. */
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let the loader's promise callbacks run and Preact flush the swap. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const LazyInput = createFieldType(({ control, namePath, props }) => {
  const label = useComputed(() => props.value.label ?? "");
  return (
    <div data-testid="lazy">
      <span data-testid="lazy-label">{label}</span>
      <input data-testid="lazy-input" {...control.register(namePath)} />
    </div>
  );
}, "LazyInput");

const Marker = createFieldType(() => <span data-testid="lazy" />, "Marker");

function errorText(container: HTMLElement): string | null {
  return container.querySelector(".formly-error")?.textContent ?? null;
}

/* ------------------------------------------------------------------ *
 * registerLazyType
 * ------------------------------------------------------------------ */

describe("registerLazyType", () => {
  it("does not load until a field of that type renders", async () => {
    const loader = vi.fn(async () => Marker);
    const Form = createFormlyFormBuilder().registerLazyType("marker", loader).build();
    const rendered = renderForm(Form, [{ key: "a", type: "input" }]);
    expect(loader).not.toHaveBeenCalled();

    await act(async () => {
      rendered.config.value = [
        { key: "a", type: "input" },
        { key: "b", type: "marker" },
      ];
    });
    expect(loader).toHaveBeenCalledTimes(1);
    await settle();
    expect(rendered.container.querySelector('[data-testid="lazy"]')).not.toBeNull();
  });

  it("renders nothing while loading, then swaps the component in", async () => {
    const gate = deferred<FieldTypeComponent<FormlyBaseProps, any>>();
    const Form = createFormlyFormBuilder()
      .registerLazyType("lazy", () => gate.promise)
      .build<{ name: string }>();
    const rendered = renderForm(Form, [{ key: "name", type: "lazy", wrappers: [] }], { name: "x" });

    // The slot is empty — no fallback, nothing at all.
    expect(rendered.container.querySelector('[data-testid="lazy"]')).toBeNull();
    expect(rendered.container.querySelector("form")?.textContent).toBe("");

    await act(async () => {
      gate.resolve(LazyInput);
      await gate.promise;
    });
    const input = rendered.getByTestId("lazy-input") as HTMLInputElement;
    expect(input.value).toBe("x");

    // The swapped-in component is fully wired: typing reaches the model.
    await act(async () => {
      typeInto(input, "typed");
    });
    expect(rendered.model.value.name).toBe("typed");
  });

  it("imports once for many fields using the same registration", async () => {
    const loader = vi.fn(async () => Marker);
    const Form = createFormlyFormBuilder().registerLazyType("marker", loader).build();
    const rendered = renderForm(Form, [
      { key: "a", type: "marker" },
      { key: "b", type: "marker" },
      { key: "c", type: "marker" },
    ]);
    await settle();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(rendered.container.querySelectorAll('[data-testid="lazy"]')).toHaveLength(3);
  });

  it("imports once across array rows, including rows appended later", async () => {
    const loader = vi.fn(async () => LazyInput);
    const Form = createFormlyFormBuilder()
      .registerLazyType("lazy", loader)
      .registerArrayType(
        "repeat",
        createArrayType<string>(({ array, renderItems }) => (
          <div>
            {renderItems()}
            <button type="button" data-testid="add" onClick={() => array.append("")}>
              add
            </button>
          </div>
        )),
      )
      .build<{ tags: string[] }>();
    const rendered = renderForm(
      Form,
      [{ key: "tags", type: "repeat", fieldArray: { type: "lazy", wrappers: [] } }],
      { tags: ["a", "b"] },
    );
    await settle();
    expect(rendered.container.querySelectorAll('[data-testid="lazy"]')).toHaveLength(2);

    await act(async () => {
      rendered.getByTestId("add").click();
    });
    await settle();
    expect(rendered.container.querySelectorAll('[data-testid="lazy"]')).toHaveLength(3);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("two builds from the same builder share the one import", async () => {
    const loader = vi.fn(async () => Marker);
    const builder = createFormlyFormBuilder().registerLazyType("marker", loader);
    const FormA = builder.build();
    const FormB = builder.build();
    renderForm(FormA, [{ key: "a", type: "marker" }]);
    renderForm(FormB, [{ key: "b", type: "marker" }]);
    await settle();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("accepts the component itself, a default export, or a mapped named export", async () => {
    const Form = createFormlyFormBuilder()
      .registerLazyType("direct", async () => Marker)
      .registerLazyType("default", async () => ({ default: Marker }))
      .registerLazyType("named", () => Promise.resolve({ Named: Marker }).then((m) => m.Named))
      .build();
    const rendered = renderForm(Form, [
      { key: "a", type: "direct" },
      { key: "b", type: "default" },
      { key: "c", type: "named" },
    ]);
    await settle();
    expect(rendered.container.querySelectorAll('[data-testid="lazy"]')).toHaveLength(3);
  });

  it("reports a module that carries no component, naming the registration", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const Form = createFormlyFormBuilder()
      .registerLazyType("broken", async () => ({ notDefault: Marker }) as any)
      .build();
    const rendered = renderForm(Form, [{ key: "a", type: "broken" }]);
    await settle();
    expect(rendered.container.querySelector('[data-testid="lazy"]')).toBeNull();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load lazy type "broken"'),
      expect.any(Error),
    );
    spy.mockRestore();
  });

  it("registration options stay eager: wrappers and defaultProps apply before the chunk lands", async () => {
    const gate = deferred<FieldTypeComponent<FormlyBaseProps, any>>();
    let seenProps: Record<string, any> | undefined;
    const probe = createFieldType((ctx) => {
      seenProps = ctx.props.value;
      return <span data-testid="lazy" />;
    });
    const Form = createFormlyFormBuilder()
      .registerLazyType("rating", () => gate.promise, {
        wrappers: ["field"],
        defaultProps: { max: 5, label: "Score" },
      })
      .build();
    const rendered = renderForm(Form, [{ key: "score", type: "rating" }]);

    // The wrapper is eager — the label is on screen around an empty slot.
    expect(rendered.container.querySelector("label")?.textContent).toBe("Score");
    expect(rendered.container.querySelector('[data-testid="lazy"]')).toBeNull();

    await act(async () => {
      gate.resolve(probe);
      await gate.promise;
    });
    expect(rendered.container.querySelector('[data-testid="lazy"]')).not.toBeNull();
    expect(seenProps?.max).toBe(5);
  });

  it("extends inherits wrappers and defaultProps from an eager type", async () => {
    let seenProps: Record<string, any> | undefined;
    const probe = createFieldType((ctx) => {
      seenProps = ctx.props.value;
      return <span data-testid="lazy" />;
    });
    const Form = createFormlyFormBuilder()
      .registerType("base", Marker, { wrappers: ["field"], defaultProps: { max: 5, label: "B" } })
      .registerLazyType("stars", async () => probe, { extends: "base" })
      .build();
    const rendered = renderForm(Form, [{ key: "s", type: "stars" }]);
    expect(rendered.container.querySelector("label")?.textContent).toBe("B");
    await settle();
    expect(seenProps?.max).toBe(5);
  });

  it("the field is live while its chunk loads: defaultValue and validation still work", async () => {
    const gate = deferred<FieldTypeComponent<FormlyBaseProps, any>>();
    const Form = createFormlyFormBuilder()
      .registerLazyType("lazy", () => gate.promise, { wrappers: ["field"] })
      .build<{ name: string; score: number }>();
    let control!: FormControl<{ name: string; score: number }>;
    const rendered = renderForm(
      Form,
      [
        { key: "score", type: "lazy", defaultValue: 3 },
        { key: "name", type: "lazy", props: { label: "Name", required: true } },
      ],
      {} as { name: string; score: number },
      { controlRef: (c: FormControl<{ name: string; score: number }>) => (control = c) },
    );

    // Seeded at field mount, long before the component exists.
    expect(rendered.model.value.score).toBe(3);

    await act(async () => {
      await control.trigger("name");
    });
    await waitFor(() => expect(errorText(rendered.container)).toBe("This field is required"));
    expect(control.formState.isValid.value).toBe(false);

    // And the component still arrives afterwards.
    await act(async () => {
      gate.resolve(Marker);
      await gate.promise;
    });
    expect(rendered.container.querySelectorAll('[data-testid="lazy"]')).toHaveLength(2);
  });

  it("hooks.onInit fires at field mount, before the component loads", async () => {
    const gate = deferred<FieldTypeComponent<FormlyBaseProps, any>>();
    const onInit = vi.fn();
    const Form = createFormlyFormBuilder()
      .registerLazyType("lazy", () => gate.promise)
      .build();
    renderForm(Form, [{ key: "a", type: "lazy", hooks: { onInit } }]);
    expect(onInit).toHaveBeenCalledTimes(1);
    gate.resolve(Marker);
    await settle();
    expect(onInit).toHaveBeenCalledTimes(1);
  });

  it("build() still snapshots: a lazy registration added afterwards does not leak in", () => {
    const builder = createFormlyFormBuilder();
    const Form = builder.build();
    builder.registerLazyType("late", async () => Marker);
    expect(() => renderForm(Form, [{ key: "x", type: "late" }])).toThrow(
      /Unknown field type "late"/,
    );
  });
});

/* ------------------------------------------------------------------ *
 * registerLazyWrapper
 * ------------------------------------------------------------------ */

describe("registerLazyWrapper", () => {
  it("children mount with the wrapper and nesting order is preserved", async () => {
    const gate = deferred<ReturnType<typeof createWrapper>>();
    const inner = createWrapper(({ children }) => <div class="inner">{children}</div>);
    const Form = createFormlyFormBuilder()
      .registerType("bare", Marker)
      .registerLazyWrapper("outer", () => gate.promise)
      .registerWrapper("inner", inner)
      .build();
    const rendered = renderForm(Form, [{ key: "x", type: "bare", wrappers: ["outer", "inner"] }]);

    // Nothing renders — the wrapper owns its children.
    expect(rendered.container.querySelector(".inner")).toBeNull();
    expect(rendered.container.querySelector('[data-testid="lazy"]')).toBeNull();

    await act(async () => {
      gate.resolve(createWrapper(({ children }) => <div class="outer">{children}</div>));
      await gate.promise;
    });
    const outerEl = rendered.container.querySelector(".outer");
    expect(outerEl?.querySelector(".inner")?.querySelector('[data-testid="lazy"]')).not.toBeNull();
  });

  it("an eager wrapper around a lazy one keeps rendering while it loads", async () => {
    const gate = deferred<ReturnType<typeof createWrapper>>();
    const Form = createFormlyFormBuilder()
      .registerType("bare", Marker)
      .registerWrapper(
        "eager",
        createWrapper(({ children }) => <div class="eager">{children}</div>),
      )
      .registerLazyWrapper("lazy-wrap", () => gate.promise)
      .build();
    const rendered = renderForm(Form, [
      { key: "x", type: "bare", wrappers: ["eager", "lazy-wrap"] },
    ]);
    expect(rendered.container.querySelector(".eager")).not.toBeNull();

    await act(async () => {
      gate.resolve(createWrapper(({ children }) => <div class="late">{children}</div>));
      await gate.promise;
    });
    expect(rendered.container.querySelector(".eager .late [data-testid='lazy']")).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * registerLazyArrayType
 * ------------------------------------------------------------------ */

describe("registerLazyArrayType", () => {
  it("renders items once the chunk lands and the array API still works", async () => {
    const gate = deferred<ReturnType<typeof createArrayType>>();
    const loader = vi.fn(() => gate.promise);
    const Form = createFormlyFormBuilder()
      .registerLazyArrayType("repeat", loader)
      .build<{ tags: string[] }>();
    const rendered = renderForm(
      Form,
      [{ key: "tags", type: "repeat", fieldArray: { type: "input", wrappers: [] } }],
      { tags: ["a", "b"] },
    );
    expect(rendered.container.querySelectorAll("input")).toHaveLength(0);

    await act(async () => {
      gate.resolve(
        createArrayType(({ array, renderItems }) => (
          <div>
            {renderItems()}
            <button type="button" data-testid="add" onClick={() => array.append("")}>
              add
            </button>
          </div>
        )),
      );
      await gate.promise;
    });
    expect([...rendered.container.querySelectorAll("input")].map((i) => i.value)).toEqual([
      "a",
      "b",
    ]);

    await act(async () => {
      rendered.getByTestId("add").click();
    });
    expect(rendered.container.querySelectorAll("input")).toHaveLength(3);
    expect(rendered.model.value.tags).toHaveLength(3);
    expect(loader).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ *
 * Failure handling
 * ------------------------------------------------------------------ */

describe("lazy load failures", () => {
  it("renders errorFallback, reports the failure, and leaves the rest of the form alone", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new Error("chunk 404");
    const Form = createFormlyFormBuilder()
      .registerLazyType("lazy", () => Promise.reject(boom), {
        errorFallback: (error) => <p data-testid="err">{String(error)}</p>,
      })
      .build<{ ok: string }>();
    const rendered = renderForm(
      Form,
      [
        { key: "a", type: "lazy" },
        { key: "ok", type: "input", wrappers: [] },
      ],
      { ok: "still here" },
    );
    await settle();

    expect(rendered.getByTestId("err").textContent).toBe("Error: chunk 404");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load lazy type "lazy"'),
      boom,
    );
    // The sibling field is untouched and still functional.
    const input = rendered.container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("still here");
    await act(async () => {
      typeInto(input, "edited");
    });
    expect(rendered.model.value.ok).toBe("edited");
    spy.mockRestore();
  });

  it("without errorFallback the slot stays empty and nothing throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const Form = createFormlyFormBuilder()
      .registerLazyWrapper("lazy-wrap", () => Promise.reject(new Error("nope")))
      .registerType("bare", Marker)
      .build();
    const rendered = renderForm(Form, [{ key: "x", type: "bare", wrappers: ["lazy-wrap"] }]);
    await settle();
    expect(rendered.container.querySelector("form")?.textContent).toBe("");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("survives a loader that throws synchronously, during the very first render", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const Form = createFormlyFormBuilder()
      .registerLazyType(
        "lazy",
        () => {
          throw new Error("bad loader");
        },
        { errorFallback: () => <span data-testid="err" /> },
      )
      .build<{ ok: string }>();
    const rendered = renderForm(
      Form,
      [
        { key: "a", type: "lazy" },
        { key: "ok", type: "input", wrappers: [] },
      ],
      { ok: "fine" },
    );
    await settle();
    expect(rendered.container.querySelector('[data-testid="err"]')).not.toBeNull();
    expect(rendered.container.querySelector("input")).not.toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("retries on the next mount after a failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const loader = vi
      .fn<() => Promise<FieldTypeComponent<FormlyBaseProps, any>>>()
      .mockRejectedValueOnce(new Error("flaky"))
      .mockResolvedValue(Marker);
    const Form = createFormlyFormBuilder().registerLazyType("lazy", loader).build();
    const rendered = renderForm(Form, [{ key: "a", type: "lazy" }]);
    await settle();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(rendered.container.querySelector('[data-testid="lazy"]')).toBeNull();

    // Remount the field — the row key changes, so a fresh boundary mounts.
    await act(async () => {
      rendered.config.value = [{ key: "b", type: "lazy" }];
    });
    await settle();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(rendered.container.querySelector('[data-testid="lazy"]')).not.toBeNull();
    spy.mockRestore();
  });
});

/* ------------------------------------------------------------------ *
 * The zero re-render guarantee
 * ------------------------------------------------------------------ */

describe("lazy loading keeps the zero re-render guarantee", () => {
  it("nothing around a lazy field re-renders when its chunk lands, and nothing re-renders after", async () => {
    const counts = { eager: 0, wrapper: 0, lazyType: 0, insideLazyWrapper: 0 };
    const gateType = deferred<FieldTypeComponent<FormlyBaseProps, any>>();
    const gateWrapper = deferred<ReturnType<typeof createWrapper>>();

    const eagerSibling = createFieldType(({ control, namePath }) => {
      counts.eager++;
      return <input data-testid="eager" {...control.register(namePath)} />;
    });
    const eagerWrapper = createWrapper(({ children }) => {
      counts.wrapper++;
      return <div class="eager-wrap">{children}</div>;
    });
    const lazyType = createFieldType(({ control, namePath, props }) => {
      counts.lazyType++;
      const label = useComputed(() => props.value.label ?? "");
      return (
        <div>
          <span data-testid="lazy-label">{label}</span>
          <input data-testid="lazy-input" {...control.register(namePath)} />
        </div>
      );
    });
    const wrappedType = createFieldType(() => {
      counts.insideLazyWrapper++;
      return <span data-testid="wrapped" />;
    });

    const Form = createFormlyFormBuilder()
      .registerType("eager", eagerSibling)
      .registerType("wrapped", wrappedType)
      .registerWrapper("eager-wrap", eagerWrapper)
      .registerLazyType("lazy", () => gateType.promise, { wrappers: ["eager-wrap"] })
      .registerLazyWrapper("lazy-wrap", () => gateWrapper.promise)
      .build<{ a: string; b: string; c: string }>();

    const baseConfig: FormlyFieldConfig[] = [
      { key: "a", type: "eager" },
      { key: "b", type: "lazy", props: { label: "Score" } },
      { key: "c", type: "wrapped", wrappers: ["lazy-wrap"] },
    ];
    const rendered = renderForm(Form, baseConfig, { a: "", b: "", c: "" });

    expect(counts).toEqual({ eager: 1, wrapper: 1, lazyType: 0, insideLazyWrapper: 0 });

    await act(async () => {
      gateType.resolve(lazyType);
      gateWrapper.resolve(createWrapper(({ children }) => <div class="lw">{children}</div>));
      await Promise.all([gateType.promise, gateWrapper.promise]);
    });

    // The chunks landing mounted the two lazy components and re-rendered
    // nothing else — not the sibling, not the eager wrapper around the lazy type.
    expect(counts).toEqual({ eager: 1, wrapper: 1, lazyType: 1, insideLazyWrapper: 1 });

    const lazyInput = rendered.getByTestId("lazy-input") as HTMLInputElement;
    await act(async () => {
      typeInto(rendered.getByTestId("eager") as HTMLInputElement, "x");
      typeInto(lazyInput, "y");
      rendered.model.value = { a: "a!", b: "b!", c: "" };
    });
    await act(async () => {
      rendered.config.value = [
        { key: "a", type: "eager" },
        { key: "b", type: "lazy", props: { label: "Full score" } },
        { key: "c", type: "wrapped", wrappers: ["lazy-wrap"] },
      ];
    });

    // Signals carried the edits into the DOM of the lazily-loaded component…
    expect(lazyInput.value).toBe("b!");
    expect(rendered.getByTestId("lazy-label").textContent).toBe("Full score");
    // …and still nobody re-rendered.
    expect(counts).toEqual({ eager: 1, wrapper: 1, lazyType: 1, insideLazyWrapper: 1 });
  });
});

/* ------------------------------------------------------------------ *
 * Typing (compile-time — enforced by `npm run typecheck`)
 * ------------------------------------------------------------------ */

interface RatingProps extends FormlyBaseProps {
  max: number;
}

const typedBuilder = createFormlyFormBuilder().registerLazyType<"rating", RatingProps>(
  "rating",
  async () => createFieldType<RatingProps>(() => null),
  { defaultProps: { max: 5 } },
);

type TypedTypes = BuilderTypes<typeof typedBuilder>;
type Assert<T extends true> = T;
/** `registerLazyType` widens the builder's type map exactly like `registerType`. */
type LazyTypeIsRegistered = Assert<"rating" extends keyof TypedTypes ? true : false>;
type LazyTypeCarriesItsProps = Assert<TypedTypes["rating"] extends RatingProps ? true : false>;
/** …so `defineFields` narrows `props` by the lazily-registered name too. */
const typedFields = defineFields<TypedTypes>([
  { key: "score", type: "rating", props: { max: 10, label: "Score" } },
]);

describe("lazy type typing", () => {
  it("registers the lazy type in the builder's type map", () => {
    // Both entries fail to compile unless the assertions above hold.
    const assertions: [LazyTypeIsRegistered, LazyTypeCarriesItsProps] = [true, true];
    expect(assertions).toEqual([true, true]);
  });

  it("keeps built-in types alongside lazily registered ones", () => {
    expect(typedFields).toHaveLength(1);
    const builtIn = defineFields<TypedTypes>([{ key: "email", type: "input" }]);
    expect(builtIn).toHaveLength(1);
  });
});

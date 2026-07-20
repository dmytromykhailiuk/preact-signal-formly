import { createFormControl } from "@dmytromykhailiuk/preact-signal-hook-forms";
import { effect, signal } from "@preact/signals";
import { afterEach, describe, expect, it } from "vitest";
import { bindModel } from "../src/core/sync";

interface Model {
  email: string;
  nested?: { a: string };
}

function setup(defaults: Model) {
  const control = createFormControl<Model>({ defaultValues: defaults });
  const model = signal<Model>(defaults);
  const dispose = bindModel(model, control);
  return { control, model, dispose };
}

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanup) fn();
  cleanup = [];
});

describe("bindModel", () => {
  it("form edits flow into the model signal", () => {
    const { control, model, dispose } = setup({ email: "" });
    cleanup.push(dispose);
    control.register("email");
    control.setFieldValue("email", "a@b.c");
    expect(model.value.email).toBe("a@b.c");
  });

  it("model writes flow into the form", () => {
    const { control, model, dispose } = setup({ email: "" });
    cleanup.push(dispose);
    control.register("email");
    model.value = { email: "from-outside" };
    expect(control.getValues("email")).toBe("from-outside");
    expect(control.values.value.email).toBe("from-outside");
  });

  it("external model writes dirty the form (documented setValue semantics)", () => {
    const { control, model, dispose } = setup({ email: "" });
    cleanup.push(dispose);
    control.register("email");
    model.value = { email: "x" };
    expect(control.formState.isDirty.value).toBe(true);
  });

  it("a deep-equal external write is absorbed without touching the form", () => {
    const { control, model, dispose } = setup({ email: "start" });
    cleanup.push(dispose);
    control.register("email");
    model.value = { email: "start" }; // new object, same content
    expect(control.formState.isDirty.value).toBe(false);
  });

  it("does not loop: bounded effect runs per write in both directions", () => {
    const { control, model, dispose } = setup({ email: "" });
    cleanup.push(dispose);
    control.register("email");

    let modelRuns = 0;
    let valuesRuns = 0;
    cleanup.push(
      effect(() => {
        model.value;
        modelRuns++;
      }),
    );
    cleanup.push(
      effect(() => {
        control.values.value;
        valuesRuns++;
      }),
    );
    modelRuns = 0;
    valuesRuns = 0;

    control.setFieldValue("email", "typed");
    expect(modelRuns).toBeLessThanOrEqual(2);
    expect(valuesRuns).toBeLessThanOrEqual(2);

    modelRuns = 0;
    valuesRuns = 0;
    model.value = { email: "external" };
    expect(modelRuns).toBeLessThanOrEqual(2);
    expect(valuesRuns).toBeLessThanOrEqual(2);

    expect(model.value.email).toBe("external");
    expect(control.getValues("email")).toBe("external");
  });

  it("nested paths sync both ways", () => {
    const { control, model, dispose } = setup({ email: "", nested: { a: "1" } });
    cleanup.push(dispose);
    control.register("nested.a");
    control.setFieldValue("nested.a", "2" as any);
    expect(model.value.nested?.a).toBe("2");
    model.value = { email: "", nested: { a: "3" } };
    expect(control.getValues("nested.a")).toBe("3");
  });

  it("dispose stops the sync", () => {
    const { control, model, dispose } = setup({ email: "" });
    control.register("email");
    dispose();
    control.setFieldValue("email", "after-dispose");
    expect(model.value.email).toBe("");
  });
});

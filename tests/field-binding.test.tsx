/**
 * The binding contract of a field type: it receives `control` + `namePath` and
 * wires the input itself — either uncontrolled (`control.register(namePath)`)
 * or controlled (`<Controller>` / `useController`). Both paths must keep the
 * rules derived from the field config.
 */

import { Controller, useController } from "@dmytromykhailiuk/preact-signal-hook-forms";
import type { FormControl } from "@dmytromykhailiuk/preact-signal-hook-forms";
import { act, waitFor } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { createFormlyFormBuilder } from "../src/builder";
import { createFieldType } from "../src/create";
import { renderForm, typeInto } from "./helpers";

describe("field binding via control + namePath", () => {
  it("register(namePath) keeps the rules derived from the config", async () => {
    const registering = createFieldType(({ control, namePath }) => (
      <input data-testid="in" {...control.register(namePath)} />
    ));
    const Form = createFormlyFormBuilder().registerType("registering", registering).build<{
      name: string;
    }>();
    let control!: FormControl<{ name: string }>;
    renderForm(
      Form,
      [{ key: "name", type: "registering", props: { required: true } }],
      { name: "" },
      { controlRef: (c: FormControl<{ name: string }>) => (control = c) },
    );

    await act(async () => {
      await control.trigger("name");
    });
    await waitFor(() => expect(control.formState.errors.value.name?.type).toBe("required"));
  });

  it("options passed to register win over the config-derived rules", async () => {
    const overriding = createFieldType(({ control, namePath }) => (
      <input data-testid="in" {...control.register(namePath, { required: false })} />
    ));
    const Form = createFormlyFormBuilder().registerType("overriding", overriding).build<{
      name: string;
    }>();
    let control!: FormControl<{ name: string }>;
    renderForm(
      Form,
      [{ key: "name", type: "overriding", props: { required: true } }],
      { name: "" },
      { controlRef: (c: FormControl<{ name: string }>) => (control = c) },
    );

    await act(async () => {
      await control.trigger("name");
    });
    expect(control.formState.isValid.value).toBe(true);
  });

  it("registering a different name does not pick up this field's rules", async () => {
    const crossRegistering = createFieldType(({ control }) => (
      <input data-testid="in" {...control.register("other" as never)} />
    ));
    const Form = createFormlyFormBuilder()
      .registerType("cross", crossRegistering)
      .build<{ name: string; other: string }>();
    let control!: FormControl<{ name: string; other: string }>;
    renderForm(
      Form,
      [{ key: "name", type: "cross", props: { required: true } }],
      { name: "x", other: "" },
      { controlRef: (c: FormControl<{ name: string; other: string }>) => (control = c) },
    );

    await act(async () => {
      await control.trigger("other");
    });
    expect(control.formState.errors.value.other).toBeUndefined();
  });

  it("<Controller> binds a non-DOM widget and keeps the config rules", async () => {
    const picker = createFieldType(({ control, namePath }) => (
      <Controller
        control={control}
        name={namePath}
        render={({ field }) => (
          <button type="button" data-testid="pick" onClick={() => field.onChange("picked")}>
            {field.value}
          </button>
        )}
      />
    ));
    const Form = createFormlyFormBuilder().registerType("picker", picker).build<{ v: string }>();
    let control!: FormControl<{ v: string }>;
    const rendered = renderForm(
      Form,
      [{ key: "v", type: "picker", props: { required: true } }],
      { v: "" },
      { controlRef: (c: FormControl<{ v: string }>) => (control = c) },
    );

    await act(async () => {
      await control.trigger("v");
    });
    await waitFor(() => expect(control.formState.errors.value.v?.type).toBe("required"));

    await act(async () => {
      rendered.getByTestId("pick").click();
    });
    expect(rendered.model.value.v).toBe("picked");
  });

  it("useController reads the value as a signal without re-rendering the type", async () => {
    let renders = 0;
    const mirror = createFieldType(({ control, namePath }) => {
      renders++;
      const { field } = useController<Record<string, any>>({ control, name: namePath });
      return (
        <div>
          <input data-testid="in" {...control.register(namePath)} />
          <span data-testid="echo">{field.value}</span>
        </div>
      );
    });
    const Form = createFormlyFormBuilder().registerType("mirror", mirror).build<{ v: string }>();
    const rendered = renderForm(Form, [{ key: "v", type: "mirror" }], { v: "" });

    await act(async () => {
      typeInto(rendered.getByTestId("in") as HTMLInputElement, "abc");
    });
    expect(rendered.getByTestId("echo").textContent).toBe("abc");
    expect(renders).toBe(1);
  });

  it("a type that never binds still validates — the rules live on the node", async () => {
    const inert = createFieldType(({ namePath }) => <span data-testid="inert">{namePath}</span>);
    const Form = createFormlyFormBuilder().registerType("inert", inert).build<{ v: string }>();
    let control!: FormControl<{ v: string }>;
    renderForm(
      Form,
      [{ key: "v", type: "inert", props: { required: true } }],
      { v: "" },
      { controlRef: (c: FormControl<{ v: string }>) => (control = c) },
    );

    await act(async () => {
      await control.trigger("v");
    });
    expect(control.formState.isValid.value).toBe(false);
  });
});

/**
 * `defaultValue` on a field config seeds the field node when the model has no
 * value at that path — it must reach the model, the DOM, and the control's defaults.
 */

import type { FormControl } from "@dmytromykhailiuk/preact-signal-hook-forms";
import { act } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { createFormlyFormBuilder } from "../src/builder";
import { renderForm, typeInto } from "./helpers";

describe("config defaultValue", () => {
  it("seeds the field and reaches the model and the DOM", async () => {
    const Form = createFormlyFormBuilder().build<{ name: string }>();
    const rendered = renderForm(
      Form,
      [{ key: "name", type: "input", defaultValue: "seeded" }],
      {} as { name: string },
    );
    const input = rendered.container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("seeded");
    expect(rendered.model.value.name).toBe("seeded");
  });

  it("does not override a value already present in the model", () => {
    const Form = createFormlyFormBuilder().build<{ name: string }>();
    const rendered = renderForm(Form, [{ key: "name", type: "input", defaultValue: "seeded" }], {
      name: "from-model",
    });
    const input = rendered.container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("from-model");
    expect(rendered.model.value.name).toBe("from-model");
  });

  it("is recorded as the control's default: survives reset(), starts pristine", async () => {
    const Form = createFormlyFormBuilder().build<{ name: string }>();
    let control!: FormControl<{ name: string }>;
    const rendered = renderForm(
      Form,
      [{ key: "name", type: "input", defaultValue: "seeded" }],
      {} as { name: string },
      { controlRef: (c: FormControl<{ name: string }>) => (control = c) },
    );
    const input = rendered.container.querySelector("input") as HTMLInputElement;
    expect(control.formState.defaultValues.value.name).toBe("seeded");
    expect(control.formState.isDirty.value).toBe(false);

    await act(async () => {
      typeInto(input, "typed");
    });
    expect(rendered.model.value.name).toBe("typed");
    expect(control.formState.isDirty.value).toBe(true);

    await act(async () => {
      control.reset();
    });
    expect(input.value).toBe("seeded");
    expect(rendered.model.value.name).toBe("seeded");
    expect(control.formState.isDirty.value).toBe(false);
  });

  it("a value from the model stays the default — the config never overrides it", () => {
    const Form = createFormlyFormBuilder().build<{ name: string }>();
    let control!: FormControl<{ name: string }>;
    renderForm(
      Form,
      [{ key: "name", type: "input", defaultValue: "seeded" }],
      { name: "from-model" },
      { controlRef: (c: FormControl<{ name: string }>) => (control = c) },
    );
    expect(control.formState.defaultValues.value.name).toBe("from-model");
    expect(control.formState.isDirty.value).toBe(false);
  });

  it("seeds a nested path without dropping its siblings", () => {
    const Form = createFormlyFormBuilder().build<{ user: { first: string; last: string } }>();
    let control!: FormControl<{ user: { first: string; last: string } }>;
    renderForm(
      Form,
      [
        {
          key: "user",
          fieldGroup: [
            { key: "first", type: "input" },
            { key: "last", type: "input", defaultValue: "Doe" },
          ],
        },
      ],
      { user: { first: "Jane", last: undefined as unknown as string } },
      {
        controlRef: (c: FormControl<{ user: { first: string; last: string } }>) => (control = c),
      },
    );
    expect(control.formState.defaultValues.value.user).toEqual({ first: "Jane", last: "Doe" });
    expect(control.formState.isDirty.value).toBe(false);
  });

  it("seeds a field added to the config after mount, defaults included", async () => {
    const Form = createFormlyFormBuilder().build<{ a: string; b: string }>();
    let control!: FormControl<{ a: string; b: string }>;
    const rendered = renderForm(
      Form,
      [{ key: "a", type: "input" }],
      {} as { a: string; b: string },
      { controlRef: (c: FormControl<{ a: string; b: string }>) => (control = c) },
    );

    await act(async () => {
      rendered.config.value = [
        { key: "a", type: "input" },
        { key: "b", type: "input", defaultValue: "late" },
      ];
    });
    expect(rendered.model.value.b).toBe("late");
    // The default is registered on mount, whenever that happens — so a field
    // that appears later is pristine and survives a reset just the same.
    expect(control.formState.defaultValues.value.b).toBe("late");
    expect(control.formState.isDirty.value).toBe(false);

    await act(async () => {
      control.reset();
    });
    expect(rendered.model.value.b).toBe("late");
  });
});

describe("config defaultValue on groups", () => {
  it("seeds the whole group object", () => {
    type Model = { user: { first: string; last: string } };
    const Form = createFormlyFormBuilder().build<Model>();
    let control!: FormControl<Model>;
    const rendered = renderForm(
      Form,
      [
        {
          key: "user",
          defaultValue: { first: "Jane", last: "Doe" },
          fieldGroup: [
            { key: "first", type: "input" },
            { key: "last", type: "input" },
          ],
        },
      ],
      {} as Model,
      { controlRef: (c: FormControl<Model>) => (control = c) },
    );
    const inputs = [...rendered.container.querySelectorAll("input")] as HTMLInputElement[];
    expect(inputs.map((i) => i.value)).toEqual(["Jane", "Doe"]);
    expect(rendered.model.value.user).toEqual({ first: "Jane", last: "Doe" });
    expect(control.formState.isDirty.value).toBe(false);
  });

  it("the group default wins over a child default it already covers", () => {
    type Model = { user: { first: string; last: string } };
    const Form = createFormlyFormBuilder().build<Model>();
    const rendered = renderForm(
      Form,
      [
        {
          key: "user",
          defaultValue: { first: "Jane" },
          fieldGroup: [
            { key: "first", type: "input", defaultValue: "ignored" },
            { key: "last", type: "input", defaultValue: "Doe" },
          ],
        },
      ],
      {} as Model,
    );
    // "first" is covered by the group object; "last" is not, so its own
    // default still applies.
    expect(rendered.model.value.user).toEqual({ first: "Jane", last: "Doe" });
  });

  it("a keyless group is transparent and seeds nothing", () => {
    type Model = { a: string };
    const Form = createFormlyFormBuilder().build<Model>();
    let control!: FormControl<Model>;
    const rendered = renderForm(
      Form,
      [{ defaultValue: { nope: true }, fieldGroup: [{ key: "a", type: "input" }] }],
      {} as Model,
      { controlRef: (c: FormControl<Model>) => (control = c) },
    );
    expect(control.formState.defaultValues.value).toEqual({});
    expect(rendered.model.value).toEqual({ a: undefined });
  });
});

describe("config defaultValue on arrays", () => {
  it("seeds the rows before useFieldArray builds its ids", () => {
    type Model = { phones: { number: string }[] };
    const Form = createFormlyFormBuilder().build<Model>();
    let control!: FormControl<Model>;
    const rendered = renderForm(
      Form,
      [
        {
          key: "phones",
          defaultValue: [{ number: "111" }, { number: "222" }],
          fieldArray: { fieldGroup: [{ key: "number", type: "input" }] },
        },
      ],
      {} as Model,
      { controlRef: (c: FormControl<Model>) => (control = c) },
    );
    const inputs = [...rendered.container.querySelectorAll("input")] as HTMLInputElement[];
    expect(inputs.map((i) => i.value)).toEqual(["111", "222"]);
    expect(rendered.model.value.phones).toEqual([{ number: "111" }, { number: "222" }]);
    expect(control.formState.isDirty.value).toBe(false);
  });

  it("restores the rows on reset() after they were edited away", async () => {
    type Model = { phones: { number: string }[] };
    const Form = createFormlyFormBuilder().registerArrayType("list", ({ renderItems }) => (
      <div>{renderItems()}</div>
    ));
    let control!: FormControl<Model>;
    const rendered = renderForm(
      Form.build<Model>(),
      [
        {
          key: "phones",
          type: "list",
          defaultValue: [{ number: "111" }],
          fieldArray: { fieldGroup: [{ key: "number", type: "input" }] },
        },
      ],
      {} as Model,
      { controlRef: (c: FormControl<Model>) => (control = c) },
    );
    expect(rendered.container.querySelectorAll("input")).toHaveLength(1);

    await act(async () => {
      rendered.model.value = { phones: [] };
    });
    expect(rendered.container.querySelectorAll("input")).toHaveLength(0);

    await act(async () => {
      control.reset();
    });
    expect(rendered.model.value.phones).toEqual([{ number: "111" }]);
    expect(rendered.container.querySelectorAll("input")).toHaveLength(1);
  });

  it("rejects a non-array defaultValue with a descriptive error", () => {
    const Form = createFormlyFormBuilder().build<{ phones: unknown[] }>();
    expect(() =>
      renderForm(Form, [
        {
          key: "phones",
          defaultValue: "not-an-array",
          fieldArray: { fieldGroup: [{ key: "number", type: "input" }] },
        },
      ]),
    ).toThrow(/"defaultValue" of the array field at "phones" must be an array/);
  });

  it("does not mutate the config object it was given", async () => {
    type Model = { phones: { number: string }[] };
    const rows = [{ number: "111" }];
    const Form = createFormlyFormBuilder().build<Model>();
    const rendered = renderForm(
      Form,
      [
        {
          key: "phones",
          defaultValue: rows,
          fieldArray: { fieldGroup: [{ key: "number", type: "input" }] },
        },
      ],
      {} as Model,
    );

    await act(async () => {
      typeInto(rendered.container.querySelector("input") as HTMLInputElement, "999");
    });
    expect(rendered.model.value.phones).toEqual([{ number: "999" }]);
    expect(rows).toEqual([{ number: "111" }]);
  });
});

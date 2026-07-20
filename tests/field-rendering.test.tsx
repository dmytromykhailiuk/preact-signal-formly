import { useComputed } from "@preact/signals";
import { act } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { createFormlyFormBuilder } from "../src/builder";
import { createFieldType } from "../src/create";
import { renderForm, typeInto } from "./helpers";

describe("field rendering", () => {
  it("renders a built-in input with label, placeholder and initial model value", () => {
    const Form = createFormlyFormBuilder().build<{ email: string }>();
    const { container } = renderForm(
      Form,
      [{ key: "email", type: "input", props: { label: "Email", placeholder: "you@site" } }],
      { email: "a@b.c" },
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("a@b.c");
    expect(input.placeholder).toBe("you@site");
    const label = container.querySelector("label") as HTMLLabelElement;
    expect(label.textContent).toBe("Email");
    expect(label.htmlFor).toBe(input.id);
  });

  it("typing flows into the model signal; external model writes flow into the DOM", async () => {
    const Form = createFormlyFormBuilder().build<{ email: string }>();
    const rendered = renderForm(Form, [{ key: "email", type: "input" }], { email: "" });
    const input = rendered.container.querySelector("input") as HTMLInputElement;

    await act(async () => {
      typeInto(input, "typed@x.y");
    });
    expect(rendered.model.value.email).toBe("typed@x.y");

    await act(async () => {
      rendered.model.value = { email: "external@x.y" };
    });
    expect(input.value).toBe("external@x.y");
  });

  it("formState prop is two-way synced with control.formState.shared", async () => {
    let sharedFromInside: any;
    const probe = createFieldType((ctx) => {
      sharedFromInside = ctx.formState;
      return <span />;
    });
    const Form = createFormlyFormBuilder().registerType("probe", probe).build();
    const rendered = renderForm(Form, [{ key: "x", type: "probe" }]);

    await act(async () => {
      rendered.formState.value = { step: 2 };
    });
    expect(sharedFromInside.value).toEqual({ step: 2 });

    const next = { step: 3 };
    await act(async () => {
      sharedFromInside.value = next;
    });
    expect(rendered.formState.value).toBe(next);
  });

  it("zero re-render: a type component renders exactly once across edits", async () => {
    let renders = 0;
    const counting = createFieldType(({ control, namePath, props }) => {
      renders++;
      const label = useComputed(() => props.value.label ?? "");
      return (
        <div>
          <span data-testid="label">{label}</span>
          <input data-testid="in" {...control.register(namePath)} />
        </div>
      );
    });
    const Form = createFormlyFormBuilder().registerType("counting", counting).build<{
      name: string;
    }>();
    const rendered = renderForm(
      Form,
      [{ key: "name", type: "counting", props: { label: "Name" } }],
      { name: "" },
    );
    const input = rendered.getByTestId("in") as HTMLInputElement;

    await act(async () => {
      typeInto(input, "a");
      typeInto(input, "ab");
      rendered.model.value = { name: "abc" };
    });
    // Config replacement updates the label through signals, still no re-render.
    await act(async () => {
      rendered.config.value = [{ key: "name", type: "counting", props: { label: "Full name" } }];
    });

    expect(input.value).toBe("abc");
    expect(rendered.getByTestId("label").textContent).toBe("Full name");
    expect(renders).toBe(1);
  });

  it("field context exposes control, namePath and config signal", () => {
    let seen: any;
    const probe = createFieldType((ctx) => {
      seen = ctx;
      return <span />;
    });
    const Form = createFormlyFormBuilder().registerType("probe", probe).build();
    renderForm(Form, [{ key: "user", type: "probe", props: { label: "L" } }]);
    expect(seen.namePath).toBe("user");
    expect(typeof seen.control.setFieldValue).toBe("function");
    expect(seen.config.value.props.label).toBe("L");
    expect(seen.id).toMatch(/^formly-/);
  });
});

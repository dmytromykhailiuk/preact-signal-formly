import { useComputed } from "@preact/signals";
import { act } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { createFormlyFormBuilder } from "../src/builder";
import { createFieldType } from "../src/create";
import type { FormlyExpressionCtx } from "../src/types";
import { renderForm, typeInto } from "./helpers";

describe("hide", () => {
  it("hide as a callback reading the model toggles rendering reactively", async () => {
    const Form = createFormlyFormBuilder().build<{ type: string; company: string }>();
    const rendered = renderForm(
      Form,
      [
        { key: "type", type: "input" },
        {
          key: "company",
          type: "input",
          props: { label: "Company" },
          hide: ({ model }) => model.value.type !== "business",
        },
      ],
      { type: "personal", company: "" },
    );
    const inputs = () => rendered.container.querySelectorAll("input");
    expect(inputs()).toHaveLength(1);

    await act(async () => {
      rendered.model.value = { type: "business", company: "" };
    });
    expect(inputs()).toHaveLength(2);

    await act(async () => {
      rendered.model.value = { type: "personal", company: "" };
    });
    expect(inputs()).toHaveLength(1);
  });

  it("a hidden field keeps its value and registration", async () => {
    const Form = createFormlyFormBuilder().build<{ show: string; secret: string }>();
    const rendered = renderForm(
      Form,
      [
        { key: "show", type: "input" },
        { key: "secret", type: "input", hide: ({ model }) => model.value.show === "hide-it" },
      ],
      { show: "", secret: "kept" },
    );

    await act(async () => {
      rendered.model.value = { show: "hide-it", secret: "kept" };
    });
    expect(rendered.container.querySelectorAll("input")).toHaveLength(1);
    // Value survives while hidden.
    expect(rendered.model.value.secret).toBe("kept");

    await act(async () => {
      rendered.model.value = { show: "", secret: "kept" };
    });
    const secret = rendered.container.querySelectorAll("input")[1] as HTMLInputElement;
    expect(secret.value).toBe("kept");
  });

  it("expressions.hide takes precedence over the static hide", async () => {
    const Form = createFormlyFormBuilder().build<{ a: string }>();
    const rendered = renderForm(
      Form,
      [
        {
          key: "a",
          type: "input",
          hide: true,
          expressions: { hide: () => false },
        },
      ],
      { a: "" },
    );
    expect(rendered.container.querySelectorAll("input")).toHaveLength(1);
  });
});

describe("expressions", () => {
  it("props.* expressions react to the model without re-rendering the type", async () => {
    let renders = 0;
    const probe = createFieldType(({ control, namePath, props }) => {
      renders++;
      const disabled = useComputed(() => props.value.disabled === true);
      return <input data-testid="in" {...control.register(namePath)} disabled={disabled} />;
    });
    const Form = createFormlyFormBuilder()
      .registerType("probe", probe)
      .build<{ country: string; city: string }>();
    const rendered = renderForm(
      Form,
      [
        { key: "country", type: "input" },
        {
          key: "city",
          type: "probe",
          expressions: {
            "props.disabled": ({ model }: FormlyExpressionCtx) => !model.value.country,
          },
        },
      ],
      { country: "", city: "" },
    );

    const city = rendered.getByTestId("in") as HTMLInputElement;
    expect(city.disabled).toBe(true);

    const country = rendered.container.querySelector("input") as HTMLInputElement;
    await act(async () => {
      typeInto(country, "UA");
    });
    expect(city.disabled).toBe(false);
    expect(renders).toBe(1);
  });

  it("expression values may be signals and static values", async () => {
    let seenLabel: any;
    const probe = createFieldType(({ props }) => {
      seenLabel = props;
      return <span />;
    });
    const Form = createFormlyFormBuilder().registerType("probe", probe).build();
    const rendered = renderForm(Form, [
      {
        key: "x",
        type: "probe",
        props: { label: "initial" },
        expressions: { "props.label": "overridden" },
      },
    ]);
    void rendered;
    expect(seenLabel.value.label).toBe("overridden");
  });

  it("expressions see the shared formState", async () => {
    const Form = createFormlyFormBuilder().build<{ a: string }>();
    const rendered = renderForm(
      Form,
      [
        {
          key: "a",
          type: "input",
          hide: ({ formState }) => formState.value?.hideA === true,
        },
      ],
      { a: "" },
    );
    expect(rendered.container.querySelectorAll("input")).toHaveLength(1);
    await act(async () => {
      rendered.formState.value = { hideA: true };
    });
    expect(rendered.container.querySelectorAll("input")).toHaveLength(0);
  });
});

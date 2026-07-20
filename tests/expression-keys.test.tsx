/**
 * The `expressions` block: which keys are honoured, and what happens to a key
 * that is not. Both matter most for JSON configs, where TypeScript cannot
 * help and a silently ignored key used to look like a broken field.
 */

import { act } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { createFormlyFormBuilder } from "../src/builder";
import { createFieldType } from "../src/create";
import type { FormlyFieldConfig } from "../src/types";
import { renderForm, typeInto } from "./helpers";

const fieldClass = (container: HTMLElement): string | null =>
  container.querySelector("div")?.getAttribute("class") ?? null;

describe('expressions["className"]', () => {
  it("overrides config.className and reacts to the model", async () => {
    const Form = createFormlyFormBuilder().build<{ name: string }>();
    const rendered = renderForm(
      Form,
      [
        {
          key: "name",
          type: "input",
          className: "static-class",
          expressions: {
            className: { $expr: "model.value.name ? 'filled' : 'empty'" },
          },
        },
      ],
      { name: "" },
    );
    expect(fieldClass(rendered.container)).toBe("empty");

    await act(async () => {
      typeInto(rendered.container.querySelector("input") as HTMLInputElement, "x");
    });
    expect(fieldClass(rendered.container)).toBe("filled");
  });

  it("falls back to config.className when there is no expression", () => {
    const Form = createFormlyFormBuilder().build<{ name: string }>();
    const rendered = renderForm(Form, [{ key: "name", type: "input", className: "static" }], {
      name: "",
    });
    expect(fieldClass(rendered.container)).toBe("static");
  });

  it("is exposed on the field context, not only to wrappers", async () => {
    let seen: any;
    const probe = createFieldType((ctx) => {
      seen = ctx;
      return <span />;
    });
    const Form = createFormlyFormBuilder().registerType("probe", probe).build<{ v: string }>();
    const rendered = renderForm(
      Form,
      [
        {
          key: "v",
          type: "probe",
          expressions: { className: { $expr: "model.value.v" } },
        },
      ],
      { v: "from-model" },
    );
    expect(seen.className.value).toBe("from-model");

    await act(async () => {
      rendered.model.value = { v: "changed" };
    });
    expect(seen.className.value).toBe("changed");
  });

  it("works from a JSON config with a callback-free expression", () => {
    const config: FormlyFieldConfig[] = JSON.parse(`[
      {
        "key": "name",
        "type": "input",
        "expressions": { "className": { "$expr": "'row-' + model.value.kind" } }
      }
    ]`);
    const Form = createFormlyFormBuilder().build<{ name: string; kind: string }>();
    const rendered = renderForm(Form, config, { name: "", kind: "wide" });
    expect(fieldClass(rendered.container)).toBe("row-wide");
  });
});

describe("unknown expression keys", () => {
  it("reports instead of silently doing nothing, naming the field and the valid forms", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Form = createFormlyFormBuilder().build<{ name: string }>();
    // The typo that motivated this: "prop." instead of "props.".
    renderForm(Form, [
      { key: "name", type: "input", expressions: { "prop.disabled": true } as any },
    ]);

    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls[0]?.[0]).toMatch(/Unknown expression key "prop\.disabled"/);
    expect(errors.mock.calls[0]?.[0]).toMatch(/on field "name"/);
    expect(errors.mock.calls[0]?.[0]).toMatch(/Expected "hide", "className", or "props\.<name>"/);
    errors.mockRestore();
  });

  it("keeps the form working — the field renders, only the key is ignored", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Form = createFormlyFormBuilder().build<{ name: string }>();
    const rendered = renderForm(
      Form,
      [{ key: "name", type: "input", expressions: { hidden: true } as any }],
      { name: "ok" },
    );
    expect((rendered.container.querySelector("input") as HTMLInputElement).value).toBe("ok");
    errors.mockRestore();
  });

  it("catches a bad key introduced by replacing the config", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Form = createFormlyFormBuilder().build<{ name: string }>();
    const rendered = renderForm(Form, [{ key: "name", type: "input" }], { name: "" });
    expect(errors).not.toHaveBeenCalled();

    await act(async () => {
      rendered.config.value = [
        { key: "name", type: "input", expressions: { classname: "x" } as any },
      ];
    });
    expect(errors.mock.calls[0]?.[0]).toMatch(/Unknown expression key "classname"/);
    // The field is still alive — the report did not take the form down.
    expect(rendered.container.querySelectorAll("input")).toHaveLength(1);
    errors.mockRestore();
  });

  it("reports each bad key once, not on every re-resolution", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Form = createFormlyFormBuilder().build<{ name: string }>();
    const rendered = renderForm(
      Form,
      [{ key: "name", type: "input", expressions: { "wrong.key": true } as any }],
      { name: "" },
    );
    await act(async () => {
      typeInto(rendered.container.querySelector("input") as HTMLInputElement, "a");
      rendered.model.value = { name: "b" };
    });
    expect(errors).toHaveBeenCalledTimes(1);
    errors.mockRestore();
  });

  it("accepts every valid key", () => {
    const Form = createFormlyFormBuilder().build<{ name: string }>();
    expect(() =>
      renderForm(
        Form,
        [
          {
            key: "name",
            type: "input",
            expressions: {
              hide: "false",
              className: "row",
              "props.label": "Name",
              "props.disabled": { $expr: "false" },
            },
          },
        ],
        { name: "" },
      ),
    ).not.toThrow();
  });
});

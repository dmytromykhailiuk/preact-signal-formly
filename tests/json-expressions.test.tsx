/**
 * String expressions inside a real config — the shape a backend would send.
 * Everything here goes through `JSON.parse` first, to prove the config needs
 * no JavaScript at all.
 */

import { act } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { createFormlyFormBuilder } from "../src/builder";
import type { FormlyFieldConfig } from "../src/types";
import { renderForm, typeInto } from "./helpers";

const fromJson = (json: string): FormlyFieldConfig[] => JSON.parse(json);

describe("expressions from a JSON config", () => {
  it('hide takes a bare string — no "$expr" wrapper needed', async () => {
    const config = fromJson(`[
      { "key": "country", "type": "input" },
      {
        "key": "city",
        "type": "input",
        "hide": "!model.value.country"
      }
    ]`);
    const Form = createFormlyFormBuilder().build<{ country: string; city: string }>();
    const rendered = renderForm(Form, config, { country: "", city: "" });

    expect(rendered.container.querySelectorAll("input")).toHaveLength(1);

    await act(async () => {
      typeInto(rendered.container.querySelector("input") as HTMLInputElement, "ua");
    });
    expect(rendered.container.querySelectorAll("input")).toHaveLength(2);
  });

  it("hide works the same inside expressions", async () => {
    const config = fromJson(`[
      { "key": "country", "type": "input" },
      {
        "key": "city",
        "type": "input",
        "expressions": { "hide": "!model.value.country" }
      }
    ]`);
    const Form = createFormlyFormBuilder().build<{ country: string; city: string }>();
    const rendered = renderForm(Form, config, { country: "", city: "" });
    expect(rendered.container.querySelectorAll("input")).toHaveLength(1);

    await act(async () => {
      typeInto(rendered.container.querySelector("input") as HTMLInputElement, "pl");
    });
    expect(rendered.container.querySelectorAll("input")).toHaveLength(2);
  });

  it('props.* takes "$expr" and reacts to the model', async () => {
    const config = fromJson(`[
      { "key": "country", "type": "input" },
      {
        "key": "city",
        "type": "input",
        "props": { "label": "City" },
        "expressions": {
          "props.disabled": { "$expr": "!model.value.country" },
          "props.placeholder": { "$expr": "model.value.country ? 'Enter your city' : 'Pick a country first'" }
        }
      }
    ]`);
    const Form = createFormlyFormBuilder().build<{ country: string; city: string }>();
    const rendered = renderForm(Form, config, { country: "", city: "" });
    const [country, city] = [...rendered.container.querySelectorAll("input")] as HTMLInputElement[];

    expect((city as HTMLInputElement).disabled).toBe(true);
    expect((city as HTMLInputElement).placeholder).toBe("Pick a country first");

    await act(async () => {
      typeInto(country as HTMLInputElement, "ua");
    });
    expect((city as HTMLInputElement).disabled).toBe(false);
    expect((city as HTMLInputElement).placeholder).toBe("Enter your city");
  });

  it("a plain string in props.* stays a literal", () => {
    const config = fromJson(`[
      {
        "key": "city",
        "type": "input",
        "expressions": { "props.placeholder": "Enter your city" }
      }
    ]`);
    const Form = createFormlyFormBuilder().build<{ city: string }>();
    const rendered = renderForm(Form, config, { city: "" });
    expect((rendered.container.querySelector("input") as HTMLInputElement).placeholder).toBe(
      "Enter your city",
    );
  });

  it("reads through a nested path and a whitelisted method", async () => {
    const config = fromJson(`[
      { "key": "email", "type": "input" },
      {
        "key": "domain",
        "type": "input",
        "hide": "!model.value.email.includes('@')"
      }
    ]`);
    const Form = createFormlyFormBuilder().build<{ email: string; domain: string }>();
    const rendered = renderForm(Form, config, { email: "", domain: "" });
    expect(rendered.container.querySelectorAll("input")).toHaveLength(1);

    await act(async () => {
      typeInto(rendered.container.querySelector("input") as HTMLInputElement, "a@b.c");
    });
    expect(rendered.container.querySelectorAll("input")).toHaveLength(2);
  });

  it("reads formState, not just the model", async () => {
    const config = fromJson(`[
      { "key": "advanced", "type": "input", "hide": "formState.value.step !== 2" }
    ]`);
    const Form = createFormlyFormBuilder().build<{ advanced: string }>();
    const rendered = renderForm(Form, config, { advanced: "" });
    rendered.formState.value = { step: 1 };
    await act(async () => {});
    expect(rendered.container.querySelectorAll("input")).toHaveLength(0);

    await act(async () => {
      rendered.formState.value = { step: 2 };
    });
    expect(rendered.container.querySelectorAll("input")).toHaveLength(1);
  });

  it("a malformed expression fails loudly, naming the source", () => {
    const config = fromJson(`[
      { "key": "city", "type": "input", "hide": "!model.value.country &&" }
    ]`);
    const Form = createFormlyFormBuilder().build<{ city: string }>();
    expect(() => renderForm(Form, config, { city: "" })).toThrow(
      /Invalid expression "!model\.value\.country &&"/,
    );
  });
});

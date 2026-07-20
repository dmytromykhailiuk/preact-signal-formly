import { act } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { createFormlyFormBuilder } from "../src/builder";
import { renderForm, typeInto } from "./helpers";

describe("built-in types", () => {
  it("textarea round-trips values", async () => {
    const Form = createFormlyFormBuilder().build<{ bio: string }>();
    const rendered = renderForm(Form, [{ key: "bio", type: "textarea" }], { bio: "hello" });
    const textarea = rendered.container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.value).toBe("hello");
    await act(async () => {
      typeInto(textarea, "updated");
    });
    expect(rendered.model.value.bio).toBe("updated");
  });

  it("select renders options and round-trips selection", async () => {
    const Form = createFormlyFormBuilder().build<{ color: string }>();
    const rendered = renderForm(
      Form,
      [
        {
          key: "color",
          type: "select",
          props: {
            options: [
              { value: "red", label: "Red" },
              { value: "blue", label: "Blue" },
            ],
          },
        },
      ],
      { color: "blue" },
    );
    const select = rendered.container.querySelector("select") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["Red", "Blue"]);
    expect(select.value).toBe("blue");

    await act(async () => {
      select.value = "red";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(rendered.model.value.color).toBe("red");
  });

  it("checkbox passes checked (not the event target value)", async () => {
    const Form = createFormlyFormBuilder().build<{ agreed: boolean }>();
    const rendered = renderForm(Form, [{ key: "agreed", type: "checkbox" }], { agreed: false });
    const checkbox = rendered.container.querySelector("input") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    await act(async () => {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(rendered.model.value.agreed).toBe(true);

    await act(async () => {
      rendered.model.value = { agreed: false };
    });
    expect(checkbox.checked).toBe(false);
  });

  it("radio selects by option value", async () => {
    const Form = createFormlyFormBuilder().build<{ size: string }>();
    const rendered = renderForm(
      Form,
      [
        {
          key: "size",
          type: "radio",
          props: {
            options: [
              { value: "s", label: "Small" },
              { value: "m", label: "Medium" },
            ],
          },
        },
      ],
      { size: "m" },
    );
    const radios = [...rendered.container.querySelectorAll("input")] as HTMLInputElement[];
    expect(radios).toHaveLength(2);
    expect(radios[1]!.checked).toBe(true);

    await act(async () => {
      // The radio reads the selection off the DOM, as a browser would: the
      // element is checked first, the event only announces it.
      radios[0]!.checked = true;
      radios[0]!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(rendered.model.value.size).toBe("s");
  });

  it("input honors props.type and disabled", () => {
    const Form = createFormlyFormBuilder().build<{ age: string }>();
    const rendered = renderForm(Form, [
      { key: "age", type: "input", props: { type: "number", disabled: true } },
    ]);
    const input = rendered.container.querySelector("input") as HTMLInputElement;
    expect(input.type).toBe("number");
    expect(input.disabled).toBe(true);
  });
});

import { act } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { createFormlyFormBuilder } from "../src/builder";
import { createFieldType } from "../src/create";
import { renderForm, typeInto } from "./helpers";

const pathProbe = createFieldType(({ namePath }) => <span class="path">{namePath}</span>);

describe("field groups", () => {
  it("a keyed group prefixes child paths", () => {
    const Form = createFormlyFormBuilder().registerType("probe", pathProbe).build();
    const { container } = renderForm(Form, [
      {
        key: "address",
        fieldGroup: [
          { key: "city", type: "probe" },
          { key: "street", type: "probe" },
        ],
      },
    ]);
    const paths = [...container.querySelectorAll(".path")].map((el) => el.textContent);
    expect(paths).toEqual(["address.city", "address.street"]);
  });

  it("a keyless group is transparent (no path prefix)", () => {
    const Form = createFormlyFormBuilder().registerType("probe", pathProbe).build();
    const { container } = renderForm(Form, [
      {
        fieldGroup: [{ key: "email", type: "probe" }],
        fieldGroupClassName: "row",
      },
    ]);
    expect(container.querySelector(".path")?.textContent).toBe("email");
    expect(container.querySelector(".row")).not.toBeNull();
  });

  it("nested groups compose paths and values sync into the model", async () => {
    const Form = createFormlyFormBuilder().build<{
      user: { address: { city: string } };
    }>();
    const rendered = renderForm(
      Form,
      [
        {
          key: "user",
          fieldGroup: [
            {
              key: "address",
              fieldGroup: [{ key: "city", type: "input" }],
            },
          ],
        },
      ],
      { user: { address: { city: "Kyiv" } } },
    );
    const input = rendered.container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("Kyiv");

    await act(async () => {
      typeInto(input, "Lviv");
    });
    expect(rendered.model.value.user.address.city).toBe("Lviv");
  });

  it("hiding a group hides all children", async () => {
    const Form = createFormlyFormBuilder().build<{ toggle: string; a: string; b: string }>();
    const rendered = renderForm(
      Form,
      [
        { key: "toggle", type: "input" },
        {
          fieldGroup: [
            { key: "a", type: "input" },
            { key: "b", type: "input" },
          ],
          hide: ({ model }) => model.value.toggle === "off",
        },
      ],
      { toggle: "", a: "", b: "" },
    );
    expect(rendered.container.querySelectorAll("input")).toHaveLength(3);
    await act(async () => {
      rendered.model.value = { toggle: "off", a: "", b: "" };
    });
    expect(rendered.container.querySelectorAll("input")).toHaveLength(1);
  });
});

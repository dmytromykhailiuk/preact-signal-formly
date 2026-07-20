import type { FormControl } from "@dmytromykhailiuk/preact-signal-hook-forms";
import { useComputed } from "@preact/signals";
import { act } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { createFormlyFormBuilder } from "../src/builder";
import { createArrayType } from "../src/create";
import type { FieldArrayContext } from "../src/types";
import { renderForm, typeInto } from "./helpers";

interface Model {
  phones: Array<{ number: string }>;
}

const repeat = createArrayType<{ number: string }>(({ array, renderItems }) => (
  <div>
    {renderItems()}
    <button type="button" data-testid="add" onClick={() => array.append({ number: "" })}>
      add
    </button>
    <button type="button" data-testid="remove-first" onClick={() => array.remove(0)}>
      remove
    </button>
    <button type="button" data-testid="move-down" onClick={() => array.move(0, 1)}>
      move
    </button>
  </div>
));

function setup(initial: Model = { phones: [{ number: "111" }, { number: "222" }] }) {
  const Form = createFormlyFormBuilder().registerArrayType("repeat", repeat).build<Model>();
  return renderForm(
    Form,
    [
      {
        key: "phones",
        type: "repeat",
        fieldArray: { fieldGroup: [{ key: "number", type: "input" }] },
      },
    ],
    initial,
  );
}

function inputValues(container: HTMLElement): string[] {
  return [...container.querySelectorAll("input")].map((i) => (i as HTMLInputElement).value);
}

describe("field arrays", () => {
  it("renders one row per item from the template", () => {
    const rendered = setup();
    expect(inputValues(rendered.container)).toEqual(["111", "222"]);
  });

  it("append adds a row and syncs the model", async () => {
    const rendered = setup();
    await act(async () => {
      rendered.getByTestId("add").click();
    });
    expect(inputValues(rendered.container)).toEqual(["111", "222", ""]);
    expect(rendered.model.value.phones).toHaveLength(3);
  });

  it("remove drops the row and reindexes paths", async () => {
    const rendered = setup();
    await act(async () => {
      rendered.getByTestId("remove-first").click();
    });
    expect(inputValues(rendered.container)).toEqual(["222"]);
    expect(rendered.model.value.phones).toEqual([{ number: "222" }]);

    // The remaining row is now phones.0 — typing must hit the right path.
    const input = rendered.container.querySelector("input") as HTMLInputElement;
    await act(async () => {
      typeInto(input, "333");
    });
    expect(rendered.model.value.phones).toEqual([{ number: "333" }]);
  });

  it("move reorders rows and the model", async () => {
    const rendered = setup();
    await act(async () => {
      rendered.getByTestId("move-down").click();
    });
    expect(inputValues(rendered.container)).toEqual(["222", "111"]);
    expect(rendered.model.value.phones).toEqual([{ number: "222" }, { number: "111" }]);
  });

  it("editing a row after structural changes writes to the correct index", async () => {
    const rendered = setup();
    await act(async () => {
      rendered.getByTestId("add").click();
    });
    const last = [...rendered.container.querySelectorAll("input")].at(-1) as HTMLInputElement;
    await act(async () => {
      typeInto(last, "999");
    });
    expect(rendered.model.value.phones[2]).toEqual({ number: "999" });
    expect(rendered.model.value.phones[0]).toEqual({ number: "111" });
  });

  it("array type context exposes the array API and fieldState", () => {
    let seen: FieldArrayContext | undefined;
    const probe = createArrayType((ctx) => {
      seen = ctx;
      return ctx.renderItems();
    });
    const Form = createFormlyFormBuilder().registerArrayType("probe", probe).build<Model>();
    renderForm(
      Form,
      [
        {
          key: "phones",
          type: "probe",
          fieldArray: { fieldGroup: [{ key: "number", type: "input" }] },
        },
      ],
      { phones: [{ number: "1" }] },
    );
    expect(seen?.namePath).toBe("phones");
    expect(typeof seen?.array.append).toBe("function");
    expect(seen?.array.fields.value).toHaveLength(1);
    expect(seen?.fieldState.error.value).toBeUndefined();
  });

  it("without an array type, items render bare via the template", () => {
    const Form = createFormlyFormBuilder().build<Model>();
    const rendered = renderForm(
      Form,
      [{ key: "phones", fieldArray: { fieldGroup: [{ key: "number", type: "input" }] } }],
      { phones: [{ number: "a" }, { number: "b" }] },
    );
    expect(inputValues(rendered.container)).toEqual(["a", "b"]);
  });

  it("a scalar item template (leaf without fieldGroup) maps items directly", async () => {
    const Form = createFormlyFormBuilder().build<{ tags: string[] }>();
    const rendered = renderForm(Form, [{ key: "tags", fieldArray: { type: "input" } }], {
      tags: ["x", "y"],
    });
    expect(inputValues(rendered.container)).toEqual(["x", "y"]);
    const first = rendered.container.querySelector("input") as HTMLInputElement;
    await act(async () => {
      typeInto(first, "z");
    });
    expect(rendered.model.value.tags).toEqual(["z", "y"]);
  });

  it("fieldArray as a factory receives the index", () => {
    const Form = createFormlyFormBuilder().build<{ items: string[] }>();
    const rendered = renderForm(
      Form,
      [
        {
          key: "items",
          fieldArray: (index) => ({ type: "input", props: { placeholder: `item #${index}` } }),
        },
      ],
      { items: ["", ""] },
    );
    const placeholders = [...rendered.container.querySelectorAll("input")].map(
      (i) => (i as HTMLInputElement).placeholder,
    );
    expect(placeholders).toEqual(["item #0", "item #1"]);
  });

  it("external model writes replace array content in the DOM", async () => {
    const rendered = setup();
    await act(async () => {
      rendered.model.value = { phones: [{ number: "only" }] };
    });
    expect(inputValues(rendered.container)).toEqual(["only"]);
  });
});

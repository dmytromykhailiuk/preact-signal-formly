import { describe, expect, it } from "vitest";
import { createFormlyFormBuilder } from "../src/builder";
import { createFieldType, defineFields } from "../src/create";
import type { BuilderTypes } from "../src/create";
import { renderForm } from "./helpers";

describe("defineFields", () => {
  it("returns the config array unchanged and renders", () => {
    const fields = defineFields([
      { key: "email", type: "input", props: { label: "Email" } },
      { fieldGroup: [{ key: "city", type: "input" }] },
    ]);
    const Form = createFormlyFormBuilder().build();
    const { container } = renderForm(Form, fields);
    expect(container.querySelectorAll("input")).toHaveLength(2);
  });

  it("narrows props by custom registered types via BuilderTypes", () => {
    interface RatingProps {
      max: number;
      [key: string]: any;
    }
    const rating = createFieldType<RatingProps>(({ props, control, namePath }) => (
      <span data-testid="rating">
        {control.watch(namePath)}/{props.value.max}
      </span>
    ));
    const builder = createFormlyFormBuilder().registerType("rating", rating);
    const fields = defineFields<BuilderTypes<typeof builder>>([
      // `max` is known and required to be a number for type "rating".
      { key: "score", type: "rating", props: { max: 5 } },
      { key: "name", type: "input", props: { label: "Name" } },
    ]);
    const Form = builder.build<{ score: number; name: string }>();
    const rendered = renderForm(Form, fields, { score: 3, name: "" });
    expect(rendered.getByTestId("rating").textContent).toBe("3/5");
  });
});

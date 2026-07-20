import { describe, expect, it } from "vitest";
import { createFormlyFormBuilder } from "../src/builder";
import { createFieldType } from "../src/create";
import { renderForm } from "./helpers";

const customType = createFieldType(({ namePath }) => (
  <span data-testid="custom">custom:{namePath}</span>
));

describe("createFormlyFormBuilder", () => {
  it("is chainable and returns the same builder instance", () => {
    const builder = createFormlyFormBuilder();
    const chained = builder
      .registerType("a", customType)
      .registerWrapper("w", ({ children }) => <div>{children}</div>)
      .registerValidator("v", () => true)
      .registerValidationMessage("v", "bad")
      .registerExtension("e", {});
    expect(chained).toBe(builder as any);
  });

  it("renders a registered custom type", () => {
    const Form = createFormlyFormBuilder().registerType("custom", customType).build();
    const { getByTestId } = renderForm(Form, [{ key: "x", type: "custom" }]);
    expect(getByTestId("custom").textContent).toBe("custom:x");
  });

  it("throws a descriptive error for an unknown type", () => {
    const Form = createFormlyFormBuilder().build();
    expect(() => renderForm(Form, [{ key: "x", type: "nope" }])).toThrow(
      /Unknown field type "nope".*input/,
    );
  });

  it("registers built-ins by default and supports overriding them", () => {
    const Form = createFormlyFormBuilder().build();
    const { container } = renderForm(Form, [{ key: "email", type: "input" }]);
    expect(container.querySelector("input")).not.toBeNull();

    const Overridden = createFormlyFormBuilder().registerType("input", customType).build();
    const { getByTestId } = renderForm(Overridden, [{ key: "email", type: "input" }]);
    expect(getByTestId("custom").textContent).toBe("custom:email");
  });

  it("builtIns: false gives a headless builder", () => {
    const Form = createFormlyFormBuilder({ builtIns: false }).build();
    expect(() => renderForm(Form, [{ key: "x", type: "input" }])).toThrow(
      /Unknown field type "input".*\(none\)/,
    );
  });

  it("build() snapshots the registry — later registrations do not leak in", () => {
    const builder = createFormlyFormBuilder();
    const Form = builder.build();
    builder.registerType("late", customType);
    expect(() => renderForm(Form, [{ key: "x", type: "late" }])).toThrow(
      /Unknown field type "late"/,
    );
    // A new build() picks the late registration up.
    const Form2 = builder.build();
    const { getByTestId } = renderForm(Form2, [{ key: "x", type: "late" }]);
    expect(getByTestId("custom")).toBeTruthy();
  });
});

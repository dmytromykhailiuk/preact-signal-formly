import { describe, expect, it } from "vitest";
import { createFormlyFormBuilder } from "../src/builder";
import { createFieldType, createWrapper } from "../src/create";
import { renderForm } from "./helpers";

const bareType = createFieldType(() => <span class="control" />);

describe("wrappers", () => {
  it("wrappers[0] is outermost in the DOM", () => {
    const outer = createWrapper(({ children }) => <div class="outer">{children}</div>);
    const inner = createWrapper(({ children }) => <div class="inner">{children}</div>);
    const Form = createFormlyFormBuilder()
      .registerType("bare", bareType)
      .registerWrapper("outer", outer)
      .registerWrapper("inner", inner)
      .build();
    const { container } = renderForm(Form, [
      { key: "x", type: "bare", wrappers: ["outer", "inner"] },
    ]);
    const outerEl = container.querySelector(".outer");
    expect(outerEl?.querySelector(".inner")?.querySelector(".control")).not.toBeNull();
  });

  it("config wrappers override the type's default wrappers", () => {
    const marked = createWrapper(({ children }) => <div class="marked">{children}</div>);
    const Form = createFormlyFormBuilder().registerWrapper("marked", marked).build();
    // Built-in input defaults to the "field" wrapper — override with "marked".
    const { container } = renderForm(Form, [{ key: "x", type: "input", wrappers: ["marked"] }]);
    expect(container.querySelector(".marked")).not.toBeNull();
    expect(container.querySelector(".formly-field")).toBeNull();
  });

  it("empty wrappers list removes the default wrapper entirely", () => {
    const Form = createFormlyFormBuilder().build();
    const { container } = renderForm(Form, [
      { key: "x", type: "input", wrappers: [], props: { label: "L" } },
    ]);
    expect(container.querySelector(".formly-field")).toBeNull();
    expect(container.querySelector("label")).toBeNull();
    expect(container.querySelector("input")).not.toBeNull();
  });

  it("wrapper context exposes props/config/errorMessage but not field", () => {
    let seen: any;
    const probe = createWrapper((ctx) => {
      seen = ctx;
      return <div>{ctx.children}</div>;
    });
    const Form = createFormlyFormBuilder().registerWrapper("probe", probe).build();
    renderForm(Form, [
      { key: "x", type: "input", wrappers: ["probe"], props: { label: "Wrapped" } },
    ]);
    expect(seen.props.value.label).toBe("Wrapped");
    expect(seen.namePath).toBe("x");
    expect(seen.errorMessage.value).toBeUndefined();
    expect(seen.field).toBeUndefined();
    expect(seen.fieldState).toBeDefined();
  });

  it("unknown wrapper name throws a descriptive error", () => {
    const Form = createFormlyFormBuilder().build();
    expect(() => renderForm(Form, [{ key: "x", type: "input", wrappers: ["nope"] }])).toThrow(
      /Unknown wrapper "nope".*field/,
    );
  });
});

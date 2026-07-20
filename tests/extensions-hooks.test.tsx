import { act } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { createFormlyFormBuilder } from "../src/builder";
import { createExtension, createFieldType } from "../src/create";
import { renderForm } from "./helpers";

const labelProbe = createFieldType(({ props }) => {
  return <span class="label-probe">{props.value.label ?? ""}</span>;
});

describe("extensions", () => {
  it("runs prePopulate → defaults merge → onPopulate → postPopulate", () => {
    const order: string[] = [];
    const ext = createExtension({
      prePopulate: (field) => {
        order.push(`pre:${field.props?.label ?? "none"}`);
        field.props = { ...field.props, label: "from-pre" };
      },
      onPopulate: (field) => {
        order.push(`on:${field.props?.label}`);
      },
      postPopulate: (field) => {
        order.push(`post:${field.props?.label}`);
        field.props = { ...field.props, label: `${field.props?.label}+post` };
      },
    });
    const Form = createFormlyFormBuilder()
      .registerType("probe", labelProbe, { defaultProps: { label: "default" } })
      .registerExtension("test", ext)
      .build();
    const { container } = renderForm(Form, [{ key: "x", type: "probe" }]);
    // prePopulate set the label, so the type default must NOT override it.
    expect(order.slice(0, 3)).toEqual(["pre:none", "on:from-pre", "post:from-pre"]);
    expect(container.querySelector(".label-probe")?.textContent).toBe("from-pre+post");
  });

  it("extension mutations never leak into the consumer's config object", () => {
    const ext = createExtension({
      prePopulate: (field) => {
        field.props = { ...field.props, injected: true };
      },
    });
    const Form = createFormlyFormBuilder().registerExtension("inject", ext).build();
    const config = [{ key: "x", type: "input", props: { label: "L" } }];
    renderForm(Form, config);
    expect((config[0]!.props as any).injected).toBeUndefined();
  });
});

describe("type inheritance (extends)", () => {
  it("inherits defaultProps and wrappers through the extends chain", () => {
    const Form = createFormlyFormBuilder()
      .registerType("base", labelProbe, {
        defaultProps: { label: "base-label", placeholder: "base-ph" },
      })
      .registerType("child", labelProbe, {
        extends: "base",
        defaultProps: { label: "child-label" },
      })
      .build();
    let seen: any;
    const probe = createFieldType((ctx) => {
      seen = ctx;
      return <span />;
    });
    const Form2 = createFormlyFormBuilder()
      .registerType("base", probe, {
        defaultProps: { label: "base-label", placeholder: "base-ph" },
      })
      .registerType("child", probe, { extends: "base", defaultProps: { label: "child-label" } })
      .build();
    renderForm(Form2, [{ key: "x", type: "child" }]);
    expect(seen.props.value.label).toBe("child-label");
    expect(seen.props.value.placeholder).toBe("base-ph");
    void Form;
  });

  it("throws on a circular extends chain", () => {
    const Form = createFormlyFormBuilder()
      .registerType("a", labelProbe, { extends: "b" })
      .registerType("b", labelProbe, { extends: "a" })
      .build();
    expect(() => renderForm(Form, [{ key: "x", type: "a" }])).toThrow(/Circular "extends"/);
  });
});

describe("hooks", () => {
  it("onInit runs on mount with the field context; cleanup and onDestroy run on unmount", async () => {
    const calls: string[] = [];
    const onDestroy = vi.fn(() => calls.push("destroy"));
    const Form = createFormlyFormBuilder().build();
    const rendered = renderForm(Form, [
      {
        key: "x",
        type: "input",
        hooks: {
          onInit: (ctx) => {
            calls.push(`init:${ctx.namePath}`);
            return () => calls.push("cleanup");
          },
          onDestroy,
        },
      },
    ]);
    expect(calls).toEqual(["init:x"]);

    await act(async () => {
      rendered.unmount();
    });
    expect(calls).toEqual(["init:x", "cleanup", "destroy"]);
  });

  it("removing a field from the config triggers onDestroy", async () => {
    const calls: string[] = [];
    const Form = createFormlyFormBuilder().build();
    const rendered = renderForm(Form, [
      {
        key: "a",
        type: "input",
        hooks: {
          onInit: () => void calls.push("a-init"),
          onDestroy: () => void calls.push("a-destroy"),
        },
      },
      { key: "b", type: "input" },
    ]);
    expect(calls).toEqual(["a-init"]);
    await act(async () => {
      rendered.config.value = [{ key: "b", type: "input" }];
    });
    expect(calls).toEqual(["a-init", "a-destroy"]);
  });
});

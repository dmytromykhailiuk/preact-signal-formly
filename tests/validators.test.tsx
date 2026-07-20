import type { FormControl } from "@dmytromykhailiuk/preact-signal-hook-forms";
import { act, waitFor } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { createFormlyFormBuilder } from "../src/builder";
import { createValidator } from "../src/create";
import { blur, renderForm, typeInto } from "./helpers";

function errorText(container: HTMLElement): string | null {
  return container.querySelector(".formly-error")?.textContent ?? null;
}

describe("validators", () => {
  it("props.required maps to the built-in required rule", async () => {
    const Form = createFormlyFormBuilder().build<{ name: string }>();
    let control!: FormControl<{ name: string }>;
    const { container } = renderForm(
      Form,
      [{ key: "name", type: "input", props: { label: "Name", required: true } }],
      { name: "" },
      { controlRef: (c: FormControl<{ name: string }>) => (control = c) },
    );
    await act(async () => {
      await control.trigger("name");
    });
    await waitFor(() => expect(errorText(container)).toBe("This field is required"));
    expect(control.formState.isValid.value).toBe(false);
  });

  it("registry validators run via validators.validation: [name]", async () => {
    const emailValidator = createValidator((value: string) => !value || value.includes("@"));
    const Form = createFormlyFormBuilder()
      .registerValidator("email", emailValidator, "Invalid email address")
      .build<{ email: string }>();
    let control!: FormControl<{ email: string }>;
    const { container } = renderForm(
      Form,
      [{ key: "email", type: "input", validators: { validation: ["email"] } }],
      { email: "not-an-email" },
      { controlRef: (c: FormControl<{ email: string }>) => (control = c) },
    );
    await act(async () => {
      await control.trigger("email");
    });
    await waitFor(() => expect(errorText(container)).toBe("Invalid email address"));
  });

  it("inline validators: fn form and {expression, message} form", async () => {
    const Form = createFormlyFormBuilder().build<{ a: string; b: string }>();
    let control!: FormControl<{ a: string; b: string }>;
    const { container } = renderForm(
      Form,
      [
        {
          key: "a",
          type: "input",
          validators: { noFoo: (value: string) => value !== "foo" || "foo is forbidden" },
        },
        {
          key: "b",
          type: "input",
          validators: {
            noBar: {
              expression: (value: string) => value !== "bar",
              message: "bar is forbidden",
            },
          },
        },
      ],
      { a: "foo", b: "bar" },
      { controlRef: (c: FormControl<{ a: string; b: string }>) => (control = c) },
    );
    await act(async () => {
      await control.trigger();
    });
    await waitFor(() => {
      const errors = [...container.querySelectorAll(".formly-error")].map((e) => e.textContent);
      expect(errors).toEqual(["foo is forbidden", "bar is forbidden"]);
    });
  });

  it("validators receive (value, model, field config)", async () => {
    const spy = vi.fn(() => true as const);
    const Form = createFormlyFormBuilder().build<{ x: string; y: string }>();
    let control!: FormControl<{ x: string; y: string }>;
    renderForm(
      Form,
      [{ key: "x", type: "input", props: { label: "X" }, validators: { spy } }],
      { x: "vx", y: "vy" },
      { controlRef: (c: FormControl<{ x: string; y: string }>) => (control = c) },
    );
    await act(async () => {
      await control.trigger("x");
    });
    const [value, model, field] = spy.mock.calls[0] as unknown as [string, any, any];
    expect(value).toBe("vx");
    expect(model).toEqual({ x: "vx", y: "vy" });
    expect(field.props.label).toBe("X");
  });

  it("async validators produce errors when they resolve", async () => {
    const Form = createFormlyFormBuilder()
      .registerValidator("taken", async (value: string) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return value !== "taken" || "Name is taken";
      })
      .build<{ name: string }>();
    let control!: FormControl<{ name: string }>;
    const { container } = renderForm(
      Form,
      [{ key: "name", type: "input", validators: { validation: ["taken"] } }],
      { name: "taken" },
      { controlRef: (c: FormControl<{ name: string }>) => (control = c) },
    );
    await act(async () => {
      await control.trigger("name");
    });
    await waitFor(() => expect(errorText(container)).toBe("Name is taken"));
  });

  it("validators see the current config after a config replacement (peek at validation time)", async () => {
    const spy = vi.fn((_v: string, _m: any, field: any) => field.props.limit >= 5 || "too low");
    const Form = createFormlyFormBuilder().build<{ n: string }>();
    let control!: FormControl<{ n: string }>;
    const rendered = renderForm(
      Form,
      [{ key: "n", type: "input", props: { limit: 1 }, validators: { spy } }],
      { n: "x" },
      { controlRef: (c: FormControl<{ n: string }>) => (control = c) },
    );
    await act(async () => {
      await control.trigger("n");
    });
    await waitFor(() => expect(errorText(rendered.container)).toBe("too low"));

    await act(async () => {
      rendered.config.value = [
        { key: "n", type: "input", props: { limit: 10 }, validators: { spy } },
      ];
      await control.trigger("n");
    });
    await waitFor(() => expect(errorText(rendered.container)).toBeNull());
  });

  it("validation re-runs on input after an error is shown", async () => {
    const Form = createFormlyFormBuilder().build<{ name: string }>();
    let control!: FormControl<{ name: string }>;
    const { container } = renderForm(
      Form,
      [{ key: "name", type: "input", props: { required: true } }],
      { name: "" },
      { controlRef: (c: FormControl<{ name: string }>) => (control = c) },
    );
    await act(async () => {
      await control.trigger("name");
    });
    await waitFor(() => expect(errorText(container)).toBe("This field is required"));

    const input = container.querySelector("input") as HTMLInputElement;
    await act(async () => {
      typeInto(input, "John");
      blur(input);
    });
    await waitFor(() => expect(errorText(container)).toBeNull());
  });
});

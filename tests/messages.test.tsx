import type { FormControl } from "@dmytromykhailiuk/preact-signal-hook-forms";
import { act, waitFor } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { createFormlyFormBuilder } from "../src/builder";
import { renderForm } from "./helpers";

function errorText(container: HTMLElement): string | null {
  return container.querySelector(".formly-error")?.textContent ?? null;
}

async function renderAndValidate(
  builderSetup: (b: ReturnType<typeof createFormlyFormBuilder>) => void,
  fieldConfig: Record<string, any>,
  initialValue = "",
) {
  const builder = createFormlyFormBuilder();
  builderSetup(builder);
  const Form = builder.build<{ v: string }>();
  let control!: FormControl<{ v: string }>;
  const rendered = renderForm(
    Form,
    [{ key: "v", type: "input", ...fieldConfig }],
    { v: initialValue },
    { controlRef: (c: FormControl<{ v: string }>) => (control = c) },
  );
  await act(async () => {
    await control.trigger("v");
  });
  return rendered;
}

describe("validation message precedence", () => {
  it("field validation.messages beats the registry message", async () => {
    const { container } = await renderAndValidate(
      (b) => b.registerValidationMessage("required", "registry says required"),
      {
        props: { required: true },
        validation: { messages: { required: "field says required" } },
      },
    );
    await waitFor(() => expect(errorText(container)).toBe("field says required"));
  });

  it("registry message beats the validator default message", async () => {
    const { container } = await renderAndValidate(
      (b) => {
        b.registerValidator("always", () => false, "validator default");
        b.registerValidationMessage("always", "registry message");
      },
      { validators: { validation: ["always"] } },
    );
    await waitFor(() => expect(errorText(container)).toBe("registry message"));
  });

  it("validator default message is used when nothing else matches", async () => {
    const { container } = await renderAndValidate(
      (b) => b.registerValidator("always", () => false, "validator default"),
      { validators: { validation: ["always"] } },
    );
    await waitFor(() => expect(errorText(container)).toBe("validator default"));
  });

  it("string returned by the validator is used when no message is registered", async () => {
    const { container } = await renderAndValidate(
      (b) => b.registerValidator("always", () => "inline string message"),
      { validators: { validation: ["always"] } },
    );
    await waitFor(() => expect(errorText(container)).toBe("inline string message"));
  });

  it("falls back to the error type as a last resort", async () => {
    const { container } = await renderAndValidate(
      (b) => b.registerValidator("mysteryError", () => false),
      { validators: { validation: ["mysteryError"] } },
    );
    await waitFor(() => expect(errorText(container)).toBe("mysteryError"));
  });

  it("function messages receive (error, field config)", async () => {
    const { container } = await renderAndValidate(
      (b) => {
        b.registerValidator("always", () => false);
        b.registerValidationMessage(
          "always",
          (error, field) => `type=${error.type} label=${field.props?.label}`,
        );
      },
      { props: { label: "The Field" }, validators: { validation: ["always"] } },
    );
    await waitFor(() => expect(errorText(container)).toBe("type=always label=The Field"));
  });

  it("built-in rule messages interpolate config values", async () => {
    // minLength only fires on non-empty strings
    const { container } = await renderAndValidate(() => {}, { props: { minLength: 4 } }, "ab");
    await waitFor(() => expect(errorText(container)).toBe("Must be at least 4 characters"));
  });
});

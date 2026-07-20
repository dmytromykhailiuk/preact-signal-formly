/**
 * When validation runs: `formOptions.mode`/`reValidateMode` for the whole
 * form, `validation.mode`/`validation.reValidateMode` per field. Formly owns
 * the decision (the underlying control is built never to auto-validate), so a
 * field can be both stricter *and* looser than its form.
 */

import { Controller } from "@dmytromykhailiuk/preact-signal-hook-forms";
import type { FormControl } from "@dmytromykhailiuk/preact-signal-hook-forms";
import { act, waitFor } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { createFormlyFormBuilder } from "../src/builder";
import { createFieldType } from "../src/create";
import type { FormlyFieldConfig } from "../src/types";
import { blur, renderForm, typeInto } from "./helpers";

function errorText(container: HTMLElement): string | null {
  return container.querySelector(".formly-error")?.textContent ?? null;
}

/** A single required field, rendered with whatever timing the test needs. */
function setup(config: Partial<FormlyFieldConfig>, extraProps: Record<string, any> = {}) {
  const Form = createFormlyFormBuilder().build<{ name: string }>();
  const rendered = renderForm(
    Form,
    [{ key: "name", type: "input", props: { required: true }, ...config }],
    { name: "" },
    extraProps,
  );
  return { ...rendered, input: rendered.container.querySelector("input") as HTMLInputElement };
}

describe("form-level validation timing", () => {
  it('defaults to "all": validates on change and on blur, with no formOptions', async () => {
    const { container, input } = setup({});
    expect(errorText(container)).toBe(null);

    await act(async () => {
      typeInto(input, "");
    });
    await waitFor(() => expect(errorText(container)).toMatch(/required/i));

    await act(async () => {
      typeInto(input, "ok");
    });
    await waitFor(() => expect(errorText(container)).toBe(null));

    await act(async () => {
      typeInto(input, "");
      blur(input);
    });
    await waitFor(() => expect(errorText(container)).toMatch(/required/i));
  });

  it('mode "onSubmit" opts back out: nothing validates until submit', async () => {
    const { container, input } = setup({}, { formOptions: { mode: "onSubmit" } });

    await act(async () => {
      typeInto(input, "a");
      typeInto(input, "");
      blur(input);
    });
    expect(errorText(container)).toBe(null);
  });

  it('mode "onChange" validates while typing', async () => {
    const { container, input } = setup({}, { formOptions: { mode: "onChange" } });

    await act(async () => {
      typeInto(input, "");
    });
    await waitFor(() => expect(errorText(container)).toMatch(/required/i));

    await act(async () => {
      typeInto(input, "ok");
    });
    await waitFor(() => expect(errorText(container)).toBe(null));
  });

  it('mode "onBlur" validates on blur but not while typing', async () => {
    const { container, input } = setup({}, { formOptions: { mode: "onBlur" } });

    await act(async () => {
      typeInto(input, "");
    });
    expect(errorText(container)).toBe(null);

    await act(async () => {
      blur(input);
    });
    await waitFor(() => expect(errorText(container)).toMatch(/required/i));
  });

  it('mode "onTouched" stays quiet until the first blur, then follows every change', async () => {
    const { container, input } = setup({}, { formOptions: { mode: "onTouched" } });

    await act(async () => {
      typeInto(input, "");
    });
    expect(errorText(container)).toBe(null);

    await act(async () => {
      blur(input);
    });
    await waitFor(() => expect(errorText(container)).toMatch(/required/i));

    await act(async () => {
      typeInto(input, "ok");
    });
    await waitFor(() => expect(errorText(container)).toBe(null));

    await act(async () => {
      typeInto(input, "");
    });
    await waitFor(() => expect(errorText(container)).toMatch(/required/i));
  });

  it('reValidateMode "onBlur" keeps a shown error until the next blur', async () => {
    const { container, input } = setup(
      {},
      { formOptions: { mode: "onChange", reValidateMode: "onBlur" } },
    );

    await act(async () => {
      typeInto(input, "");
    });
    await waitFor(() => expect(errorText(container)).toMatch(/required/i));

    // The error is on screen, so reValidateMode rules from here on.
    await act(async () => {
      typeInto(input, "ok");
    });
    expect(errorText(container)).toMatch(/required/i);

    await act(async () => {
      blur(input);
    });
    await waitFor(() => expect(errorText(container)).toBe(null));
  });
});

describe("field-level validation timing", () => {
  it("a field can be stricter than its form", async () => {
    const Form = createFormlyFormBuilder().build<{ quiet: string; eager: string }>();
    const rendered = renderForm(
      Form,
      [
        { key: "quiet", type: "input", props: { required: true } },
        {
          key: "eager",
          type: "input",
          props: { required: true },
          validation: { mode: "onChange" },
        },
      ],
      { quiet: "", eager: "" },
      { formOptions: { mode: "onSubmit" } },
    );
    const [quiet, eager] = [...rendered.container.querySelectorAll("input")] as HTMLInputElement[];

    await act(async () => {
      typeInto(quiet as HTMLInputElement, "");
      typeInto(eager as HTMLInputElement, "");
    });
    await waitFor(() =>
      expect(rendered.container.querySelectorAll(".formly-error")).toHaveLength(1),
    );
    expect(rendered.container.querySelector(".formly-error")?.textContent).toMatch(/required/i);
    // The one that reported is the eager field's, not the quiet one's.
    expect(
      rendered.container.querySelectorAll(".formly-field")[1]?.querySelector(".formly-error"),
    ).not.toBeNull();
  });

  it("a field can be looser than its form", async () => {
    const { container, input } = setup(
      { validation: { mode: "onSubmit" } },
      { formOptions: { mode: "onChange" } },
    );

    await act(async () => {
      typeInto(input, "");
      blur(input);
    });
    expect(errorText(container)).toBe(null);
  });

  it("a field can override reValidateMode alone", async () => {
    const { container, input } = setup(
      { validation: { reValidateMode: "onBlur" } },
      { formOptions: { mode: "onChange" } },
    );

    await act(async () => {
      typeInto(input, "");
    });
    await waitFor(() => expect(errorText(container)).toMatch(/required/i));

    await act(async () => {
      typeInto(input, "ok");
    });
    expect(errorText(container)).toMatch(/required/i);

    await act(async () => {
      blur(input);
    });
    await waitFor(() => expect(errorText(container)).toBe(null));
  });

  it("a config replacement changes the mode of a mounted field", async () => {
    const { container, input, config } = setup({}, { formOptions: { mode: "onSubmit" } });

    await act(async () => {
      typeInto(input, "");
    });
    expect(errorText(container)).toBe(null);

    await act(async () => {
      config.value = [
        {
          key: "name",
          type: "input",
          props: { required: true },
          validation: { mode: "onChange" },
        },
      ];
    });
    await act(async () => {
      typeInto(input, "");
    });
    await waitFor(() => expect(errorText(container)).toMatch(/required/i));
  });
});

describe("validation timing on the controlled path", () => {
  it("<Controller> honours the field's mode", async () => {
    const picker = createFieldType(({ control, namePath }) => (
      <Controller
        control={control}
        name={namePath}
        render={({ field }) => (
          <input
            data-testid="in"
            value={field.value}
            onInput={(event) => field.onChange((event.currentTarget as HTMLInputElement).value)}
            onBlur={field.onBlur}
          />
        )}
      />
    ));
    const Form = createFormlyFormBuilder()
      .registerType("picker", picker, { wrappers: ["field"] })
      .build<{ name: string }>();
    const rendered = renderForm(
      Form,
      [
        {
          key: "name",
          type: "picker",
          props: { required: true },
          validation: { mode: "onChange" },
        },
      ],
      { name: "seed" },
    );
    const input = rendered.getByTestId("in") as HTMLInputElement;
    expect(errorText(rendered.container)).toBe(null);

    await act(async () => {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await waitFor(() => expect(errorText(rendered.container)).toMatch(/required/i));
  });

  it("<Controller> honours an onBlur field mode", async () => {
    const picker = createFieldType(({ control, namePath }) => (
      <Controller
        control={control}
        name={namePath}
        render={({ field }) => (
          <input
            data-testid="in"
            value={field.value}
            onInput={(event) => field.onChange((event.currentTarget as HTMLInputElement).value)}
            onBlur={field.onBlur}
          />
        )}
      />
    ));
    const Form = createFormlyFormBuilder()
      .registerType("picker", picker, { wrappers: ["field"] })
      .build<{ name: string }>();
    const rendered = renderForm(
      Form,
      [
        {
          key: "name",
          type: "picker",
          props: { required: true },
          validation: { mode: "onBlur" },
        },
      ],
      { name: "" },
    );
    const input = rendered.getByTestId("in") as HTMLInputElement;

    await act(async () => {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(errorText(rendered.container)).toBe(null);

    await act(async () => {
      input.dispatchEvent(new Event("blur", { bubbles: true }));
    });
    await waitFor(() => expect(errorText(rendered.container)).toMatch(/required/i));
  });
});

describe("submit still validates regardless of timing", () => {
  it("handleSubmit validates every field and reValidateMode takes over after", async () => {
    const Form = createFormlyFormBuilder().build<{ name: string }>();
    let control!: FormControl<{ name: string }>;
    const rendered = renderForm(
      Form,
      [{ key: "name", type: "input", props: { required: true } }],
      { name: "" },
      {
        onSubmit: () => undefined,
        controlRef: (c: FormControl<{ name: string }>) => (control = c),
      },
    );
    const input = rendered.container.querySelector("input") as HTMLInputElement;
    expect(errorText(rendered.container)).toBe(null);

    await act(async () => {
      await control.handleSubmit(() => undefined)();
    });
    await waitFor(() => expect(errorText(rendered.container)).toMatch(/required/i));

    // Default reValidateMode is "onChange": now typing clears it.
    await act(async () => {
      typeInto(input, "ok");
    });
    await waitFor(() => expect(errorText(rendered.container)).toBe(null));
  });
});

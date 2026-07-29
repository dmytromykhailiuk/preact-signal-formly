import { useController } from "@dmytromykhailiuk/preact-signal-hook-forms";
import { computed, signal, useComputed } from "@preact/signals";
import { For } from "@preact/signals/utils";
import { render } from "preact";
import {
  createArrayType,
  createFieldType,
  createFormlyFormBuilder,
  createValidator,
  createWrapper,
  defineFields,
} from "../index";
import type { FormlyExpressionCtx, FormlySharedState } from "../index";

/* ------------------------------------------------------------------ *
 * Custom registrations
 * ------------------------------------------------------------------ */

interface RatingProps {
  max?: number;
  [key: string]: any;
}

// A non-DOM widget: no element to `register`, so it binds through the
// controlled path — `field.value` is a signal, `field.onChange` writes it.
const RatingType = createFieldType<RatingProps>(
  ({ control, namePath, props }) => {
    console.log("RatingType render");
    const { field } = useController<Record<string, any>>({
      control,
      name: namePath,
    });
    const max = useComputed(() => props.value.max ?? 5);
    const stars = useComputed(() =>
      Array.from({ length: max.value }, (_, i) => ({
        index: i + 1,
        active: (field.value.value ?? 0) >= i + 1,
      }))
    );
    return (
      <div class="rating">
        <For
          each={stars}
          getKey={(star: { index: number; active: boolean }) =>
            String(star.index)
          }
        >
          {(star: { index: number; active: boolean }) => (
            <span
              class={star.active ? "star active" : "star"}
              onClick={() => field.onChange(star.index)}
            >
              ★
            </span>
          )}
        </For>
      </div>
    );
  },
  "Rating"
);

const HighlightWrapper = createWrapper(
  ({ props, errorMessage, children, id }) => {
    const label = useComputed(() => props.value.label);
    console.log("HighlightWrapper render");
    return (
      <div
        class="playground-wrapper"
        style="border-left: 3px solid #2563eb; padding-left: 0.6rem;"
      >
        <label for={id}>{label}</label>
        {children}
        <span class="formly-error">{errorMessage}</span>
      </div>
    );
  }
);

const emailValidator = createValidator<string>((value) =>
  !value || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? true : false
);

const PhonesArray = createArrayType<{ number: string }>(
  ({ array, renderItems, props }) => {
    console.log("PhonesArray render");
    const label = useComputed(() => props.value.label ?? "Items");
    return (
      <div>
        <label>{label}</label>
        {renderItems()}
        <div class="actions">
          <button type="button" onClick={() => array.append({ number: "" })}>
            + phone
          </button>
          <button
            type="button"
            onClick={() => array.remove(array.fields.peek().length - 1)}
          >
            − last
          </button>
        </div>
      </div>
    );
  }
);

/* ------------------------------------------------------------------ *
 * Builder
 * ------------------------------------------------------------------ */

/**
 * Slow the imports down so the empty slot is actually visible — a real loader
 * is just `() => import("./lazy-color")`.
 */
function slow<T>(load: () => Promise<T>): () => Promise<T> {
  return () => new Promise<void>((resolve) => setTimeout(resolve, 1200)).then(load);
}

const builder = createFormlyFormBuilder()
  .registerType("rating", RatingType)
  .registerWrapper("highlight", HighlightWrapper)
  .registerValidator("email", emailValidator, "Please enter a valid email")
  .registerArrayType("phones", PhonesArray)
  // Code-split: the chunk is fetched when a field using the name first renders.
  // The eager `"field"` wrapper draws the label right away, around the still
  // empty slot; the lazy wrapper below owns its children, so the field inside
  // it appears only once the wrapper itself lands.
  .registerLazyType("color", slow(() => import("./lazy-color")), {
    wrappers: ["field"],
  })
  .registerLazyWrapper("card", slow(() => import("./lazy-card")));

interface Model {
  accountType: string;
  email: string;
  company: string;
  score: number;
  favoriteColor: string;
  address: { country: string; city: string };
  phones: Array<{ number: string }>;
  bio: string;
}

const FormlyForm = builder.build<Model>();

/* ------------------------------------------------------------------ *
 * The three writable signals
 * ------------------------------------------------------------------ */

const model = signal<Model>({
  accountType: "personal",
  email: "",
  company: "",
  score: 3,
  favoriteColor: "",
  address: { country: "", city: "" },
  phones: [{ number: "" }],
  bio: "",
});

const formState = signal<FormlySharedState>({ submittedAt: null });

const config = signal(
  defineFields([
    {
      key: "accountType",
      type: "radio",
      props: {
        label: "Account type",
        options: [
          { value: "personal", label: "Personal" },
          { value: "business", label: "Business" },
        ],
      },
    },
    {
      key: "email",
      type: "input",
      props: { label: "Email", placeholder: "you@example.com", required: true },
      validators: { validation: ["email"] },
    },
    {
      key: "company",
      type: "input",
      props: { label: "Company", description: "Business accounts only" },
      hide: ({ model: m }: FormlyExpressionCtx) =>
        m.value.accountType !== "business",
    },
    {
      key: "score",
      type: "rating",
      props: { label: "Rate us", max: 5 },
      wrappers: ["highlight"],
    },
    {
      key: "favoriteColor",
      type: "color",
      // Lazy type, eager wrapper: the label is on screen immediately, the
      // swatches arrive with the chunk.
      props: { label: "Favourite colour (lazy type)" },
    },
    {
      key: "address",
      fieldGroupClassName: "row",
      fieldGroup: [
        {
          key: "country",
          type: "select",
          props: {
            label: "Country",
            options: [
              { value: "", label: "— pick —" },
              { value: "ua", label: "Ukraine" },
              { value: "pl", label: "Poland" },
            ],
          },
        },
        {
          key: "city",
          type: "input",
          props: { label: "City" },
          // String expressions — the form a JSON config from a backend would
          // take. `hide` reads a bare string; the rest need the `$expr` wrapper
          // so that a plain string stays a plain string.
          expressions: {
            hide: { $expr: "!model.value.address.country" },
            "props.placeholder": {
              $expr:
                "model.value.address.country ? 'Enter your city' : 'Pick a country first'",
            },
          },
        },
      ],
    },
    {
      fieldGroup: [
        {
          key: "phones",
          type: "phones",
          props: { label: "Phones" },
          fieldArray: {
            className: "phones-item",
            fieldGroup: [
              {
                key: "number",
                type: "input",
                props: { label: "Number", minLength: 5 },
              },
            ],
          },
        },
        {
          key: "bio",
          type: "textarea",
          // Lazy wrapper: it owns its children, so the textarea appears with it.
          wrappers: ["card"],
          props: { label: "Bio (lazy wrapper)", placeholder: "A few words…" },
        },
      ],
    },
  ])
);

/* ------------------------------------------------------------------ *
 * App
 * ------------------------------------------------------------------ */

const modelJson = computed(() => JSON.stringify(model.value, null, 2));
const stateJson = computed(() => JSON.stringify(formState.value, null, 2));

function App() {
  console.log("Render");
  return (
    <div class="layout">
      <h1>preact-signal-formly playground</h1>
      <FormlyForm
        model={model}
        config={config}
        formState={formState}
        onSubmit={(values) => {
          formState.value = {
            ...formState.peek(),
            submittedAt: new Date().toISOString(),
          };
          console.log("submit", values);
        }}
      >
        <button type="submit" class="primary">
          Submit
        </button>
      </FormlyForm>

      <div class="inspector">
        <h3>model (two-way)</h3>
        <pre>{modelJson}</pre>
        <h3>formState (shared, two-way)</h3>
        <pre>{stateJson}</pre>
        <div class="actions">
          <button
            type="button"
            onClick={() => {
              model.value = {
                ...model.peek(),
                email: "external@write.dev",
                address: { country: "ua", city: "Kyiv" },
              };
            }}
          >
            Write model externally
          </button>
          <button
            type="button"
            onClick={() => {
              formState.value = { ...formState.peek(), pinged: Date.now() };
            }}
          >
            Write formState externally
          </button>
        </div>
      </div>
    </div>
  );
}

render(<App />, document.getElementById("app")!);

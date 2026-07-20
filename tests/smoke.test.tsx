import { useForm } from "@dmytromykhailiuk/preact-signal-hook-forms";
import { useSignal } from "@preact/signals";
import { For, Show } from "@preact/signals/utils";
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

// Smoke test: the file:-linked base library must share OUR preact/@preact/signals
// instances (resolve.dedupe/alias in vitest.config.ts), otherwise hooks and
// signal-to-DOM bindings silently break.
describe("environment smoke", () => {
  it("renders a form from the linked base library with reactive signal binding", async () => {
    function App() {
      const form = useForm<{ email: string }>({ defaultValues: { email: "a@b.c" } });
      return <input data-testid="email" {...form.register("email")} />;
    }
    const { getByTestId } = render(<App />);
    expect((getByTestId("email") as HTMLInputElement).value).toBe("a@b.c");
  });

  it("For and Show from @preact/signals/utils work with our signals instance", () => {
    function App() {
      const items = useSignal(["x", "y"]);
      const visible = useSignal(true);
      return (
        <Show when={visible}>
          <ul>
            <For each={items} getKey={(item) => item}>
              {(item) => <li>{item}</li>}
            </For>
          </ul>
        </Show>
      );
    }
    const { container } = render(<App />);
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });
});

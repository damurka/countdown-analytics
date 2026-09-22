// shiny.react provides React and its own runtime in the browser as window.jsmodule; webpack maps these
// imports to it (see webpack.config.js externals). It ships no types, so the part we use is declared here.

declare module "@/shiny.react" {
  import type { ComponentType } from "react";

  /** Props every input made with InputAdapter() accepts. `inputId` is the Shiny input id. */
  type AdapterProps<P, V> = Omit<P, "value" | "onChange"> & { inputId: string; value?: V };

  /**
   * Turns a component into a Shiny input. `valueProps` maps the input's current value and its setter onto the
   * component's own props. updateReactInput() from R can then change the value or any other prop.
   */
  export function InputAdapter<P, V = string>(
    Component: ComponentType<P>,
    valueProps: (value: V, setValue: (value: V) => void, props: P) => Partial<P>,
    rateLimit?: unknown
  ): ComponentType<AdapterProps<P, V>>;
}

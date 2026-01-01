
import { parseZen } from "./parse"
import { splitZen } from "./split"
import { emit } from "./emit"
import { generateEventBindingRuntime } from "./event"
import { generateBindingRuntime } from "./binding"

export function compile(entry: string, outDir = "dist") {
  const zen = parseZen(entry);
  const { html, styles, scripts, eventTypes, stateBindings, stateDeclarations } = splitZen(zen);

  // Generate runtime code for event types
  const eventRuntime = generateEventBindingRuntime(eventTypes);
  
  // Generate runtime code for state bindings
  const bindingRuntime = generateBindingRuntime(stateBindings, stateDeclarations);

  const scriptsWithRuntime = scripts.map(s => {
    // Order: Binding runtime first (creates state variables and sets up bindings),
    // then user script content (can use state variables),
    // then event runtime (sets up event delegation)
    let result = "";
    if (bindingRuntime) {
      result += bindingRuntime + "\n\n";
    }
    result += s;
    if (eventRuntime) {
      result += `\n\n${eventRuntime}`;
    }
    return result;
  })
  
  emit(outDir, html, scriptsWithRuntime, styles, entry);
}

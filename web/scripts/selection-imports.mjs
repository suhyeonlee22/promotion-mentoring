import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    let url;
    if (specifier.startsWith("@/")) {
      url = new URL("../src/" + specifier.slice(2), import.meta.url);
    } else if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts")) {
      url = new URL(specifier, context.parentURL);
    }
    if (url) {
      for (const suffix of ["", ".ts", "/index.ts"]) {
        const candidate = new URL(url.href + suffix);
        if (candidate.pathname.endsWith(".ts") && existsSync(fileURLToPath(candidate))) {
          return nextResolve(candidate.href, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

"use client";

/** Native guest assets use the app scheme and never register a web worker. */
export function ServiceWorkerRegistrar() {
  return null;
}

// Ambient declaration for @mediapipe/tasks-vision.
//
// The Rep Counter page (app/rep-counter/page.tsx) loads this module at runtime
// from the jsDelivr CDN (see the pinned URL in that file) rather than bundling
// it, so it is intentionally NOT a package.json dependency. Without this stub,
// `next build` fails type-checking on the dynamic `import("@mediapipe/tasks-vision")`
// with TS2307 ("Cannot find module"). Declaring it keeps the build green while
// the actual implementation is resolved from the CDN in the browser.

declare module "@mediapipe/tasks-vision";

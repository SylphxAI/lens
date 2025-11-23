/**
 * Test setup for React hooks testing
 * Sets up happy-dom for DOM simulation
 */

import { Window } from "happy-dom";

const window = new Window();

// @ts-expect-error - global assignment
globalThis.window = window;
// @ts-expect-error - global assignment
globalThis.document = window.document;
// @ts-expect-error - global assignment
globalThis.navigator = window.navigator;
// @ts-expect-error - global assignment
globalThis.HTMLElement = window.HTMLElement;
// @ts-expect-error - global assignment
globalThis.DocumentFragment = window.DocumentFragment;
// @ts-expect-error - global assignment
globalThis.Element = window.Element;
// @ts-expect-error - global assignment
globalThis.Event = window.Event;
// @ts-expect-error - global assignment
globalThis.CustomEvent = window.CustomEvent;

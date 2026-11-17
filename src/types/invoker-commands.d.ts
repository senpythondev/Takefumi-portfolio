/**
 * Invoker Commands (HTML `command` / `commandfor`), Baseline across current browsers.
 * React passes lowercase unknown attributes through to the DOM; @types/react does not declare them yet.
 */
import 'react';

declare module 'react' {
  interface ButtonHTMLAttributes<T> extends HTMLAttributes<T> {
    commandfor?: string;
    command?: 'show-modal' | 'close' | 'request-close' | 'show-popover' | 'hide-popover' | 'toggle-popover' | `--${string}`;
  }
}

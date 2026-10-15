import type { Directive, ObjectDirective, DirectiveBinding, VNode } from "vue";

export type DialogEntry = {
  element: HTMLElement;
  close: () => void;
  previous: HTMLElement | null;
};

const stack: DialogEntry[] = [];
const inertElements = new Map<HTMLElement, boolean>();
const selector =
  'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

export function hasActiveDialog(): boolean {
  return stack.length > 0;
}

export function getActiveDialogCount(): number {
  return stack.length;
}

export function getTopDialog(): DialogEntry | undefined {
  return stack[stack.length - 1];
}

export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    typeof HTMLElement !== "undefined" && target instanceof HTMLElement &&
    !!target.closest('input, textarea, select, [contenteditable="true"]')
  );
}

export function focusables(element: HTMLElement): HTMLElement[] {
  return [...element.querySelectorAll<HTMLElement>(selector)].filter(
    (item) => item.getClientRects().length > 0 && !item.closest("[inert]"),
  );
}

function reconcile() {
  for (const [element, previous] of inertElements) {
    element.inert = previous;
  }
  inertElements.clear();

  const top = stack[stack.length - 1];
  if (!top) return;

  let branch: HTMLElement = top.element;
  while (branch.parentElement) {
    for (const sibling of branch.parentElement.children) {
      if (sibling !== branch && sibling instanceof HTMLElement) {
        inertElements.set(sibling, sibling.inert);
        sibling.inert = true;
      }
    }
    branch = branch.parentElement;
  }
}

function handleKey(event: KeyboardEvent) {
  const top = stack[stack.length - 1];
  if (!top) return;

  if (event.key === "Escape") {
    event.preventDefault();
    event.stopImmediatePropagation();
    top.close();
    return;
  }

  if (event.key !== "Tab") return;

  const items = focusables(top.element);
  const first = items[0] ?? top.element;
  const last = items[items.length - 1] ?? top.element;

  if (
    !top.element.contains(document.activeElement) ||
    (!event.shiftKey && document.activeElement === last) ||
    (event.shiftKey && document.activeElement === first)
  ) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}

export function resetDialogStack(): void {
  for (const [element, previous] of inertElements) {
    element.inert = previous;
  }
  inertElements.clear();
  stack.length = 0;
  if (typeof window !== "undefined") {
    window.removeEventListener("keydown", handleKey, true);
  }
}

export const dialog: Directive<HTMLElement, () => void> = {
  mounted(element, binding) {
    const previous =
      typeof document !== "undefined" && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    stack.push({ element, close: binding.value, previous });

    const panel = element.matches('[role="dialog"], [role="alertdialog"]')
      ? element
      : element.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]') ?? element;
    panel.setAttribute("role", panel.getAttribute("role") ?? "dialog");
    panel.setAttribute("aria-modal", "true");

    const title = panel.querySelector<HTMLElement>("h1,h2,h3,h4");
    if (title && !panel.hasAttribute("aria-label") && !panel.hasAttribute("aria-labelledby")) {
      title.id ||= `omera-dialog-${crypto.randomUUID()}`;
      panel.setAttribute("aria-labelledby", title.id);
    }

    element.tabIndex = -1;

    if (stack.length === 1 && typeof window !== "undefined") {
      window.addEventListener("keydown", handleKey, true);
    }
    reconcile();

    if (typeof queueMicrotask === "function") {
      queueMicrotask(() => {
        if (stack[stack.length - 1]?.element === element) {
          (focusables(element)[0] ?? element).focus();
        }
      });
    }
  },

  updated(element, binding) {
    const entry = stack.find((item) => item.element === element);
    if (entry) {
      entry.close = binding.value;
    }
  },

  unmounted(element) {
    const index = stack.findIndex((item) => item.element === element);
    if (index < 0) return;

    const wasTop = index === stack.length - 1;
    const [entry] = stack.splice(index, 1);
    reconcile();

    if (!stack.length && typeof window !== "undefined") {
      window.removeEventListener("keydown", handleKey, true);
    }

    if (wasTop) {
      const target = entry.previous?.isConnected
        ? entry.previous
        : stack[stack.length - 1]?.element;
      target?.focus();
    }
  },
};

/** Enable modal focus/inertness only while a workbench surface is in full screen. */
export const conditionalDialog: ObjectDirective<HTMLElement, (() => void) | false> = {
  mounted: reconcileConditionalDialog,
  updated: reconcileConditionalDialog,
  unmounted(element, binding, vnode, previous) {
    if (stack.some(entry => entry.element === element)) {
      (dialog as ObjectDirective<HTMLElement, () => void>).unmounted?.(element,
        binding as DirectiveBinding<() => void>, vnode, previous);
    }
  },
};

function reconcileConditionalDialog(
  element: HTMLElement, binding: DirectiveBinding<(() => void) | false>,
  vnode: VNode<HTMLElement, HTMLElement>, previous: VNode<HTMLElement, HTMLElement> | null,
) {
  const registered = stack.some(entry => entry.element === element);
  const controlled = dialog as ObjectDirective<HTMLElement, () => void>;
  const closeBinding = binding as DirectiveBinding<() => void>;
  if (!binding.value) {
    if (registered) controlled.unmounted?.(element, closeBinding, vnode, null);
  } else if (registered) controlled.updated?.(element, closeBinding, vnode, previous ?? vnode);
  else controlled.mounted?.(element, closeBinding, vnode, null);
}

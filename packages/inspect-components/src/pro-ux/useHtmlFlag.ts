import { useSyncExternalStore } from "react";

const subscribe = (onChange: () => void): (() => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true });
  return () => observer.disconnect();
};

/** Whether the pro-UX skin is on and `<html>` carries `name`. The app's
 *  preference store mirrors each preference onto <html>, which keeps this
 *  package free of any dependency on the app. */
export const useHtmlFlag = (name: string): boolean =>
  useSyncExternalStore(
    subscribe,
    () =>
      document.documentElement.hasAttribute("data-pro-ux") &&
      document.documentElement.hasAttribute(name),
    () => false
  );

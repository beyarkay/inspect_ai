import { isValidElement, ReactNode } from "react";

/** False for an absent child, or a tab the pro-UX skin folds away with
 *  `data-hidden`. */
export const isShownTab = (child: ReactNode): boolean =>
  !!child &&
  !(
    isValidElement<{ "data-hidden"?: boolean }>(child) &&
    child.props["data-hidden"]
  );

/** Before collapsing a card whose header is stuck to the top of the scroller,
 *  scroll the card up so the header's resting place is where it is drawn now.
 *  The header then stays under the pointer instead of vanishing with the
 *  content above it. */
export const unstickBeforeCollapse = (
  header: HTMLElement | null,
  scroller: HTMLElement | null | undefined
): void => {
  const card = header?.parentElement;
  if (!header || !card || !scroller) return;
  const cardStyle = window.getComputedStyle(card);
  const rest =
    parseFloat(cardStyle.borderTopWidth) +
    parseFloat(cardStyle.paddingTop) +
    parseFloat(window.getComputedStyle(header).marginTop);
  const lift =
    card.getBoundingClientRect().top +
    (Number.isFinite(rest) ? rest : 0) -
    header.getBoundingClientRect().top;
  if (lift < -1) scroller.scrollBy({ top: lift, behavior: "instant" });
};

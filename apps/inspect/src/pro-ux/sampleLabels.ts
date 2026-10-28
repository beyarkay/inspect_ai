/** The longest prefix every id shares, cut back to just after a separator so
 *  it never splits a word. Empty when fewer than two ids or nothing shared. */
export const commonIdPrefix = (ids: string[]): string => {
  if (ids.length < 2) return "";
  let prefix = ids[0] ?? "";
  for (const id of ids) {
    let i = 0;
    while (i < prefix.length && i < id.length && prefix[i] === id[i]) i++;
    prefix = prefix.slice(0, i);
    if (!prefix) return "";
  }
  const cut = Math.max(
    ...["-", "_", ".", "/", ":", " "].map((s) => prefix.lastIndexOf(s))
  );
  const trimmed = cut >= 0 ? prefix.slice(0, cut + 1) : "";
  return ids.every((id) => id.length > trimmed.length) ? trimmed : "";
};

export const allSame = (values: string[]): boolean =>
  values.length > 1 && values.every((v) => v === values[0]);

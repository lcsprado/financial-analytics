export const CLIENT_SELECTION_SEPARATOR = "\u001f";

export function splitClientSelection(value: string) {
  if (!value) return [];
  return value
    .split(CLIENT_SELECTION_SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinClientSelection(values: string[]) {
  const unique = new Set<string>();
  values.forEach((value) => {
    const cleaned = value.trim();
    if (cleaned) unique.add(cleaned);
  });
  return [...unique].join(CLIENT_SELECTION_SEPARATOR);
}

export function hasMultipleClientSelection(value: string) {
  return splitClientSelection(value).length > 1;
}

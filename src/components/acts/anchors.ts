/** The anchor of a layer's act on the home page (`#layer-<id>`); the evidence and case-study pages link back to it. */
export function layerAnchor(id: string): string {
  return `layer-${id}`;
}

/** The case-study page of a layer (STORYBOARD v2.1 §6-1). */
export function workPath(locale: string, id: string): string {
  return `/${locale}/work/${id}`;
}

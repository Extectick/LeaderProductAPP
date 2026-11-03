/** Shared material, with mirrored falloff at the content-facing edge.
 * The edge renderer clamps the feather to the actual header/dock height. */
export const APP_EDGE_BLUR = { intensity: 30, webRadius: 10, topFeather: 104, bottomFeather: 104 } as const;

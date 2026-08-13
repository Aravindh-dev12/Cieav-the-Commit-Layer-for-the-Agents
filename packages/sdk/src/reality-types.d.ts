import "@cieav/contracts/reality";

declare module "@cieav/contracts/reality" {
  export type OpenLoopCreateRequest = ReturnType<typeof OpenLoopCreateRequestSchema.parse>;
  export type OpenLoopUpdateRequest = ReturnType<typeof OpenLoopUpdateRequestSchema.parse>;
  export type RealityEvaluateRequest = ReturnType<typeof RealityEvaluateRequestSchema.parse>;
}

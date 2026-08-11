import { describe, expect, it } from "vitest";
import { heuristicManifest, mergeWithModel } from "./policy.js";
import type { ActionContext, ActionManifest } from "@latch/contracts";

function ctx(text: string): ActionContext {
  return {
    requestId: "request-12345678",
    url: "https://example.com/account",
    origin: "https://example.com",
    title: "Example",
    element: {tag: "button", text},
    form: {fields: [], fileNames: []},
    timestamp: new Date().toISOString(),
    clientVersion: "test"
  };
}

describe("policy", () => {
  it("flags financial commitments as critical", () => {
    const m = heuristicManifest(ctx("Transfer money"));
    expect(m.risk).toBe("CRITICAL");
    expect(m.reversibility).toBe("IRREVERSIBLE");
  });

  it("never lets a model downgrade deterministic risk", () => {
    const base = heuristicManifest(ctx("Transfer money"));
    const model: ActionManifest = {...base, risk: "LOW", modelUsed: true, confidence: 0.95};
    expect(mergeWithModel(base, model).risk).toBe("CRITICAL");
  });
});

it("does not misclassify place order as a generic submit", () => {
  const m = heuristicManifest(ctx("Place order"));
  expect(m.actionType).toBe("financial.commit");
  expect(m.risk).toBe("CRITICAL");
});

it("treats publishing as compensable rather than fully reversible", () => {
  const m = heuristicManifest(ctx("Publish post"));
  expect(m.reversibility).toBe("COMPENSABLE");
});

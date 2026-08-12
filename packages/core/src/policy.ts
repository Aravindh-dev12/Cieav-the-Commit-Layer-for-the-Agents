import type { ActionContext, ActionManifest, RiskLevel, Reversibility } from "@latch/contracts";

export const POLICY_VERSION = "2026-08-12.1";

const rank: Record<RiskLevel, number> = {LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3};
const revRank: Record<Reversibility, number> = {
  REVERSIBLE: 0,
  DELAYABLE: 1,
  COMPENSABLE: 2,
  UNKNOWN: 3,
  IRREVERSIBLE: 4
};

export function stricterRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return rank[a]! >= rank[b]! ? a : b;
}

export function stricterReversibility(a: Reversibility, b: Reversibility): Reversibility {
  return revRank[a]! >= revRank[b]! ? a : b;
}

function actionText(ctx: ActionContext): string {
  return [
    ctx.element.text,
    ctx.element.ariaLabel,
    ctx.element.name,
    ctx.form?.submitterText,
    ctx.nearbyText,
    ctx.title
  ].filter(Boolean).join(" ").toLowerCase();
}

export function heuristicManifest(ctx: ActionContext): ActionManifest {
  const t = actionText(ctx);
  const cats = [...new Set((ctx.form?.fields ?? []).map(f => f.dataCategory).filter(Boolean))] as ActionManifest["dataCategories"];
  const warnings: string[] = [];
  const effects: string[] = [];
  let actionType = "web.action";
  let summary = `Perform an action on ${new URL(ctx.url).hostname}`;
  let risk: RiskLevel = "LOW";
  let reversibility: Reversibility = "UNKNOWN";

  if (ctx.element.declaredActionType) actionType = ctx.element.declaredActionType;
  if (ctx.element.declaredSummary) summary = ctx.element.declaredSummary;
  if (ctx.element.declaredReversibility) reversibility = stricterReversibility(reversibility, ctx.element.declaredReversibility);

  const hasSensitive = cats.some(c => ["CREDENTIAL", "FINANCIAL", "IDENTITY", "HEALTH", "BIOMETRIC"].includes(c));
  if (hasSensitive) {
    risk = "HIGH";
    warnings.push("This action involves sensitive data categories.");
  }

  if (/(delete|remove|erase|close account|terminate account|deactivate)/i.test(t)) {
    actionType = "resource.delete";
    summary = "Delete or remove data/account access";
    risk = stricterRisk(risk, "HIGH");
    reversibility = "UNKNOWN";
    effects.push("Data or access may be removed.");
    warnings.push("Deletion semantics vary by site; recovery may not be available.");
  } else if (/(pay|transfer|send money|withdraw|deposit|purchase|buy|subscribe|place order|checkout)/i.test(t)) {
    actionType = "financial.commit";
    summary = "Commit a financial action";
    risk = "CRITICAL";
    reversibility = "IRREVERSIBLE";
    effects.push("Funds or a financial commitment may be transferred.");
    warnings.push("Financial actions can be difficult or impossible to reverse.");
  } else if (/(publish|post|tweet|send|submit|apply|confirm)/i.test(t)) {
    actionType = /(publish|post|tweet)/i.test(t) ? "content.publish" : "data.submit";
    summary = /(publish|post|tweet)/i.test(t) ? "Publish content" : "Submit information";
    risk = stricterRisk(risk, "MEDIUM");
    reversibility = "COMPENSABLE";
    effects.push("Information will leave the current page and be sent to another system.");
    if (/(publish|post|tweet)/i.test(t)) warnings.push("Removing published content later cannot guarantee that copies were not retained elsewhere.");
  } else if (/(share|invite|grant|allow|authorize|connect|link account|sign in with)/i.test(t)) {
    actionType = "access.grant";
    summary = "Grant or share access";
    risk = stricterRisk(risk, "MEDIUM");
    reversibility = "COMPENSABLE";
    effects.push("Another person or service may gain access to data or capabilities.");
    warnings.push("Revoking access later cannot retract data already copied or exported.");
  } else if (/(upload|attach)/i.test(t) || (ctx.form?.fileNames.length ?? 0) > 0) {
    actionType = "file.upload";
    summary = "Upload files";
    risk = stricterRisk(risk, hasSensitive ? "HIGH" : "MEDIUM");
    reversibility = "COMPENSABLE";
    effects.push("Selected files may be copied to a remote service.");
  } else if (ctx.element.href) {
    actionType = "navigation.open";
    summary = "Open another page";
    risk = hasSensitive ? "HIGH" : "LOW";
    reversibility = "REVERSIBLE";
    effects.push("The browser will navigate to another page.");
  } else {
    effects.push("The page state may change or information may be submitted.");
  }

  if (cats.includes("CREDENTIAL")) {
    risk = "CRITICAL";
    warnings.push("Credentials or secrets should never be disclosed to an unexpected recipient.");
  }

  if (effects.length === 0) effects.push("The page may perform a consequential action.");

  return {
    requestId: ctx.requestId,
    actionType,
    summary,
    actor: "You",
    target: new URL(ctx.url).hostname,
    recipients: [],
    dataCategories: cats.length ? cats : ["NONE"],
    effects,
    reversibility,
    undo: {
      kind: reversibility === "REVERSIBLE" ? "MANUAL" : "NONE",
      ...(reversibility === "REVERSIBLE" ? {instructions: "Use the site's native controls to revoke or undo this action when available."} : {})
    },
    risk,
    confidence: 0.62,
    modelUsed: false,
    warnings,
    evidence: ["Deterministic browser-side semantics and action text"],
    policyVersion: POLICY_VERSION
  };
}

export function mergeWithModel(base: ActionManifest, model: ActionManifest): ActionManifest {
  return {
    ...model,
    requestId: base.requestId,
    risk: stricterRisk(base.risk, model.risk),
    reversibility: stricterReversibility(base.reversibility, model.reversibility),
    dataCategories: [...new Set([...base.dataCategories, ...model.dataCategories])],
    warnings: [...new Set([...base.warnings, ...model.warnings])],
    evidence: [...new Set([...base.evidence, ...model.evidence])],
    confidence: Math.min(0.99, Math.max(base.confidence, model.confidence)),
    modelUsed: true,
    policyVersion: POLICY_VERSION
  };
}

export function shouldUseModel(ctx: ActionContext, base: ActionManifest): boolean {
  if (base.risk === "CRITICAL" || base.risk === "HIGH") return true;
  if (base.reversibility === "UNKNOWN") return true;
  if (ctx.form && ctx.form.fields.length > 0) return true;
  return base.confidence < 0.8;
}

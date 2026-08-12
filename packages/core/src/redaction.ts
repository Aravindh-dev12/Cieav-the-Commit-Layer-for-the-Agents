import type { DataCategory } from "@latch/contracts";

const categoryPatterns: Array<[DataCategory, RegExp]> = [
  ["CREDENTIAL", /(password|passcode|pin|secret|api.?key|token|credential|otp|one.?time)/i],
  ["FINANCIAL", /(card|cvv|cvc|bank|account.?number|routing|iban|swift|upi|payment|wallet)/i],
  ["IDENTITY", /(passport|aadhaar|aadhar|ssn|social.?security|driver.?licen[cs]e|national.?id|tax.?id|pan.?number)/i],
  ["HEALTH", /(health|medical|diagnos|prescription|patient|insurance.?id)/i],
  ["BIOMETRIC", /(face|fingerprint|voiceprint|biometric|iris)/i],
  ["LOCATION", /(address|location|latitude|longitude|postal|zip|city)/i],
  ["CONTACT", /(email|phone|mobile|contact)/i],
  ["FILE", /(file|upload|attachment|document|resume|cv)/i]
];

export function classifyField(name: string, label = "", inputType = ""): DataCategory {
  const probe = `${name} ${label} ${inputType}`;
  for (const [category, pattern] of categoryPatterns) {
    if (pattern.test(probe)) return category;
  }
  return "OTHER";
}

export function redactText(input: string): string {
  return input
    .replace(/\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[EMAIL]")
    .replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, "[PHONE]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[POSSIBLE_CARD]")
    .replace(/\b\d{6}\b/g, "[POSSIBLE_OTP]")
    .replace(/(?:sk|pk|api)[-_][A-Za-z0-9_-]{16,}/g, "[POSSIBLE_SECRET]")
    .slice(0, 5000);
}

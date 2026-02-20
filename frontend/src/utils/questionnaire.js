export const QUESTIONNAIRE_DEFAULTS = {
  contextText: "",
};

export function isQuestionnaireComplete(answers) {
  return Boolean((answers?.contextText || "").trim());
}

export function buildEnhancedContext(answers) {
  const contextText = (answers?.contextText || "").trim();
  if (!contextText) {
    return {};
  }
  return { context_text: contextText };
}

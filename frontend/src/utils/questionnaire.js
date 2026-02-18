export const QUESTIONNAIRE_DEFAULTS = {
  lesionDuration: "",
  recentChanges: "",
  lesionSymptoms: "",
  irregularBorder: "",
  colorPattern: "",
};

export function isQuestionnaireComplete(answers) {
  return Object.keys(QUESTIONNAIRE_DEFAULTS).every((key) => Boolean(answers?.[key]));
}

export function evaluateCancerQuestionnaire(answers) {
  let score = 0;
  const reasons = [];

  if (answers.lesionDuration === "More than 6 months") {
    score += 3;
    reasons.push("Lesion present for more than 6 months");
  } else if (answers.lesionDuration === "1-6 months") {
    score += 2;
  } else if (answers.lesionDuration === "Not sure") {
    score += 1;
  }

  if (answers.recentChanges === "Size increased") {
    score += 3;
    reasons.push("Recent size increase");
  } else if (answers.recentChanges === "Color changed") {
    score += 3;
    reasons.push("Recent color change");
  } else if (answers.recentChanges === "Shape changed") {
    score += 3;
    reasons.push("Recent shape change");
  }

  if (answers.lesionSymptoms === "Yes") {
    score += 3;
    reasons.push("Itching, bleeding, or pain");
  }

  if (answers.irregularBorder === "Yes") {
    score += 3;
    reasons.push("Irregular or uneven border");
  } else if (answers.irregularBorder === "Not sure") {
    score += 1;
  }

  if (answers.colorPattern === "Multiple colors") {
    score += 3;
    reasons.push("Multiple shades in lesion");
  }

  if (score >= 10) {
    return {
      score,
      level: "High",
      presence: "Likely Present",
      message:
        "Questionnaire responses indicate high concern for skin cancer. Seek urgent dermatologist evaluation.",
      reasons,
    };
  }

  if (score >= 5) {
    return {
      score,
      level: "Moderate",
      presence: "Possibly Present",
      message:
        "Questionnaire responses indicate moderate concern. Clinical examination is strongly recommended.",
      reasons,
    };
  }

  return {
    score,
    level: "Low",
    presence: "Less Likely",
    message:
      "Questionnaire responses indicate lower concern. Continue monitoring and consult if changes occur.",
    reasons,
  };
}

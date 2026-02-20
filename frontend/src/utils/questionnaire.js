export const QUESTIONNAIRE_DEFAULTS = {
  ageBand: "",
  lesionDuration: "",
  recentChanges: "",
  itching: "",
  bleeding: "",
  pain: "",
  scaling: "",
  ringShape: "",
  spreading: "",
  irregularBorder: "",
  colorPattern: "",
  familyHistorySkinCancer: "",
  previousSkinCancer: "",
  primaryConcern: "",
  contextText: "",
};

const REQUIRED_FIELDS = ["ageBand", "lesionDuration", "recentChanges", "primaryConcern"];

export function isQuestionnaireComplete(answers) {
  return REQUIRED_FIELDS.every((key) => Boolean(answers?.[key]));
}

export function evaluateCancerQuestionnaire(answers) {
  let score = 0;
  const reasons = [];

  if (answers.ageBand === "65+") {
    score += 1;
    reasons.push("Age group above 65");
  }

  if (answers.lesionDuration === "More than 6 months") {
    score += 3;
    reasons.push("Lesion present for more than 6 months");
  } else if (answers.lesionDuration === "1-6 months") {
    score += 2;
  } else if (answers.lesionDuration === "Not sure") {
    score += 1;
  }

  if (answers.recentChanges === "Size increased" || answers.recentChanges === "Shape changed") {
    score += 3;
    reasons.push("Rapid growth-related change reported");
  } else if (answers.recentChanges === "Color changed") {
    score += 3;
    reasons.push("Recent color change reported");
  }

  if (answers.itching === "Yes") {
    score += 1;
  }

  if (answers.bleeding === "Yes") {
    score += 3;
    reasons.push("Bleeding reported");
  }

  if (answers.pain === "Yes") {
    score += 1;
  }

  if (answers.spreading === "Yes") {
    score += 1;
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

  if (answers.familyHistorySkinCancer === "Yes") {
    score += 2;
    reasons.push("Family history of skin cancer");
  } else if (answers.familyHistorySkinCancer === "Not sure") {
    score += 1;
  }

  if (answers.previousSkinCancer === "Yes") {
    score += 3;
    reasons.push("Previous skin cancer history");
  } else if (answers.previousSkinCancer === "Not sure") {
    score += 1;
  }

  if (answers.ringShape === "Yes") {
    score -= 1;
  }

  if (answers.scaling === "Yes") {
    score -= 1;
  }

  if (answers.primaryConcern === "Cancer-like mole") {
    score += 1;
  } else if (answers.primaryConcern === "Fungal patch") {
    score -= 1;
  }

  score = Math.max(0, score);

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

const AGE_BAND_TO_VALUE = {
  "<18": 16,
  "18-39": 29,
  "40-64": 52,
  "65+": 70,
};

const DURATION_TO_DAYS = {
  "Less than 1 month": 21,
  "1-6 months": 120,
  "More than 6 months": 240,
};

const PRIMARY_CONCERN_MAP = {
  "Cancer-like mole": "cancer",
  "Fungal patch": "fungal",
  "Bacterial lesion": "bacterial",
  "Rash/allergy": "inflammatory",
  Unsure: "unsure",
};

function mapYesNo(value) {
  if (value === "Yes") return true;
  if (value === "No") return false;
  return undefined;
}

export function buildEnhancedContext(answers) {
  const context = {};
  const age = AGE_BAND_TO_VALUE[answers.ageBand];
  if (Number.isInteger(age)) {
    context.age = age;
  }

  const durationDays = DURATION_TO_DAYS[answers.lesionDuration];
  if (Number.isInteger(durationDays)) {
    context.duration_days = durationDays;
  }

  const recentChange = answers.recentChanges;
  if (recentChange) {
    context.rapid_growth = recentChange === "Size increased" || recentChange === "Shape changed";
    if (recentChange === "Color changed") {
      context.multi_color = true;
    }
  }

  const itching = mapYesNo(answers.itching);
  if (typeof itching === "boolean") context.itching = itching;

  const bleeding = mapYesNo(answers.bleeding);
  if (typeof bleeding === "boolean") context.bleeding = bleeding;

  const pain = mapYesNo(answers.pain);
  if (typeof pain === "boolean") context.pain = pain;

  const scaling = mapYesNo(answers.scaling);
  if (typeof scaling === "boolean") context.scaling = scaling;

  const ringShape = answers.ringShape === "Yes" ? true : answers.ringShape === "No" ? false : undefined;
  if (typeof ringShape === "boolean") context.ring_shape = ringShape;

  const spreading = mapYesNo(answers.spreading);
  if (typeof spreading === "boolean") context.spreading = spreading;

  const irregularBorder =
    answers.irregularBorder === "Yes" ? true : answers.irregularBorder === "No" ? false : undefined;
  if (typeof irregularBorder === "boolean") context.irregular_border = irregularBorder;

  if (answers.colorPattern === "Multiple colors") {
    context.multi_color = true;
  } else if (answers.colorPattern === "Uniform") {
    context.multi_color = false;
  }

  const familyHistorySkinCancer = mapYesNo(answers.familyHistorySkinCancer);
  if (typeof familyHistorySkinCancer === "boolean") {
    context.family_history_skin_cancer = familyHistorySkinCancer;
  }

  const previousSkinCancer = mapYesNo(answers.previousSkinCancer);
  if (typeof previousSkinCancer === "boolean") {
    context.previous_skin_cancer = previousSkinCancer;
  }

  const primaryConcern = PRIMARY_CONCERN_MAP[answers.primaryConcern];
  if (primaryConcern) {
    context.primary_concern = primaryConcern;
  }

  const contextText = (answers.contextText || "").trim();
  if (contextText) {
    context.context_text = contextText;
  }

  return context;
}

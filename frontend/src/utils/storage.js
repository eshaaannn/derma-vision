const SCANS_KEY = "derma_scan_history";
const LAST_RESULT_KEY = "derma_last_result";
const MAX_SCAN_HISTORY = 20;
const MAX_IMAGE_DATA_URL_LENGTH = 420_000;
const MAX_HEATMAP_BASE64_LENGTH = 320_000;

function isQuotaError(error) {
  return (
    error?.name === "QuotaExceededError" ||
    error?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error?.code === 22 ||
    error?.code === 1014
  );
}

function safeParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function compactDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  if (!dataUrl.startsWith("data:image")) return null;
  if (dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) return null;
  return dataUrl;
}

function compactHeatmap(heatmap, aggressive = false) {
  if (typeof heatmap !== "string") return null;
  if (!heatmap.trim()) return null;
  if (aggressive) return null;

  const normalized = heatmap.startsWith("data:image")
    ? heatmap
    : `data:image/png;base64,${heatmap}`;

  if (normalized.length > MAX_HEATMAP_BASE64_LENGTH) {
    return null;
  }
  return normalized;
}

function compactModelExplainability(modelExplainability, aggressive = false) {
  if (!modelExplainability || typeof modelExplainability !== "object") {
    return null;
  }

  const compact = {
    source: modelExplainability.source || null,
    decision: modelExplainability.decision || null,
    risk_level: modelExplainability.risk_level || null,
    model_confidence:
      typeof modelExplainability.model_confidence === "number"
        ? modelExplainability.model_confidence
        : null,
    visual_pattern: modelExplainability.visual_pattern || null,
    heatmap: compactHeatmap(modelExplainability.heatmap, aggressive),
  };

  return compact;
}

function compactContextPayload(contextPayload) {
  if (!contextPayload || typeof contextPayload !== "object") return null;
  const contextText = String(contextPayload.context_text || "").trim();
  return contextText ? { context_text: contextText.slice(0, 1200) } : null;
}

function compactScan(scan, aggressive = false) {
  if (!scan || typeof scan !== "object") {
    return null;
  }

  const primaryImage = compactDataUrl(scan.image) || null;
  const compactImages = Array.isArray(scan.images)
    ? scan.images
        .map((entry) => compactDataUrl(entry))
        .filter(Boolean)
        .slice(0, 1)
    : [];

  const images = compactImages.length ? compactImages : primaryImage ? [primaryImage] : [];

  const compacted = {
    id: scan.id,
    createdAt: scan.createdAt,
    image: primaryImage || images[0] || null,
    images,
    analyzedImageCount: scan.analyzedImageCount || images.length || 1,
    confidence: Number(scan.confidence) || 0,
    predictedClass: scan.predictedClass || "Unknown",
    explanation: String(scan.explanation || "").slice(0, 1000),
    riskLevel: scan.riskLevel || "Low",
    probabilities: scan.probabilities || {},
    riskScore: scan.riskScore || 1,
    contextText: String(scan.contextText || "").slice(0, 1200),
    contextPayload: compactContextPayload(scan.contextPayload),
    followupQuestions: Array.isArray(scan.followupQuestions)
      ? scan.followupQuestions.slice(0, 6)
      : [],
    followupAnswers: scan.followupAnswers && typeof scan.followupAnswers === "object"
      ? scan.followupAnswers
      : null,
    backendStatus: scan.backendStatus || "success",
    topLabel: scan.topLabel || scan.predictedClass || "Unknown",
    modelExplainability: compactModelExplainability(scan.modelExplainability, aggressive),
  };

  if (!aggressive) {
    compacted.followupItems = Array.isArray(scan.followupItems) ? scan.followupItems.slice(0, 6) : [];
    compacted.backendDetails = scan.backendDetails || null;
    compacted.aiImageBreakdown = Array.isArray(scan.aiImageBreakdown)
      ? scan.aiImageBreakdown.slice(0, 4)
      : [];
  }

  return compacted;
}

function compactScanList(scans, aggressive = false) {
  if (!Array.isArray(scans)) return [];
  return scans
    .map((scan) => compactScan(scan, aggressive))
    .filter(Boolean)
    .slice(0, MAX_SCAN_HISTORY);
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    if (!isQuotaError(error)) {
      // eslint-disable-next-line no-console
      console.warn(`Failed to persist ${key}`, error);
    }
    return false;
  }
}

function persistHistory(scans) {
  const firstPass = compactScanList(scans, false);
  let working = firstPass;

  while (working.length) {
    if (writeJson(SCANS_KEY, working)) {
      return working;
    }
    working = working.slice(0, -1);
  }

  const aggressivePass = compactScanList(scans, true);
  working = aggressivePass;

  while (working.length) {
    if (writeJson(SCANS_KEY, working)) {
      return working;
    }
    working = working.slice(0, -1);
  }

  // Last fallback: clear oversized last-result payload and retry compact history.
  try {
    localStorage.removeItem(LAST_RESULT_KEY);
  } catch {
    // no-op
  }

  working = compactScanList(scans, true);
  while (working.length) {
    if (writeJson(SCANS_KEY, working)) {
      return working;
    }
    working = working.slice(0, -1);
  }

  if (writeJson(SCANS_KEY, [])) {
    return [];
  }

  return getScanHistory();
}

function persistLastResult(result) {
  const compact = compactScan(result, false);
  if (compact && writeJson(LAST_RESULT_KEY, compact)) {
    return compact;
  }

  const aggressive = compactScan(result, true);
  if (aggressive && writeJson(LAST_RESULT_KEY, aggressive)) {
    return aggressive;
  }

  try {
    localStorage.removeItem(LAST_RESULT_KEY);
  } catch {
    // no-op
  }
  return null;
}

export function getScanHistory() {
  return safeParse(localStorage.getItem(SCANS_KEY), []);
}

export function saveScanHistory(scans) {
  return persistHistory(scans);
}

export function addScan(scan) {
  const current = getScanHistory();
  const next = [scan, ...current];
  return persistHistory(next);
}

export function updateScan(scanId, updates) {
  const current = getScanHistory();
  let updated = null;

  const next = current.map((scan) => {
    if (scan.id !== scanId) return scan;
    updated = { ...scan, ...updates };
    return updated;
  });

  persistHistory(next);

  const last = getLastResult();
  if (last?.id === scanId && updated) {
    persistLastResult(updated);
  }

  return updated;
}

export function deleteScan(scanId) {
  const current = getScanHistory();
  const next = current.filter((scan) => scan.id !== scanId);
  persistHistory(next);

  const last = getLastResult();
  if (last?.id === scanId) {
    if (next.length) {
      persistLastResult(next[0]);
    } else {
      localStorage.removeItem(LAST_RESULT_KEY);
    }
  }

  return next;
}

export function saveLastResult(result) {
  return persistLastResult(result);
}

export function getLastResult() {
  return safeParse(localStorage.getItem(LAST_RESULT_KEY), null);
}

const SCANS_KEY = "derma_scan_history";
const LAST_RESULT_KEY = "derma_last_result";

export function getScanHistory() {
  const raw = localStorage.getItem(SCANS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (error) {
    return [];
  }
}

export function saveScanHistory(scans) {
  localStorage.setItem(SCANS_KEY, JSON.stringify(scans));
}

export function addScan(scan) {
  const current = getScanHistory();
  const next = [scan, ...current];
  saveScanHistory(next);
  return next;
}

export function updateScan(scanId, updates) {
  const current = getScanHistory();
  let updated = null;

  const next = current.map((scan) => {
    if (scan.id !== scanId) return scan;
    updated = { ...scan, ...updates };
    return updated;
  });

  saveScanHistory(next);

  const last = getLastResult();
  if (last?.id === scanId && updated) {
    saveLastResult(updated);
  }

  return updated;
}

export function deleteScan(scanId) {
  const current = getScanHistory();
  const next = current.filter((scan) => scan.id !== scanId);
  saveScanHistory(next);

  const last = getLastResult();
  if (last?.id === scanId) {
    if (next.length) {
      saveLastResult(next[0]);
    } else {
      localStorage.removeItem(LAST_RESULT_KEY);
    }
  }

  return next;
}

export function saveLastResult(result) {
  localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(result));
}

export function getLastResult() {
  const raw = localStorage.getItem(LAST_RESULT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

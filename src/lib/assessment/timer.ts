export const ASSESSMENT_DURATION_SECONDS = 15 * 60;

function timerKey(kind: "pretest" | "posttest", attemptId: string) {
  return `assessment:deadline:${kind}:${attemptId}`;
}

export function assessmentDeadline(
  kind: "pretest" | "posttest",
  attemptId: string,
  remainingSeconds: number,
) {
  const deadline = Date.now() + Math.max(0, remainingSeconds) * 1000;

  try {
    const key = timerKey(kind, attemptId);
    const storedDeadline = Number(window.localStorage.getItem(key));
    if (remainingSeconds > 0 && storedDeadline > 0 && Math.abs(storedDeadline - deadline) < 3000) {
      return storedDeadline;
    }
    window.localStorage.setItem(key, String(deadline));
  } catch {
    // Waktu mulai sesi tetap tersedia dari backend bila penyimpanan browser dibatasi.
  }
  return deadline;
}

export function clearAssessmentDeadline(
  kind: "pretest" | "posttest",
  attemptId: string,
) {
  try {
    window.localStorage.removeItem(timerKey(kind, attemptId));
  } catch {
    // Hasil yang sudah dikirim tersimpan di backend.
  }
}

export function formatAssessmentTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

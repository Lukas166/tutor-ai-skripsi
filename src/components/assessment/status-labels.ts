export const abilityStatusLabels = {
  NOT_ASSESSED: "Belum dinilai",
  NEEDS_REINFORCEMENT: "Perlu penguatan",
  INITIAL_POSITIVE_EVIDENCE: "Indikasi awal baik",
  DEVELOPING: "Sedang berkembang",
  READY_TO_ADVANCE: "Performa kuat",
} as const;

export const learningStageLabels = {
  UNAVAILABLE: "Soal latihan belum tersedia",
  NOT_STARTED: "Belum dibahas",
  LESSON_REQUIRED: "Perlu pembahasan PDF",
  PRACTICING: "Sedang berlatih",
  REVIEW_REQUIRED: "Perlu tinjauan ulang",
  COMPLETED: "Selesai dipelajari",
} as const;

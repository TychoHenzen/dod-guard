export const READABILITY_POLICY = {
  minimumWords: 20,
  threshold: 80,
  maximumSentenceWords: 25,
  weights: {
    fleschReadingEase: 0.6,
    fleschKincaidGrade: 0.4,
  },
  targets: {
    fleschReadingEase: 60,
    fleschKincaidGrade: 9,
  },
} as const;

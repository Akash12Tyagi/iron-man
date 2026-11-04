// All copy and story timing. Times are master-timeline units (3 per act);
// see docs/LEGACY_PROTOCOL.md for the full storyboard.

export const TITLE = "The Legacy Protocol";
export const DURATION = 12;
export const VH_PER_UNIT = 110;

export const ACTS = [
  { n: "01", name: "The Last Light", start: 0, tone: "warm" },
  { n: "02", name: "The Silence", start: 3, tone: "ash" },
  { n: "03", name: "The Unknown", start: 6, tone: "green" },
  { n: "04", name: "The Rise of Doom", start: 9, tone: "green" },
];

/** Act intertitles, shown as each act begins. */
export const CARDS = [
  { act: 0, at: 0.0, out: 0.28 },
  { act: 1, at: 3.0, out: 3.3 },
  { act: 2, at: 5.86, out: 6.22 },
  { act: 3, at: 8.92, out: 9.18 },
];

/** Narration. `pos` places the line; `tone` colours it. */
export const LINES = [
  { text: "Some hearts are made of iron.", at: 0.3, out: 0.62, tone: "warm" },
  { text: "This one gave everything.", at: 1.55, out: 2.1, tone: "warm" },
  { text: "And asked for nothing in return.", at: 2.35, out: 2.95, tone: "warm" },
  { text: "Silence.", at: 3.38, out: 3.72, tone: "ash" },
  { text: "Time does not stop for heroes.", at: 4.1, out: 4.7, tone: "ash" },
  { text: "It only remembers them.", at: 4.95, out: 5.5, tone: "ash" },
  { text: "Far from here, another throne has waited.", at: 6.3, out: 6.88, tone: "green" },
  { text: "He does not ask for permission.", at: 7.12, out: 7.75, tone: "green" },
  { text: "He does not need to be loved.", at: 8.2, out: 8.82, tone: "green" },
  { text: "Only obeyed.", at: 9.22, out: 9.72, tone: "green" },
  { text: "A hero left a legacy.", at: 9.95, out: 10.55, tone: "warm", pos: "upper" },
  { text: "A villain will make history.", at: 10.15, out: 10.55, tone: "green", pos: "lower" },
];

export const FINALE = {
  era: { text: "The end of an era.", at: 10.82 },
  doom: { text: "The rise of Doom.", at: 11.05 },
  film: { text: "Avengers: Doomsday", at: 11.42 },
  note: { at: 11.7 },
};

export const DISCLAIMER =
  "An unofficial fan tribute. Not affiliated with or endorsed by Marvel Studios or The Walt Disney Company. All models and sound are original, generated in code.";

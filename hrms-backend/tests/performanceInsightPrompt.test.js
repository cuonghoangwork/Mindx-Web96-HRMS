import { describe, it, expect } from "vitest";
import { buildInsightPrompt } from "../utils/performanceInsightPrompt.js";

const REVIEW = {
  selfRating: 4,
  selfComments: "Shipped the migration on time.",
  managerRating: 4,
  managerComments: "Solid, dependable work.",
  competencies: {
    communication: { self: 4, manager: 3 },
    execution: { self: 5, manager: null },
    ownership: { self: null, manager: null },
    collaboration: { self: null, manager: null },
    leadership: { self: null, manager: null },
    problemSolving: { self: null, manager: null },
  },
  goals: [{ id: "g1", text: "Mentor a junior engineer", progress: 50 }],
  peerFeedback: [{ id: "p1", name: "Jordan", relation: "Teammate", comments: "Always responsive." }],
};

describe("buildInsightPrompt", () => {
  it("includes the employee name and cycle label", () => {
    const prompt = buildInsightPrompt({ employee: { name: "Dev One" }, cycle: { label: "H2 2026" }, review: REVIEW });
    expect(prompt).toContain("Dev One");
    expect(prompt).toContain("H2 2026");
  });

  it("includes self and manager ratings and comments", () => {
    const prompt = buildInsightPrompt({ employee: { name: "Dev One" }, cycle: { label: "H2 2026" }, review: REVIEW });
    expect(prompt).toContain("Self rating: 4");
    expect(prompt).toContain("Shipped the migration on time.");
    expect(prompt).toContain("Manager rating: 4");
    expect(prompt).toContain("Solid, dependable work.");
  });

  it("includes a line for every competency, filled or not", () => {
    const prompt = buildInsightPrompt({ employee: { name: "Dev One" }, cycle: { label: "H2 2026" }, review: REVIEW });
    expect(prompt).toContain("Communication: self 4, manager 3");
    expect(prompt).toContain("Execution: self 5, manager —");
    expect(prompt).toContain("Ownership: self —, manager —");
  });

  it("includes goals and peer feedback when present", () => {
    const prompt = buildInsightPrompt({ employee: { name: "Dev One" }, cycle: { label: "H2 2026" }, review: REVIEW });
    expect(prompt).toContain("- Mentor a junior engineer (50%)");
    expect(prompt).toContain("Jordan (Teammate): Always responsive.");
  });

  it("reads 'None' for empty goals and peer feedback", () => {
    const prompt = buildInsightPrompt({
      employee: { name: "Dev One" },
      cycle: { label: "H2 2026" },
      review: { ...REVIEW, goals: [], peerFeedback: [] },
    });
    expect(prompt).toMatch(/Goals this cycle:\nNone/);
    expect(prompt).toMatch(/Peer feedback:\nNone/);
  });

  it("asks for a JSON object matching the summary/strengths/growthAreas shape", () => {
    const prompt = buildInsightPrompt({ employee: { name: "Dev One" }, cycle: { label: "H2 2026" }, review: REVIEW });
    expect(prompt).toMatch(/ONLY a JSON object/);
    expect(prompt).toContain('"summary": string, "strengths": string[], "growthAreas": string[]');
  });

  it("includes competency comments in the competency lines when present", () => {
    const prompt = buildInsightPrompt({
      employee: { name: "Dev One" },
      cycle: { label: "H2 2026" },
      review: {
        ...REVIEW,
        competencies: {
          ...REVIEW.competencies,
          communication: { self: 4, selfComment: "Very clear in standups.", manager: 3, managerComment: "Could write more concise updates." },
        },
      },
    });
    expect(prompt).toContain("Communication: self 4, manager 3 | self note: Very clear in standups. | manager note: Could write more concise updates.");
  });

  it("omits the comment segment entirely when no comment is present", () => {
    const prompt = buildInsightPrompt({ employee: { name: "Dev One" }, cycle: { label: "H2 2026" }, review: REVIEW });
    expect(prompt).toContain("Communication: self 4, manager 3\n");
    expect(prompt).not.toContain("Communication: self 4, manager 3 |");
  });

  it("falls back gracefully when review is the empty shaped default", () => {
    const prompt = buildInsightPrompt({
      employee: { name: "Dev One" },
      cycle: { label: "H2 2026" },
      review: { selfRating: null, selfComments: "", managerRating: null, managerComments: "", competencies: {}, goals: [], peerFeedback: [] },
    });
    expect(prompt).toContain("Self rating: — — (none)");
    expect(prompt).toContain("Manager rating: — — (none)");
  });

  it("defaults to English when language is omitted", () => {
    const prompt = buildInsightPrompt({ employee: { name: "Dev One" }, cycle: { label: "H2 2026" }, review: REVIEW });
    expect(prompt).toContain('Write the "summary", "strengths", and "growthAreas" text in English.');
  });

  it("asks for Vietnamese text when language is 'vi'", () => {
    const prompt = buildInsightPrompt({
      employee: { name: "Dev One" },
      cycle: { label: "H2 2026" },
      review: REVIEW,
      language: "vi",
    });
    expect(prompt).toContain('Write the "summary", "strengths", and "growthAreas" text in Vietnamese.');
  });
});

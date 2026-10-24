import { describe, expect, it } from "vitest";
import { decideAfterSeniorConsultation, decideManagerAction, type Situation } from "../team/managerPolicy.js";

describe("decideManagerAction — roadmap 13.8 (balanced = roadmap'in kendi tablosu)", () => {
  it("fix_loop_not_converged → self", () => {
    expect(decideManagerAction("fix_loop_not_converged", "balanced")).toBe("self");
  });
  it("non_blocking_in_scope → self", () => {
    expect(decideManagerAction("non_blocking_in_scope", "balanced")).toBe("self");
  });
  it("small_scope_task_needed → self", () => {
    expect(decideManagerAction("small_scope_task_needed", "balanced")).toBe("self");
  });
  it("ordering_or_parallelism_change → self", () => {
    expect(decideManagerAction("ordering_or_parallelism_change", "balanced")).toBe("self");
  });
  it("tag_correction → self", () => {
    expect(decideManagerAction("tag_correction", "balanced")).toBe("self");
  });
  it("architecture_choice → consult_senior", () => {
    expect(decideManagerAction("architecture_choice", "balanced")).toBe("consult_senior");
  });
  it("security_vulnerability → ask_user", () => {
    expect(decideManagerAction("security_vulnerability", "balanced")).toBe("ask_user");
  });
  it("data_loss_risk → ask_user", () => {
    expect(decideManagerAction("data_loss_risk", "balanced")).toBe("ask_user");
  });
  it("scope_conflict → ask_user", () => {
    expect(decideManagerAction("scope_conflict", "balanced")).toBe("ask_user");
  });
  it("senior_failed → ask_user", () => {
    expect(decideManagerAction("senior_failed", "balanced")).toBe("ask_user");
  });
  it("budget_exceeded → ask_user", () => {
    expect(decideManagerAction("budget_exceeded", "balanced")).toBe("ask_user");
  });
});

describe("decideManagerAction — autonomy varyantları", () => {
  it("cautious: fix_loop/sıra-paralellik/mimari balanced'ta self/consult olanlar ask_user'a yükselir", () => {
    expect(decideManagerAction("fix_loop_not_converged", "cautious")).toBe("ask_user");
    expect(decideManagerAction("small_scope_task_needed", "cautious")).toBe("ask_user");
    expect(decideManagerAction("ordering_or_parallelism_change", "cautious")).toBe("ask_user");
    expect(decideManagerAction("architecture_choice", "cautious")).toBe("ask_user");
  });

  it("bold: scope_conflict/budget_exceeded self'e iner, senior_failed consult_senior'a iner", () => {
    expect(decideManagerAction("scope_conflict", "bold")).toBe("self");
    expect(decideManagerAction("budget_exceeded", "bold")).toBe("self");
    expect(decideManagerAction("senior_failed", "bold")).toBe("consult_senior");
  });

  it("security_vulnerability/data_loss_risk HİÇBİR otonomi seviyesinde 'self' olamaz (dengeli yetki sınırı)", () => {
    const situations: Situation[] = ["security_vulnerability", "data_loss_risk"];
    for (const autonomy of ["cautious", "balanced", "bold"] as const) {
      for (const situation of situations) {
        expect(decideManagerAction(situation, autonomy)).not.toBe("self");
      }
    }
  });
});

describe("decideAfterSeniorConsultation", () => {
  it("senior net öneri verdiyse self döner", () => {
    expect(decideAfterSeniorConsultation(true)).toBe("self");
  });
  it("senior emin değilse ask_user döner", () => {
    expect(decideAfterSeniorConsultation(false)).toBe("ask_user");
  });
});

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { readAgentDefinition } from "../agentFile.js";

describe("readAgentDefinition", () => {
  it("frontmatter'daki tools'u ve gövdeyi (sistem promptu) ayrıştırır", () => {
    const dir = mkdtempSync(join(tmpdir(), "gp-agentfile-test-"));
    try {
      const path = join(dir, "coder.md");
      writeFileSync(
        path,
        "---\nname: coder\ntools: Read, Edit, Write, Bash\n---\n\nSen koderısın.\n",
      );
      const result = readAgentDefinition(path);
      expect(result.tools).toBe("Read, Edit, Write, Bash");
      expect(result.systemPrompt).toBe("Sen koderısın.");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("tools eksikse makul bir varsayılana düşer", () => {
    const dir = mkdtempSync(join(tmpdir(), "gp-agentfile-test-"));
    try {
      const path = join(dir, "x.md");
      writeFileSync(path, "---\nname: x\n---\n\nprompt\n");
      expect(readAgentDefinition(path).tools).toBe("Read,Edit,Write,Bash");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

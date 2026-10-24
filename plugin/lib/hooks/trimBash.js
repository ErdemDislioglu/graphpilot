const MAX_LINES = 50;
/**
 * Faz 7.3 / ADR-005 — PostToolUse (`matcher: "Bash"`) hook'u. research.md'nin DOĞRULADIĞI
 * tek şey `hookSpecificOutput.updatedToolOutput` ile çıktının değiştirilebilir olduğu
 * (bkz. docs/research.md § "tool çıktısı hook ile kırpılabiliyor"). Bash `tool_response`'un
 * TAM iç alan adları (`stdout`/`stderr` mi, başka mı) bu oturumda gerçek bir hook
 * ateşlemesiyle **DOĞRULANMADI**. `extractText` bu yüzden savunmacı yazıldı: birkaç
 * tanıdık alanı dener, hiçbiri uymazsa dokunmadan çıkar — 7.3'ün ❗ kuralı ("GP'yi
 * kullanmayan oturumları etkilememe") tahmin etmekten önce gelir: no-op her zaman güvenli.
 */
export function computeTrimmedBashOutput(input, gate) {
    if (!gate.graphDirExists || !gate.logTrimmingEnabled)
        return {};
    if (input.tool_name !== "Bash")
        return {};
    const text = extractText(input.tool_response);
    if (text === null)
        return {};
    const lines = text.split("\n");
    if (lines.length <= MAX_LINES)
        return {};
    return {
        hookSpecificOutput: {
            hookEventName: "PostToolUse",
            updatedToolOutput: { type: "text", text: lines.slice(-MAX_LINES).join("\n") },
        },
    };
}
function extractText(toolResponse) {
    if (typeof toolResponse === "string")
        return toolResponse;
    if (toolResponse !== null && typeof toolResponse === "object") {
        const r = toolResponse;
        const parts = [r.stdout, r.output, r.text, r.stderr].filter((v) => typeof v === "string" && v.length > 0);
        if (parts.length > 0)
            return parts.join("\n");
    }
    return null;
}

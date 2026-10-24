export interface PostToolUseHookInput {
    cwd?: string;
    tool_name?: string;
    tool_response?: unknown;
}
export interface PostToolUseHookOutput {
    hookSpecificOutput?: {
        hookEventName: "PostToolUse";
        updatedToolOutput: {
            type: "text";
            text: string;
        };
    };
}
/**
 * Faz 7.3 / ADR-005 — PostToolUse (`matcher: "Bash"`) hook'u. research.md'nin DOĞRULADIĞI
 * tek şey `hookSpecificOutput.updatedToolOutput` ile çıktının değiştirilebilir olduğu
 * (bkz. docs/research.md § "tool çıktısı hook ile kırpılabiliyor"). Bash `tool_response`'un
 * TAM iç alan adları (`stdout`/`stderr` mi, başka mı) bu oturumda gerçek bir hook
 * ateşlemesiyle **DOĞRULANMADI**. `extractText` bu yüzden savunmacı yazıldı: birkaç
 * tanıdık alanı dener, hiçbiri uymazsa dokunmadan çıkar — 7.3'ün ❗ kuralı ("GP'yi
 * kullanmayan oturumları etkilememe") tahmin etmekten önce gelir: no-op her zaman güvenli.
 */
export declare function computeTrimmedBashOutput(input: PostToolUseHookInput, gate: {
    graphDirExists: boolean;
    logTrimmingEnabled: boolean;
}): PostToolUseHookOutput;

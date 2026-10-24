const REPEAT_WARNING_THRESHOLD = 3;
/**
 * Faz 7.2 (repo-map kullanımı), 7.7 (döngü tespiti) ve 7.9 (diff disiplini) ÖLÇÜMÜNÜ
 * tek bir PreToolUse hook'unda birleştirir (`matcher: "Read|Glob|Grep|Write|Bash"`).
 * Saf fonksiyon: I/O (sayaç dosyasını okuma/yazma, `.graph` varlığı, dosyanın önceden
 * var olup olmadığı) çağıran tarafın (CLI hook komutu) işi.
 *
 * Uyarı (`additionalContext` — research.md'de DOĞRULANAN alan) SADECE eşik tam
 * aşıldığı anda (`nextCount === 3`) bir kez üretilir — her tekrarda spam etmez.
 * `turn_limits` kapalıysa uyarı ÜRETİLMEZ ama sayaç/ölçüm kaydı yine de tutulur
 * (ölçüm, teknik açık/kapalı farkını karşılaştırabilsin diye tekniğin kendisinden ayrı).
 */
export function computeTrackToolUse(input, gate, counters, fileExistsBeforeWrite) {
    if (!gate.graphDirExists)
        return { output: {}, updatedCounters: counters, record: null };
    const key = targetKey(input.tool_name, input.tool_input);
    if (!key)
        return { output: {}, updatedCounters: counters, record: null };
    const counterKey = `${input.tool_name}:${key}`;
    const nextCount = (counters[counterKey] ?? 0) + 1;
    const updatedCounters = { ...counters, [counterKey]: nextCount };
    const record = {
        tool: input.tool_name,
        target: key,
        count: nextCount,
        ...(input.tool_name === "Write" && fileExistsBeforeWrite === true
            ? { overwritesExisting: true }
            : {}),
    };
    let output = {};
    if (gate.turnLimitsEnabled && nextCount === REPEAT_WARNING_THRESHOLD) {
        const label = input.tool_name === "Bash" ? "komutu" : "hedefi";
        output = {
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                additionalContext: `⚠ GraphPilot: aynı ${input.tool_name} ${label} ("${key}") art arda ${nextCount}. kez kullanılıyor — bir döngüye mi girdin? Yaklaşımını gözden geçir.`,
            },
        };
    }
    return { output, updatedCounters, record };
}
function targetKey(toolName, toolInput) {
    if (!toolInput)
        return null;
    switch (toolName) {
        case "Read":
        case "Write":
            return typeof toolInput.file_path === "string" ? toolInput.file_path : null;
        case "Glob":
        case "Grep":
            return typeof toolInput.pattern === "string" ? toolInput.pattern : null;
        case "Bash":
            return typeof toolInput.command === "string" ? toolInput.command : null;
        default:
            return null;
    }
}

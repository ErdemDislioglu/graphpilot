export interface PreToolUseHookInput {
  cwd?: string;
  session_id?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

export interface PreToolUseHookOutput {
  hookSpecificOutput?: {
    hookEventName: "PreToolUse";
    additionalContext: string;
  };
}

export type ToolUseCounters = Record<string, number>;

export interface ToolUseRecord {
  tool: string;
  target: string;
  count: number;
  /** Sadece `tool_name === "Write"` ve hedef dosya ÇAĞRIDAN ÖNCE zaten varsa `true`. */
  overwritesExisting?: boolean;
}

export interface TrackToolUseResult {
  output: PreToolUseHookOutput;
  updatedCounters: ToolUseCounters;
  /** `null` ise ölçülecek bir şey yok (izlenmeyen bir tool ya da eksik alan). */
  record: ToolUseRecord | null;
}

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
export function computeTrackToolUse(
  input: PreToolUseHookInput,
  gate: { graphDirExists: boolean; turnLimitsEnabled: boolean },
  counters: ToolUseCounters,
  fileExistsBeforeWrite?: boolean,
): TrackToolUseResult {
  if (!gate.graphDirExists) return { output: {}, updatedCounters: counters, record: null };

  const key = targetKey(input.tool_name, input.tool_input);
  if (!key) return { output: {}, updatedCounters: counters, record: null };

  const counterKey = `${input.tool_name}:${key}`;
  const nextCount = (counters[counterKey] ?? 0) + 1;
  const updatedCounters = { ...counters, [counterKey]: nextCount };

  const record: ToolUseRecord = {
    tool: input.tool_name as string,
    target: key,
    count: nextCount,
    ...(input.tool_name === "Write" && fileExistsBeforeWrite === true
      ? { overwritesExisting: true }
      : {}),
  };

  let output: PreToolUseHookOutput = {};
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

function targetKey(
  toolName: string | undefined,
  toolInput: Record<string, unknown> | undefined,
): string | null {
  if (!toolInput) return null;
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

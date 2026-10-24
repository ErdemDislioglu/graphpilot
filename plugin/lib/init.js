import { existsSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "./atomicWrite.js";
const DEFAULT_BRIEF = `## Amaç

(TODO — bu proje ne yapıyor?)

## Stack

(TODO)

## Klasör yapısı

(TODO)

## Konvansiyonlar

(TODO)

## Test stratejisi

(TODO)

## Kapsam dışı

(TODO)
`;
/** SPEC §10'daki belgelenen varsayılanlarla birebir. */
const DEFAULT_CONFIG_YML = `routing:
  - when: { complexity: low, type: [scaffold, docs, config] }
    model: haiku
  - when: { complexity: low }
    model: haiku
  - when: { complexity: med }
    model: sonnet
  - when: { complexity: high }
    model: opus
  - when: { risk: high }
    model: opus
    review: false
escalation: [haiku, sonnet, opus]
max_attempts_per_model: 1
budgets:
  default_context: 8000
  max_turns: 25
confirm_expand: false
parallelism: 2
# checks:
#   build: "npm run build"
#   lint: "npm run lint"
#   test: "npm test"
fix_loop:
  enabled: true
  max_rounds: 3
  acceptance_check_model: haiku
  break_if_no_progress: true
optimizations:
  cache_friendly_order: true
  log_trimming: true
  tool_restriction: true
  batch_low_nodes: true
  deterministic_scaffold: true
  turn_limits: true
  repo_map: true
# scaffold_commands:
#   vite-react: "npm create vite@latest . -- --template react-ts"
mode_b:
  rate_limit_retry:
    enabled: true
    wait_seconds: 60
    max_retries: 3
`;
/**
 * `/gp:init` komutunun altında çalışan deterministik kısım (SPEC §1, §7, §10 varsayılanları).
 * **Idempotent**: var olan dosyaların üzerine yazmaz — zaten başlatılmış bir graph'ta tekrar
 * çalıştırmak güvenlidir, sadece eksik parçaları tamamlar.
 */
export function initGraph(graphRootDir) {
    const created = [];
    const skipped = [];
    const briefPath = join(graphRootDir, "brief.md");
    if (existsSync(briefPath))
        skipped.push(briefPath);
    else {
        writeFileAtomic(briefPath, DEFAULT_BRIEF);
        created.push(briefPath);
    }
    const configPath = join(graphRootDir, "config.yml");
    if (existsSync(configPath))
        skipped.push(configPath);
    else {
        writeFileAtomic(configPath, DEFAULT_CONFIG_YML);
        created.push(configPath);
    }
    return { created, skipped };
}

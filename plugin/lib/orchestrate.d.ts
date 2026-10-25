import type { CommandRunner } from "./checks.js";
import type { ClaudeSpawner, GitRunner } from "./check.js";
import type { StatusChange } from "./rollup.js";
import type { Config } from "./schema/index.js";
import type { Graph, GraphNode } from "./graph/types.js";
/** `gp route` ile aynı kaynak (ekip modu açıksa team tablosu). */
export declare function routeFor(node: GraphNode, config: Config): import("./route.js").RouteResult;
/** Feature/epic roll-up'ı (Faz 14 B2) + INDEX.md ve tüm epic `_index.md`'leri. */
export declare function refreshGraphState(graphRoot: string): {
    rollup: StatusChange[];
    epics: number;
};
/**
 * Faz 14 O16 — feature başına agent. `startId`'den başlayıp aynı feature'da, aynı
 * dosyalara dokunan (`touches` kesişimi), sırayla birbirine bağlı görevleri toplar:
 * pilotta aynı `store.js`'i 7 agent ayrı ayrı okumuştu. Ölçek koruması: yalnız
 * `low/med` complexity ve `risk` ≠ high, en fazla `efficiency.feature_agent_max_tasks`;
 * ardılı birden çoksa zincir durur (paralel işi tek agent'a yığmamak için).
 */
export declare function computeChain(graph: Graph, startId: string, config: Config): string[];
export interface StartedTask {
    id: string;
    agent: string;
    model: string;
    max_turns: number;
    type: string;
    contextPath: string;
    tokenEstimate: number;
    verify: string[];
}
export interface StartResult {
    tasks: StartedTask[];
    /** Birden çok görev tek agent'a verilecekse ortak çağrı: en güçlü model/rol, toplam tur. */
    group: {
        agent: string;
        model: string;
        max_turns: number;
    };
    git: {
        repo: boolean;
        base: string | null;
    };
}
/**
 * Faz 14 O5 — `gp start <id...>`: route + context + `status=running` tek komutta
 * (eskiden görev başına 3 ayrı çağrı + context dosyasını okuma). Context dosyasının
 * İÇERİĞİ değil YOLU döner (O6) — agent kendisi okur.
 */
export declare function startTasks(graphRoot: string, ids: string[], config: Config, opts: {
    projectRoot: string;
    git?: GitRunner;
}): StartResult;
export interface GateResult {
    id: string;
    round: number;
    issues: string[];
    /** Katman 2 çalıştı mı: `verify:` varsa gerekmez; git'siz modda çalışamaz. */
    layer2: "ran" | "skipped-verify" | "unavailable";
    /** Ne `verify:` ne Katman 2 — hiçbir görev düzeyi doğrulama yapılamadı (kullanıcıya bildir). */
    unverified: boolean;
    /** `fix` → eksik listesiyle agent'ı tekrar çağır; `done` → `gp finish`; `escalate` → hata politikası. */
    decision: "fix" | "done" | "escalate";
    reason: string;
}
/**
 * Faz 14 O5/O9 — `gp gate <id> --round N`: bir doğrulama turu tek komutta. Katman 1
 * (`checks` + görevin `verify:` komutları, sıfır token); Katman 1 temizse ve görevin
 * `verify:`'ı yoksa Katman 2 (`claude -p`, diff'e karşı kabul kriterleri). Git'siz modda
 * Katman 2 yapılamaz (B11) — eksik SAYILMAZ ama `unverified: true` döner. Turu kaydeder,
 * fix-loop frenlerini uygular, tek bir karar döner.
 */
export declare function gateTask(graphRoot: string, id: string, config: Config, opts: {
    projectRoot: string;
    round: number;
    runner?: CommandRunner;
    git?: GitRunner;
    spawner?: ClaudeSpawner;
}): GateResult;
export interface FinishResult {
    ok: boolean;
    /** `ok:false` ise: bu düğümün `gp validate` hataları (ör. Handoff yok) — düzeltip tekrar çağır. */
    errors: string[];
    rollup: StatusChange[];
    epicDone: boolean;
    repomap: boolean;
    committed: boolean;
}
/**
 * Faz 14 O5 — `gp finish <id>`: Handoff doğrulaması + `status=done` + roll-up + indeks +
 * epic bittiyse repo-map + kalıntı context dosyasını silme (B5) + git varsa WIP'leri tek
 * commit'e indirme (`gp(<id>): <summary>`). Eskiden görev başına 5–6 ayrı çağrıydı.
 */
export declare function finishTask(graphRoot: string, id: string, config: Config, opts: {
    projectRoot: string;
    base?: string;
    git?: GitRunner;
}): FinishResult;

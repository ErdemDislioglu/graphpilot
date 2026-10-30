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
    /** Başka bir `running` görevin dosyası olduğu için bu commit'e alınmayan değişiklikler. */
    left: string[];
    /** `workflow.push_on_epic_done` ile epic bitince push yapıldıysa true; denenmediyse null. */
    pushed: boolean | null;
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
    siblings?: string[];
}): FinishResult;
/** `git status --porcelain=v1 -z` çıktısındaki yollar (yeniden adlandırmada iki yol da). */
export declare function parsePorcelainZ(out: string): string[];
/**
 * Faz 15 — paralel görevlerde commit karışması. Eskiden `reset --soft <base>` + `add -A`:
 * önce biten görev diğerinin yarım dosyalarını kendi commit'ine alıyor, sonra biten görev
 * `reset --soft` ile öncekinin commit'ini yutuyordu. Artık (1) `base..HEAD`'deki commit'lerin
 * HEPSİ bu görevin `gp-wip`'iyse squash edilir; (2) başka `running` görev varsa onun
 * `touches`'ına ve düğüm dosyasına uyan değişiklikler bu commit'e alınmaz (`left`).
 * `siblings`: aynı agent'ın zincirdeki diğer görevleri — "başka görev" sayılmaz.
 */
export declare function commitTask(graphRoot: string, id: string, opts: {
    projectRoot: string;
    base?: string;
    git: GitRunner;
    siblings?: string[];
}): {
    committed: boolean;
    left: string[];
};
export interface CompleteResult {
    done: {
        id: string;
        committed: boolean;
        unverified: boolean;
    }[];
    /** Eksik var — aynı agent YALNIZ bu listeyi düzeltip `gp complete`'i tekrar çağırır. */
    fix: {
        id: string;
        round: number;
        issues: string[];
    }[];
    /** Üst model/role yükseltildi, kuyruğa (`pending`) geri kondu — uygun worker alır. */
    requeued: {
        id: string;
        agent: string;
        model: string;
    }[];
    /** Yükseltme zincirinin sonu — `failed`; kullanıcıya bitirme özetinde sorulur. */
    failed: {
        id: string;
        reason: string;
    }[];
    /** `finish` reddetti (ör. Handoff yok) — agent düzeltip tekrar çağırır. */
    errors: {
        id: string;
        errors: string[];
    }[];
    epicsDone: string[];
    /** Başka görevin dosyası olduğu için commit'e alınmayanlar (bilgi amaçlı). */
    left: string[];
}
/**
 * Faz 15 — `gp complete <id...>`: her görev için doğrulama turu (`gate`, tur numarası
 * otomatik) + geçtiyse `finish` + yakınsamadıysa yükseltme/kuyruğa geri koyma ya da
 * `fail`. Eskiden agent dönüşü başına ana thread 2–3 ayrı komut ve karar turu atıyordu;
 * şimdi bunu worker'ın kendisi tek komutla yapar. Verilen ID'ler birbirinin "siblings"idir
 * (zincir) — birbirinin dosyasını `left`'e itmez.
 */
export declare function completeTasks(graphRoot: string, ids: string[], config: Config, opts: {
    projectRoot: string;
    runner?: CommandRunner;
    git?: GitRunner;
    spawner?: ClaudeSpawner;
}): CompleteResult;
/**
 * `gp claim` aynı anda birden çok worker'dan çağrılır: `_runtime/claim.lock` O_EXCL ile
 * alınır (iki worker aynı görevi almasın). 30 sn'den eski kilit ölü sayılır.
 */
export declare function withClaimLock<T>(graphRoot: string, fn: () => T, opts?: {
    timeoutMs?: number;
}): T;
export interface ClaimResult {
    /** `null` → bu worker'a uygun, şu an başlatılabilir görev yok; worker çıkar. */
    claimed: StartResult | null;
    /** Bu rol/model için bekleyen ama bağımlılığı ya da dosya çakışması yüzünden henüz başlatılamayan görev sayısı. */
    waiting: number;
}
/**
 * Faz 15 — worker modu: `gp claim --agent <a> --model <m>`. Hazır görevlerden rotası
 * (`gp route`/ekip ataması) bu worker'a düşen, `running` görevlerle dosya (`touches`)
 * çakışması olmayan ilkini (feature_agent açıksa zinciriyle) `gp start` eder.
 */
export declare function claimTasks(graphRoot: string, config: Config, opts: {
    agent: string;
    model: string;
    projectRoot: string;
    git?: GitRunner;
}): ClaimResult;
export interface WorkerSlot {
    agent: string;
    model: string;
    /** Şu an başlatılabilir (hazır + çakışmasız) görev sayısı. */
    ready: number;
}
export interface WorkerPlan {
    /** Başlatılacak worker'lar — en fazla `parallelism` kadar, rol/model başına bir tane. */
    launch: WorkerSlot[];
    running: number;
    expand: string[];
    /** Hiç hazır/çalışan görev ve genişletme adayı kalmadı. */
    finished: boolean;
}
/**
 * Faz 15 — `gp workers`: ana thread'in tek kararı. Hazır görevleri rotaya göre gruplar;
 * çalışan görev sayısı `parallelism`'i dolduruyorsa yeni worker önermez. Worker'lar
 * kendi rotalarındaki işi `gp claim` ile çeker, ana thread görev görmez.
 */
export declare function planWorkers(graphRoot: string, config: Config): WorkerPlan;
/**
 * Faz 15 — `workflow.notify_epic_done`: Mod A'da epic bitince Telegram'a kısa özet. Ağ hatası
 * görevi bozmaz (bildirim yan iş) — gönderilemeyen sayısı döner. `send` testte sahte.
 */
export declare function notifyEpicsDone(graphRoot: string, epicIds: string[], config: Config, send: (text: string) => Promise<unknown>): Promise<{
    sent: number;
    failed: number;
}>;

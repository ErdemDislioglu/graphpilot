import type { TaskTemplateExtras } from "./templates.js";
import type { Graph } from "./graph/types.js";
export interface NewNodeOptions {
    kind: "epic" | "feature" | "task" | "knowledge";
    slug: string;
    /** feature/task/epic-knowledge için zorunlu: epic id (feature/knowledge) veya feature id (task). */
    parent?: string;
    summary?: string;
    /** knowledge: true → `_shared/knowledge/`, false/undefined → epic'in kendi `knowledge/`'ı. */
    shared?: boolean;
    /**
     * Faz 4 eklemesi: oluşturulurken `depends_on`'u doğrudan doldur (epic/feature/task).
     * `/gp:plan` epic'leri bağımlılık sırasıyla yazarken buna ihtiyaç duyar — `gp set`
     * dizi alanları koerse etmiyor (kasıtlı, bkz. set.ts), bu yüzden ayrı bir yol.
     * Her ID, aynı türden ve zaten var olmalı — aksi halde hata (fail-fast, bozuk graph yazılmaz).
     */
    dependsOn?: string[];
    /**
     * Faz 5 eklemesi — aynı gerekçe (`gp set` dizi alanlarını koerse etmiyor). Sadece
     * `kind: task`. Her isim bare (örn. "catalog-api", `[[..]]` DEĞİL) ve zaten var olan
     * bir knowledge düğümüne ait olmalı — aksi halde hata.
     */
    reads?: string[];
    /** Faz 5 eklemesi — sadece `kind: task`. Glob desenleri, varlık kontrolü YAPILMAZ. */
    touches?: string[];
    /** Faz 14 B7b — sadece `kind: task`: type/complexity/risk/context_size/tags/verify. */
    task?: TaskTemplateExtras;
    /**
     * Faz 14 O3/B4 — gövde bölümleri (`{ "Görev": "...", "Kabul kriterleri": "..." }`).
     * Şablondaki `(TODO)` yerine yazılır; şablonda olmayan bölüm sona eklenir.
     */
    body?: Record<string, string>;
}
export interface NewNodeResult {
    id: string;
    filePath: string;
}
/**
 * SPEC/roadmap 2.10 — `gp new <kind> --parent <id> --slug <slug>`. Agent'lar yeni
 * düğümü elle yazmak yerine bunu çağırır; format hatası olmaz, ID asla çakışmaz/yeniden
 * kullanılmaz (`counters.ts`).
 */
export declare function createNewNode(graph: Graph, opts: NewNodeOptions): NewNodeResult;
export declare function fillBody(content: string, body: Record<string, string>): string;

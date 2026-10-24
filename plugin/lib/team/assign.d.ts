import type { GraphNode } from "../graph/types.js";
import type { Config } from "../schema/index.js";
export type TeamRole = "junior" | "senior" | "tester" | "docs";
export interface Assignment {
    role: TeamRole;
    model: string;
    agent: "coder" | "senior" | "tester" | "docs";
}
/**
 * Roadmap 13.3 — tag'e dayalı DETERMİNİSTİK atama tablosu. Sadece `config.team.enabled`
 * ise çağrılır (karar çağıranın işi — bu fonksiyon team modunun açık/kapalı olduğunu
 * BİLMEZ, saf bir eşleme). `assignee` alanı `auto` değilse tabloyu ELLE ezer (13.3).
 *
 * `resolveRoute`'un (route.ts) kuralıyla AYNI: `model` elle verilmişse (≠"auto") model
 * SEÇİMİNDE tablo/complexity'ye bakılmaz, o değer kullanılır — bu, `teamEscalate.ts`'in
 * "junior(haiku) → junior(sonnet)" gibi ARA basamakları yazdıktan sonra bir sonraki
 * `resolveAssignment` çağrısının o basamağı doğru okuması için gerekli (aksi halde her
 * çağrı complexity'den sıfırdan haiku'ya dönerdi).
 *
 * Satır ÖNCELİĞİ roadmap'in tablosunda açık değildi — şu sıra seçildi: `type: docs`/
 * `type: test` ROL olarak önce gelir (bir test görevi her zaman tester'a gider, ne kadar
 * karmaşık olursa olsun — tester kendi escalation zincirini 13.5'te kullanır); SONRA
 * karmaşıklık/risk tabanlı senior yükseltmesi; SONRA junior (complexity'ye göre model).
 */
export declare function resolveAssignment(node: GraphNode, config: Config): Assignment;
/**
 * `route.ts`'in `resolveRoute`'una EŞDEĞER ama `config.routing` tablosuna HİÇ bakmayan
 * sürüm — ekip modu kendi atama mantığını (`config.team.*`) kullanır, `config.routing`'in
 * bir catch-all kuralı olmasına bağımlı olmamalı (kullanıcı ekip modunu açtığında routing
 * tablosunu boş/eksik bırakabilir). `autopilotLoop.ts`'in `config.team.enabled` ise
 * `resolveRoute` yerine bunu çağırması yeterli — yürütme motoru (Mod B) DEĞİŞMEDİ.
 */
export declare function resolveTeamRoute(node: GraphNode, config: Config): {
    model: string;
    agent: string;
    review: boolean;
    budget: number;
    max_turns: number;
};

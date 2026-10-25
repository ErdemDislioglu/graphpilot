/**
 * Roadmap 9.7 — "touches dışındaki dosyalara yazma tespiti". Yeni bir glob kütüphanesi
 * EKLENMEDİ (CLAUDE.md: "bağımlılık eklemeden önce sor") — `fast-glob` taramak için var,
 * "bu tek yol bu deseni karşılıyor mu" sorusunu dışa açmıyor. `next.ts`'in kendi basit/
 * muhafazakâr glob yaklaşımıyla (literalPrefix) aynı ruhta, elle yazılmış minimal bir
 * glob→regex çevirici: `**` (ayraç dahil her şey), `*` (ayraç HARİÇ her şey), `?` (bir karakter).
 */
export declare function globToRegExp(pattern: string): RegExp;
export declare function matchesAnyTouches(relPath: string, touchesPatterns: string[]): boolean;
export interface RunningNodeTouches {
    nodeId: string;
    touches: string[];
    /**
     * Faz 14 B6 — `touches` dışında olsa da bu düğümün yazabileceği graph dosyaları: kendi
     * düğüm dosyası (Handoff) ve `reads`'teki bilgi düğümleri. Proje köküne göre glob.
     */
    allowed: string[];
}
/**
 * `.graph/_runtime/<id>.context.md`'lerin embedded `## node` yaml bloğundan `touches`'ı
 * çıkarır — TAM graph parse'ı (fast-glob ile tüm .md'leri tarayan) YERİNE, sadece o anda
 * aktif olan (az sayıda) context dosyasını okur. Faz 7.3/ADR-005'in "hook hızlı kalmalı"
 * ilkesiyle aynı gerekçe.
 *
 * Faz 14 B5 — context dosyaları görev bittikten sonra da `_runtime/`'da kalıyor; eskiden
 * hepsi "çalışan" sayılıyordu (pilotta liste her görevde büyüdü). Artık düğümün GÜNCEL
 * durumu kendi dosyasından okunur ve yalnız `running` olanlar alınır. Düğüm dosyası
 * bulunamazsa eski davranış korunur (uyarı sistemi — sessizce susmaktansa uyarmak).
 */
export declare function readRunningNodesTouches(graphDir: string): RunningNodeTouches[];
export interface TouchesViolation {
    path: string;
    checkedAgainst: RunningNodeTouches[];
}
/**
 * Hedef dosya, şu an `running` olan HİÇBİR düğümün `touches`'ına uymuyorsa ihlal
 * sayılır. `runningNodes` boşsa (hiç context dosyası yok — ör. plugin kurulu ama
 * `/gp:run` dışında elle bir Write) kontrol ATLANIR (false negative kabul edilebilir —
 * bu bir GÜVENLİK DUVARI değil, bir UYARI sistemi, bkz. roadmap "→ uyarı").
 * Faz 14 B5: proje kökü dışındaki yollar (`../…`, mutlak — ör. `~/.claude/.../memory`)
 * hiçbir düğümün kapsamı değildir, kontrol edilmez.
 */
export declare function checkTouchesViolation(relPath: string, runningNodes: RunningNodeTouches[]): TouchesViolation | null;

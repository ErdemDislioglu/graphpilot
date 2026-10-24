import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
/**
 * Roadmap 9.7 — "touches dışındaki dosyalara yazma tespiti". Yeni bir glob kütüphanesi
 * EKLENMEDİ (CLAUDE.md: "bağımlılık eklemeden önce sor") — `fast-glob` taramak için var,
 * "bu tek yol bu deseni karşılıyor mu" sorusunu dışa açmıyor. `next.ts`'in kendi basit/
 * muhafazakâr glob yaklaşımıyla (literalPrefix) aynı ruhta, elle yazılmış minimal bir
 * glob→regex çevirici: `**` (ayraç dahil her şey), `*` (ayraç HARİÇ her şey), `?` (bir karakter).
 */
export function globToRegExp(pattern) {
    let out = "";
    for (let i = 0; i < pattern.length; i++) {
        const c = pattern[i];
        if (c === "*") {
            if (pattern[i + 1] === "*") {
                out += ".*";
                i++;
            }
            else {
                out += "[^/]*";
            }
        }
        else if (c === "?") {
            out += "[^/]";
        }
        else if (".+^${}()|[]\\".includes(c)) {
            out += `\\${c}`;
        }
        else {
            out += c;
        }
    }
    return new RegExp(`^${out}$`);
}
export function matchesAnyTouches(relPath, touchesPatterns) {
    return touchesPatterns.some((p) => globToRegExp(p).test(relPath));
}
/**
 * `.graph/_runtime/<id>.context.md`'lerin embedded `## node` yaml bloğundan `touches`'ı
 * çıkarır — TAM graph parse'ı (fast-glob ile tüm .md'leri tarayan) YERİNE, sadece o anda
 * aktif olan (az sayıda) context dosyasını okur. Faz 7.3/ADR-005'in "hook hızlı kalmalı"
 * ilkesiyle aynı gerekçe.
 */
export function readRunningNodesTouches(graphDir) {
    const runtimeDir = join(graphDir, "_runtime");
    let files;
    try {
        files = readdirSync(runtimeDir).filter((f) => f.endsWith(".context.md"));
    }
    catch {
        return [];
    }
    const out = [];
    for (const file of files) {
        try {
            const content = readFileSync(join(runtimeDir, file), "utf-8");
            const match = content.match(/## node\s*\n\s*```yaml\n([\s\S]*?)\n```/);
            if (!match)
                continue;
            const parsed = parseYaml(match[1]);
            if (typeof parsed.id !== "string" || !Array.isArray(parsed.touches))
                continue;
            out.push({
                nodeId: parsed.id,
                touches: parsed.touches.filter((t) => typeof t === "string"),
            });
        }
        catch {
            // Bu context dosyası okunamadı/bozuk — yoksay, hook ASLA bu yüzden çökmemeli.
        }
    }
    return out;
}
/**
 * Hedef dosya, şu an `running` olan HİÇBİR düğümün `touches`'ına uymuyorsa ihlal
 * sayılır. `runningNodes` boşsa (hiç context dosyası yok — ör. plugin kurulu ama
 * `/gp:run` dışında elle bir Write) kontrol ATLANIR (false negative kabul edilebilir —
 * bu bir GÜVENLİK DUVARI değil, bir UYARI sistemi, bkz. roadmap "→ uyarı").
 */
export function checkTouchesViolation(relPath, runningNodes) {
    if (runningNodes.length === 0)
        return null;
    const covered = runningNodes.some((n) => matchesAnyTouches(relPath, n.touches));
    if (covered)
        return null;
    return { path: relPath, checkedAgainst: runningNodes };
}

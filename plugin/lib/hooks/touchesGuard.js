import { readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
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
 * `E01-F01-T01` → `.graph/E01-*\/tasks/F01-T01-*.md`. Tam graph parse'ı yerine iki
 * `readdir` — hook hızlı kalmalı (ADR-005). Bulunamazsa `null`.
 */
function findTaskFile(graphDir, nodeId) {
    const [epic, ...rest] = nodeId.split("-");
    if (!epic || rest.length === 0)
        return null;
    const prefix = `${rest.join("-")}-`;
    try {
        for (const dir of readdirSync(graphDir)) {
            if (dir !== epic && !dir.startsWith(`${epic}-`))
                continue;
            const tasksDir = join(graphDir, dir, "tasks");
            const file = readdirSync(tasksDir).find((f) => f.startsWith(prefix) && f.endsWith(".md"));
            if (file)
                return join(tasksDir, file);
        }
    }
    catch {
        // okunamayan dizin — düğüm dosyası bilinmiyor
    }
    return null;
}
function readStatus(filePath) {
    try {
        const match = readFileSync(filePath, "utf-8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
        const status = match?.[1].match(/^status:\s*["']?([a-z_]+)/m);
        return status ? status[1] : null;
    }
    catch {
        return null;
    }
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
            const nodeFile = findTaskFile(graphDir, parsed.id);
            if (nodeFile && readStatus(nodeFile) !== "running")
                continue;
            const graphRel = relative(dirname(graphDir), graphDir) || ".graph";
            const allowed = nodeFile ? [relative(dirname(graphDir), nodeFile)] : [];
            for (const entry of Array.isArray(parsed.reads) ? parsed.reads : []) {
                const name = typeof entry === "string" ? /^\[\[([a-z][a-z0-9-]*)\]\]$/.exec(entry)?.[1] : undefined;
                if (name)
                    allowed.push(`${graphRel}/**/knowledge/${name}.md`);
            }
            out.push({
                nodeId: parsed.id,
                touches: parsed.touches.filter((t) => typeof t === "string"),
                allowed,
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
 * Faz 14 B5: proje kökü dışındaki yollar (`../…`, mutlak — ör. `~/.claude/.../memory`)
 * hiçbir düğümün kapsamı değildir, kontrol edilmez.
 */
export function checkTouchesViolation(relPath, runningNodes) {
    if (runningNodes.length === 0)
        return null;
    if (isAbsolute(relPath) || relPath === ".." || relPath.startsWith("../"))
        return null;
    const covered = runningNodes.some((n) => matchesAnyTouches(relPath, n.touches) || matchesAnyTouches(relPath, n.allowed));
    if (covered)
        return null;
    return { path: relPath, checkedAgainst: runningNodes };
}

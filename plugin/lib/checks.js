import { execSync } from "node:child_process";
const MAX_OUTPUT_LINES = 50;
/** `scaffold.ts` (Faz 7.6) da aynı çalıştırıcıyı paylaşır — tek execSync sarmalayıcı. */
export const defaultRunner = (command, cwd) => {
    try {
        const output = execSync(command, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
        return { ok: true, output };
    }
    catch (err) {
        const stdout = isExecError(err) ? String(err.stdout ?? "") : "";
        const stderr = isExecError(err) ? String(err.stderr ?? "") : String(err);
        return { ok: false, output: `${stdout}${stderr}` };
    }
};
function isExecError(err) {
    return typeof err === "object" && err !== null && ("stdout" in err || "stderr" in err);
}
/**
 * SPEC/roadmap 6.3 — Katman 1 (script, sıfır token). `config.yml`'deki `checks.*`
 * komutlarını SIRAYLA çalıştırır; agent'a hiçbir çağrı yapmaz. Başarısızlıkta sadece
 * son `MAX_OUTPUT_LINES` satırı döner — tüm log değil.
 *
 * Faz 7.3: kırpma `config.optimizations.log_trimming` ile açılıp kapatılabilir
 * (varsayılan açık — ablasyon dışında her zaman böyle kalmalı).
 */
export function runChecks(projectRoot, checks, runner = defaultRunner, opts = {}) {
    const trimOutput = opts.trimOutput ?? true;
    const results = [];
    for (const name of ["build", "lint", "test"]) {
        const command = checks[name];
        if (!command)
            continue;
        const { ok, output } = runner(command, projectRoot);
        results.push({ name, command, ok, output: ok ? undefined : trimOutput ? truncate(output) : output.trim() });
    }
    return results;
}
function truncate(output) {
    const lines = output.split("\n");
    const tail = lines.length <= MAX_OUTPUT_LINES ? lines : lines.slice(-MAX_OUTPUT_LINES);
    return tail.join("\n").trim();
}

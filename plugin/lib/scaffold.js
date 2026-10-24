import { defaultRunner } from "./checks.js";
/**
 * Roadmap 7.6 — "Deterministik iskelet". `type: scaffold` task'ları için, agent
 * yazmadan ÖNCE resmi iskelet aracı (ör. `npm create vite@latest`) script ile çalıştırılır;
 * agent sadece özelleştirme yapar. `config.optimizations.deterministic_scaffold` kapalıysa
 * (ablasyon) HİÇBİR ŞEY çalıştırmaz, `ran:false` + sebep döner — orkestratör bu durumda
 * agent'ı iskeletin TAMAMINI yazması için normal akışla çağırır.
 */
export function runScaffold(node, config, projectRoot, runner = defaultRunner) {
    if (node.kind !== "task" || node.frontmatter.type !== "scaffold") {
        return { ran: false, skippedReason: `${node.id} bir 'type: scaffold' task'ı değil` };
    }
    if (!config.optimizations.deterministic_scaffold) {
        return { ran: false, skippedReason: "optimizations.deterministic_scaffold kapalı (ablasyon)" };
    }
    const stack = node.frontmatter.scaffold_stack;
    if (typeof stack !== "string") {
        return { ran: false, skippedReason: `${node.id}'de 'scaffold_stack' alanı yok` };
    }
    const command = config.scaffold_commands[stack];
    if (!command) {
        return {
            ran: false,
            skippedReason: `config.yml'deki scaffold_commands'ta '${stack}' için komut tanımlı değil`,
        };
    }
    const { ok, output } = runner(command, projectRoot);
    return { ran: true, command, ok, output };
}

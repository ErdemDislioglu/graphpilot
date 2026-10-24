import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseGraph } from "./graph/parser.js";
import { ConfigSchema } from "./schema/index.js";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

const MIN_NODE_MAJOR = 22;

/** `gp doctor` — SPEC/roadmap 3.2: kurulum, Node sürümü, `.graph/` varlığı kontrolü. */
export function runDoctor(graphRootDir: string): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  const nodeMajor = Number(process.version.slice(1).split(".")[0]);
  checks.push({
    name: "node-version",
    ok: nodeMajor >= MIN_NODE_MAJOR,
    detail: `${process.version} (gerekli: >=${MIN_NODE_MAJOR})`,
  });

  const graphExists = existsSync(graphRootDir);
  checks.push({
    name: "graph-dir",
    ok: graphExists,
    detail: graphExists ? graphRootDir : `yok — \`gp init\` çalıştır: ${graphRootDir}`,
  });
  if (!graphExists) return checks;

  const briefExists = existsSync(join(graphRootDir, "brief.md"));
  checks.push({
    name: "brief",
    ok: briefExists,
    detail: briefExists ? "brief.md var" : "brief.md yok — `gp init` çalıştır",
  });

  const configPath = join(graphRootDir, "config.yml");
  const configExists = existsSync(configPath);
  checks.push({
    name: "config",
    ok: configExists,
    detail: configExists ? "config.yml var" : "config.yml yok — `gp init` çalıştır",
  });

  try {
    const graph = parseGraph(graphRootDir);
    const configValid = graph.rawConfig !== null && ConfigSchema.safeParse(graph.rawConfig).success;
    checks.push({
      name: "config-valid",
      ok: configValid,
      detail: configValid ? "config.yml şemaya uygun" : "config.yml eksik veya geçersiz",
    });
    checks.push({
      name: "parse",
      ok: graph.parseErrors.length === 0,
      detail:
        graph.parseErrors.length === 0
          ? `${graph.nodesById.size} düğüm hatasız okundu`
          : `${graph.parseErrors.length} parse hatası — \`gp validate\` çalıştır`,
    });
  } catch (err) {
    checks.push({ name: "parse", ok: false, detail: String(err) });
  }

  return checks;
}

import { existsSync, readFileSync, rmSync } from "node:fs";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { createNewNode } from "../newNode.js";
import { parseGraph } from "../graph/parser.js";
import { withTempGraph } from "../testUtils/tempGraph.js";
import {
  EpicFrontmatterSchema,
  FeatureFrontmatterSchema,
  TaskFrontmatterSchema,
  KnowledgeFrontmatterSchema,
} from "../schema/index.js";

describe("createNewNode — epic", () => {
  it("E01'i oluşturur, Zod'dan geçer", () => {
    withTempGraph({}, (graph) => {
      const result = createNewNode(graph, { kind: "epic", slug: "catalog" });
      expect(result.id).toBe("E01");
      const { data } = matter(readFileSync(result.filePath, "utf-8"));
      expect(EpicFrontmatterSchema.safeParse(data).success).toBe(true);
    });
  });

  it("ikinci epic E02 olur", () => {
    withTempGraph({}, (graph, dir) => {
      createNewNode(graph, { kind: "epic", slug: "catalog" });
      const graph2 = parseGraph(dir);
      const result = createNewNode(graph2, { kind: "epic", slug: "cart" });
      expect(result.id).toBe("E02");
    });
  });
});

describe("createNewNode — feature", () => {
  it("E01-F01'i epic'in tasks/ klasörüne F01-<slug>.md olarak yazar", () => {
    withTempGraph({}, (graph, dir) => {
      createNewNode(graph, { kind: "epic", slug: "catalog" });
      const graph2 = parseGraph(dir);
      const result = createNewNode(graph2, { kind: "feature", parent: "E01", slug: "search" });
      expect(result.id).toBe("E01-F01");
      expect(result.filePath).toContain("/E01-catalog/tasks/F01-search.md");
      const { data } = matter(readFileSync(result.filePath, "utf-8"));
      expect(FeatureFrontmatterSchema.safeParse(data).success).toBe(true);
    });
  });

  it("var olmayan parent epic'te hata fırlatır", () => {
    withTempGraph({}, (graph) => {
      expect(() => createNewNode(graph, { kind: "feature", parent: "E99", slug: "x" })).toThrow(
        /parent bulunamadı/,
      );
    });
  });
});

describe("createNewNode — task", () => {
  it("E01-F01-T01'i feature-göreli dosya adıyla (F01-T01-<slug>.md) yazar", () => {
    withTempGraph({}, (graph, dir) => {
      createNewNode(graph, { kind: "epic", slug: "catalog" });
      createNewNode(parseGraph(dir), { kind: "feature", parent: "E01", slug: "search" });
      const result = createNewNode(parseGraph(dir), {
        kind: "task",
        parent: "E01-F01",
        slug: "search-endpoint",
      });
      expect(result.id).toBe("E01-F01-T01");
      expect(result.filePath).toContain("/E01-catalog/tasks/F01-T01-search-endpoint.md");
      const { data } = matter(readFileSync(result.filePath, "utf-8"));
      expect(TaskFrontmatterSchema.safeParse(data).success).toBe(true);
    });
  });
});

describe("createNewNode — knowledge", () => {
  it("epic-scope knowledge, epic'in knowledge/ klasörüne yazılır", () => {
    withTempGraph({}, (graph, dir) => {
      createNewNode(graph, { kind: "epic", slug: "catalog" });
      const result = createNewNode(parseGraph(dir), {
        kind: "knowledge",
        parent: "E01",
        slug: "search-notes",
      });
      expect(result.id).toBe("search-notes");
      expect(result.filePath).toContain("/E01-catalog/knowledge/search-notes.md");
      const { data } = matter(readFileSync(result.filePath, "utf-8"));
      expect(KnowledgeFrontmatterSchema.safeParse(data).success).toBe(true);
    });
  });

  it("--shared knowledge, _shared/knowledge/'a yazılır, parent gerekmez", () => {
    withTempGraph({}, (graph) => {
      const result = createNewNode(graph, { kind: "knowledge", slug: "db-schema", shared: true });
      expect(result.filePath).toContain("/_shared/knowledge/db-schema.md");
    });
  });
});

describe("createNewNode — ID yeniden kullanılmaz (silinen düğümün numarası boşta kalmaz)", () => {
  it("T01 silinip tekrar gp new task çağrılırsa T02 verilir, T01 DEĞİL", () => {
    withTempGraph({}, (graph, dir) => {
      createNewNode(graph, { kind: "epic", slug: "catalog" });
      createNewNode(parseGraph(dir), { kind: "feature", parent: "E01", slug: "search" });
      const t01 = createNewNode(parseGraph(dir), { kind: "task", parent: "E01-F01", slug: "a" });
      expect(t01.id).toBe("E01-F01-T01");

      rmSync(t01.filePath); // kullanıcı T01'i elle siler
      expect(existsSync(t01.filePath)).toBe(false);

      const t02 = createNewNode(parseGraph(dir), { kind: "task", parent: "E01-F01", slug: "b" });
      expect(t02.id).toBe("E01-F01-T02"); // T01 DEĞİL — sayaç dosyadan değil counters.json'dan okundu
    });
  });
});

describe("createNewNode — validasyon", () => {
  it("geçersiz slug (büyük harf) hata fırlatır", () => {
    withTempGraph({}, (graph) => {
      expect(() => createNewNode(graph, { kind: "epic", slug: "Catalog" })).toThrow(
        /geçersiz slug/,
      );
    });
  });
});

describe("createNewNode — dependsOn (Faz 4 eklemesi)", () => {
  it("epic, başka bir epic'e depends_on ile oluşturulabilir", () => {
    withTempGraph({}, (graph, dir) => {
      createNewNode(graph, { kind: "epic", slug: "catalog" }); // E01
      const result = createNewNode(parseGraph(dir), {
        kind: "epic",
        slug: "payments",
        dependsOn: ["E01"],
      });
      const { data } = matter(readFileSync(result.filePath, "utf-8"));
      expect(data.depends_on).toEqual(["E01"]);
      expect(EpicFrontmatterSchema.safeParse(data).success).toBe(true);
    });
  });

  it("var olmayan depends_on hedefi hata fırlatır, dosya yazılmaz", () => {
    withTempGraph({}, (graph, dir) => {
      expect(() => createNewNode(graph, { kind: "epic", slug: "a", dependsOn: ["E99"] })).toThrow(
        /depends_on hedefi bulunamadı/,
      );
      // Hiçbir dosya oluşturulmadı
      expect(parseGraph(dir).nodesById.size).toBe(0);
    });
  });

  it("depends_on farklı türdeki bir ID'ye işaret ederse hata fırlatır", () => {
    withTempGraph({}, (graph, dir) => {
      createNewNode(graph, { kind: "epic", slug: "catalog" }); // E01
      expect(() =>
        createNewNode(parseGraph(dir), {
          kind: "feature",
          parent: "E01",
          slug: "search",
          dependsOn: ["E01"], // feature, bir epic'e depends_on olamaz
        }),
      ).toThrow(/değil: E01/);
    });
  });

  it("dependsOn verilmezse boş dizi (geriye dönük uyumlu)", () => {
    withTempGraph({}, (graph) => {
      const result = createNewNode(graph, { kind: "epic", slug: "catalog" });
      const { data } = matter(readFileSync(result.filePath, "utf-8"));
      expect(data.depends_on).toEqual([]);
    });
  });
});

describe("createNewNode — task reads/touches (Faz 5 eklemesi)", () => {
  it("reads bare isimleri [[name]] olarak yazar, touches olduğu gibi", () => {
    withTempGraph({}, (graph, dir) => {
      createNewNode(graph, { kind: "epic", slug: "catalog" }); // E01
      createNewNode(parseGraph(dir), { kind: "feature", parent: "E01", slug: "search" }); // E01-F01
      createNewNode(parseGraph(dir), { kind: "knowledge", parent: "E01", slug: "catalog-api" });
      const result = createNewNode(parseGraph(dir), {
        kind: "task",
        parent: "E01-F01",
        slug: "impl",
        reads: ["catalog-api"],
        touches: ["src/catalog/**"],
      });
      const { data } = matter(readFileSync(result.filePath, "utf-8"));
      expect(data.reads).toEqual(["[[catalog-api]]"]);
      expect(data.touches).toEqual(["src/catalog/**"]);
      expect(TaskFrontmatterSchema.safeParse(data).success).toBe(true);
    });
  });

  it("var olmayan reads hedefi hata fırlatır, dosya yazılmaz", () => {
    withTempGraph({}, (graph, dir) => {
      createNewNode(graph, { kind: "epic", slug: "catalog" });
      createNewNode(parseGraph(dir), { kind: "feature", parent: "E01", slug: "search" });
      expect(() =>
        createNewNode(parseGraph(dir), {
          kind: "task",
          parent: "E01-F01",
          slug: "impl",
          reads: ["yok-boyle-bir-sey"],
        }),
      ).toThrow(/reads hedefi bulunamadı/);
    });
  });
});

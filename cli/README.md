# @graphpilot/cli

`gp` — GraphPilot'un graph üzerindeki tüm deterministik işlerini yapan CLI.
**Hiçbir komut LLM çağırmaz** (model düşünür, script çalışır — bkz. 00-ROADMAP.md).

```bash
nvm use         # .nvmrc → Node 22 (vitest 5 + zod 4 güvenlik düzeltmesi gerektirir)
npm install
npm test        # Vitest
npm run gp -- <komut>   # geliştirme sırasında (tsx, build gerekmez)
npm run build   # dist/ üretir (gp binary)
```

## Komutlar

| Komut | İş |
|---|---|
| `init` | `.graph/` iskeleti: `brief.md` + `config.yml` varsayılanları (idempotent) |
| `doctor` | Kurulum, Node sürümü, `.graph/` sağlığı kontrolü |
| `brief --file <path>` | `brief.md`'yi gerçek içerikle değiştirir (idempotent değil — planner kullanır) |
| `validate` | Zod şema + kırık link + döngü + token sınırı kontrolü |
| `index` | `INDEX.md` + her epic'in `_index.md`'sini üretir (deterministik) |
| `next [--limit N]` | Hazır (ready) task'lar + çakışmasız paralel gruplar |
| `status` | Durum özeti (toplam, byStatus, byKind, running) |
| `set <id> k=v...` | Frontmatter alanlarını atomik günceller (yazmadan önce Zod doğrular) |
| `route <id>` | Task için model/agent/budget çözümler (`config.yml` routing tablosu) |
| `context <id>` | Agent'a giden bağlam paketini üretir (`.graph/_runtime/<id>.context.md`) |
| `repomap [-p <dir>]` | Proje kodunu tarar, `repo-map.md` knowledge düğümü üretir |
| `new <kind> --slug ... [--depends-on a,b]` | Yeni düğüm iskeleti (ID asla yeniden kullanılmaz) |
| `resume` | Kesinti sonrası ~500 token'lık "nerede kaldık" özeti |

Her komut `--graph-root <path>` (varsayılan `./.graph`) ve `--json` (makine-okur çıktı,
agent'lar bunu kullanır) alır.

## Mimari notu

`src/schema/` Zod şemaları (SPEC.md §3-§10), `src/graph/parser.ts` okuma, diğer modüller
(`validate`, `indexGen`, `next`, `route`, `context`, ...) birer deterministik işlem.
`src/cli.ts` commander kablolaması, `src/bin.ts` giriş noktası. Ayrıntı: `docs/SPEC.md`.

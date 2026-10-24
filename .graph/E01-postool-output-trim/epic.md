---
id: "E01"
kind: "epic"
name: "E01-postool-output-trim"
summary: "Faz 7.3 pilotu: Bash çıktısını kırpan PostToolUse hook'u"
status: "pending"
expanded: false
depends_on: []
draft: false
---

## Amaç

Roadmap `faz-07-token-optimizasyonu.md` madde 7.3'ün (Log ve çıktı kırpma) henüz
yapılmamış kalan parçası: `plugin/hooks/hooks.json`'a bir `PostToolUse` hook'u ekle,
Bash tool'un çıktısını (sadece `coder`/`tester` agent'larının Bash çağrılarında, ana
oturumda DEĞİL) kırpsın. ADR-005, bunun `hookSpecificOutput.updatedToolOutput` alanıyla
mümkün olduğunu zaten doğrulamıştı (Faz 0). `cli/src/checks.ts`'teki `runChecks`'in
kendi kırpması (son 50 satır, Faz 6) zaten var — bu epic onun KAPSAMAdığı, agent'ın
kendi ad-hoc Bash çağrılarını (`npm test` dışında elle çalıştırdığı komutlar) kapsıyor.

## Kapsam

**Dahil:**
- Hook script'i (muhtemelen `plugin/scripts/trim-bash-output.sh` veya benzeri): stdin'den
  hook JSON'unu okur, `tool_response`'un metin çıktısı N satırdan uzunsa son N satıra
  kırpar, `hookSpecificOutput.updatedToolOutput` ile döner.
- `config.yml`'e açma/kapama alanı (örn. `optimizations.log_trimming: true`, roadmap'in
  Faz 7 girişindeki `optimizations:` bloğuyla tutarlı olacak şekilde) — ileride Faz 7.10'un
  ablasyon tablosu bunu kapatıp açacak.
- Sadece `matcher: Bash` için çalışmalı; hook plugin yüklendiği anda her oturumda
  tetiklenir (Faz 0 bulgusu) — `.graph/` yoksa veya optimizasyon kapalıysa SESSİZCE
  çıktıyı değiştirmeden geçmeli (başka projeleri etkilememeli).

**Kapsam dışı:** `cli/src/checks.ts`'in kendi kırpması (zaten var, dokunma). Diğer Faz 7
maddeleri (7.1, 7.2, 7.4-7.10) — bu epic SADECE 7.3'ün hook kısmı.

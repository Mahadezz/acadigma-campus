---
"@acadigma/pdf": patch
---

Bengali sentences in PDFs now end with a real danda (`।`) instead of a tofu box: `ScriptText` sends U+0964/U+0965 to Hind Siliguri. Adds a regression test that inflates every `FlateDecode` stream of a rendered PDF with `node:zlib` and checks the Bengali text layer.

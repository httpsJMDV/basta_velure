---
name: no-slop
description: Style guard for code, comments, docs, commit messages and reports. Use when writing or reviewing anything that will be committed or read by the team, to strip generic AI filler.
---

Write like the surrounding code and docs, not like a chatbot.

Prose (docs, PR text, commit messages, reports):
- Lead with the fact. No openers ("Great", "Certainly"), no closers ("Let me know if...", "I hope this helps").
- Ban filler words: robust, seamless, comprehensive, leverage, streamline, utilize, delve, crucial, ensure (when "check" or "make sure" works), "it's worth noting".
- No em-dash chains, no rule-of-three padding, no restating the question, no summary that repeats the body.
- Say what is verified and what is not. Never write "should work"; either you ran it or say "unverified".
- Use numbers, file paths, and command output instead of adjectives.

Code:
- Comments explain why, never what. No comment on obvious lines, no banner comments, no commented-out code, no TODO without an owner or feature number (e.g. `TODO(2.8)`).
- No speculative abstractions, helper layers, config flags, or error handling for cases that cannot happen.
- Match existing naming, file layout, and patterns. Reuse components before adding new ones.
- No new dependencies unless unavoidable, and flag them.
- Remove debug leftovers (console.log, dd, dump, placeholder text, hardcoded localhost).

Before finishing, reread the diff once and delete anything a reviewer would call padding.

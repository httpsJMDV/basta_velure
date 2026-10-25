# AI product check (Amaru task 7)

When a seller publishes a product, the AI reads its name, category, price and description and looks at up to three
photos. It answers with one verdict and a short reason (JSON).

The AI is **Groq** by default (free plan): a check with photos uses `GROQ_VISION_MODEL` (`qwen/qwen3.8-27b`, which
reads images, at most 3 per request), a check without photos uses `GROQ_MODEL` (`openai/gpt-oss-120b`). Set
`AI_PROVIDER=claude` to use Claude Haiku 5.5 instead (paid API credits). Both go through `App\Services\Ai\AiModel`.

| Verdict | What happens |
|---|---|
| `approve` | The product goes live (`status` active, `published_at` set). The seller gets a "Product is live" notice. |
| `send_to_admin` | It stays in **Admin > Products > Pending review** with the AI's reason. Admins get a notice. |
| `reject` | Same as `send_to_admin` while `AI_PRODUCT_AUTO_REJECT` is off (the default): the admin makes the final call. With it on, the product is rejected and the seller sees the reason. |
| AI unreachable, refused, or cut off | Sent to the admin instead of being published (`ai_review_status` unavailable). |

The seller is only told the product is "being checked" or "in review". The AI's reason for a flag stays with Loved-IT.

## When it runs

Only when `AI_PRODUCT_CHECK=true` **and** `ANTHROPIC_API_KEY` is set. Otherwise publishing works exactly as before.

- Publishing a new product, a draft, a deactivated or a rejected product (create, edit, the status toggle, bulk activate).
- Editing a live product **only** when its name, description, category or photos change. Price and stock edits do not
  trigger a check.

While the check runs the product is `pending_review` with `ai_review_status = checking`, so buyers never see an
unchecked listing. The check runs on the queue (`App\Jobs\CheckProductWithAi`), so `php artisan queue:work` must be
running. If it is not, the product simply waits in Pending review and an admin can approve it by hand.

## Fields

`products.ai_review_status` (checking / approved / flagged / unavailable / rejected), `ai_review_verdict`,
`ai_review_reason`, `ai_reviewed_at`.

- `GET /admin/products` and `GET /admin/products/{id}` return them as `ai_review: {status, verdict, reason, reviewed_at}`.
- `GET /seller/products` returns `ai_review_status` only.

## Setup

```
AI_PROVIDER=groq
GROQ_API_KEY=gsk_...              # from console.groq.com; never commit it
AI_PRODUCT_CHECK=true
AI_PRODUCT_AUTO_REJECT=false      # keep off until the AI's rejections are trusted
# optional: GROQ_MODEL, GROQ_VISION_MODEL, AI_TIMEOUT=30, AI_MAX_RETRIES=2
# Claude instead: AI_PROVIDER=claude and ANTHROPIC_API_KEY=sk-ant-... (needs API credits; Claude Pro does not include them)
```

Groq's free plan allows about 30 requests a minute plus daily caps. A check that hits the limit fails like any other
error, so the product goes to the admin instead of going live.

Then `php artisan config:clear` and restart `php artisan queue:work`.

Code: `app/Services/Ai/ProductChecker.php` (prompt, photos shrunk to 1,024 px, stop reason and refusal checks),
`app/Jobs/CheckProductWithAi.php` (what each verdict does). Tests: `tests/Feature/AiProductCheckTest.php` (a fake model,
no real API calls).

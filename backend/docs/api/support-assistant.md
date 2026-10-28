# Loved-IT Assistant in Support chat (Amaru task 8)

The buyer's **Loved-IT Support** chat (`type = buyer_admin`) is answered first by the AI: Groq's `openai/gpt-oss-120b`
by default (free plan), or Claude Haiku 5.5 with `AI_PROVIDER=claude`. It can:

- look up the signed-in buyer's **own** orders: status and history, items, delivery fee, payment, tracking number,
  whether the order can still be cancelled or returned, and until when;
- explain the rules: payment (COD and GCash), delivery fees, order steps, cancelling, the return window, vouchers;
- hand the chat to the Loved-IT team ("Talk to a person").

It **cannot** cancel, refund, change an order or give vouchers. It has no tool for that; it tells the buyer which
button to use, or hands the chat to a person.

## Privacy

The tools only read orders where `orders.buyer_id` is the buyer of this conversation. Another buyer's order number
gets "No order with that number on this buyer's account." The tool results leave out the payment
token, receipt image and phone number.

## Who answers

`conversations.support_mode`:

| Value | Meaning |
|---|---|
| empty | The assistant answers (when it is switched on). |
| `human` | A person has taken over. The assistant stays quiet. |

The chat goes to a person when:

- the buyer taps **Talk to a person** (`POST /conversations/{id}/handoff`, buyer only, 10 per minute);
- the assistant decides to (its `talk_to_a_person` tool), for example for fraud, a payment problem, or a request for
  a person. A rude, joking or off-topic message is **not** a reason: the assistant stays polite and keeps helping;
- the AI can't be reached (including Groq's free-plan rate limit), declines, or the job fails. The buyer gets
  "Sorry, I can't answer right now..." and the chat goes to a person;
- an admin replies in the chat;
- the chat reaches 40 assistant replies in a day.

On a handoff, active admins get a notification (kind `support.handoff`, link `/admin/messages?conversation={id}`)
and the chat's `admin_unread` goes up. While the assistant answers, buyer messages do **not** add to `admin_unread`,
so admins only see chats that need them. Admins can still open any support chat and read the assistant's replies.

The assistant comes back when:

- an admin marks the chat **resolved** (the next question goes to the assistant), or
- the buyer taps **Ask the assistant** after a handoff (`POST /conversations/{id}/assistant`, buyer only, 10 per
  minute, 409 while the assistant is switched off). If the buyer's last message is still unanswered, the assistant
  answers it; otherwise it posts "I'm back! How can I help you...". Admins can still read and reply in the chat.

## API changes

- Conversations (`GET /conversations`, `GET /conversations/{id}`, the `ConversationUpdated` broadcast) have
  `support_mode`: `ai` while the assistant answers a Loved-IT Support chat, `human` otherwise, `null` for other chats;
  and `assistant_available`: whether the assistant can be asked back (it is switched on and a key is set).
- Assistant messages have `sender_id: null`, `sender_role: "assistant"`, `sender_name: "Loved-IT Assistant"`
  (`messages.sender_kind = 'ai'` in the database).
- `POST /conversations/{id}/handoff` and `POST /conversations/{id}/assistant` return the updated conversation.
- **Order cards:** when a reply names orders the assistant looked up (or it opened exactly one order), the message
  carries `attachment_type: "order_list"` and `attachment_data.orders` (up to 4): `id`, `order_number`, `status`,
  `status_label`, `total`, `items_count`, `items_summary`, `image`, `placed_at`, `tracking_number`. Only the
  assistant posts these; the send endpoint does not accept `order_list` from users. The buyer's chat shows them
  under the reply once it has typed out: one order as a full card with "View order", several as rows with
  "View all orders".

## How it runs

A buyer message queues `App\Jobs\AnswerSupportMessage`. The job reads the last 20 messages of the chat, calls the AI
with three tools (`list_my_orders`, `get_order`, `talk_to_a_person`), runs up to 5 tool rounds, and posts the reply.
If the buyer sent another message meanwhile, the newer message's job answers both. `php artisan queue:work` must be
running; without it, buyers see no reply.

## Setup

```
AI_PROVIDER=groq
GROQ_API_KEY=gsk_...           # from console.groq.com; never commit it
AI_SUPPORT_BOT=true
```

The chat shows plain text, so any markdown the model adds (`**bold**`, `#` headings) is removed before posting.

Then `php artisan config:clear` and restart `php artisan queue:work`. With the flag off or no key, support chat works
exactly as before (people answer, `support_mode` is `human`).

Code: `app/Services/Ai/SupportAssistant.php` (prompt, tools, tool loop), `app/Services/SupportChat.php` (posting,
handoffs, unread counts), `app/Jobs/AnswerSupportMessage.php`. Frontend: `components/chat/SupportAssistantKit.tsx`.
Tests: `tests/Feature/SupportAssistantTest.php` (a fake model, no real API calls).

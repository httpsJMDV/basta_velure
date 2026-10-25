# Buyer pages check (Amaru task 1), October 24, 2026

Each buyer form's browser checks were compared with the server's rules (`HOW_IT_WORKS.md` section 13 and the
controllers), and the new screens were opened at phone width (390 px) and desktop width.

## Fixed

| Page | Problem | Fix |
|---|---|---|
| Reviews (write a review) | The text box allowed 1,000 characters, but the server takes **500**. A long review failed only after pressing Submit. | The box stops at 500 and the counter shows `/500`. |
| Reviews (write a review) | WEBP photos could be picked, but the server takes **JPG or PNG** only. | The picker and the check accept JPG and PNG only. |
| Addresses | The street had no length limit (server: 255) and Floor / Unit had none (server: 100). | The boxes stop at 255 and 100 characters. |
| Messages (floating chat and the full page) | No length limit in the box; the server refuses messages over **1,000** characters. | The boxes stop at 1,000. |
| Orders > Return / Refund | The photo previews were never released from memory while the dialog stayed open. | Previews are released when photos change or the dialog closes. |
| Checkout (earlier today) | E-wallet and card were offered; a code that is not a voucher was added and only failed at Place Order. | COD and GCash only; an unknown code shows "No voucher found" and is not added. |
| Product page (earlier today) | Thumbnails took too much room and the selected one had no full outline. | Thumbnails sit below the photo with a full border on the selected one. |
| Product page and seller sales (earlier today) | A sale's end date showed no year, so a 2027 end date looked like it had passed. | The year is shown, and a sale can run for at most 90 days. |

## Checked and already right

- **Sign up, sign in, email code, forgot password, complete profile:** names (2 to 50, letters), email (up to 100),
  mobile (`09XXXXXXXXX` or `+639XXXXXXXXX`), 18 or older (Manila date), password rules, terms. Rebuilt today.
- **Product page:** quantity can't go below 1 or above the stock or the purchase limit; typed values are checked.
- **Cart:** the same quantity limits; the server re-prices at checkout.
- **Checkout:** notes length, GCash 13-digit reference and JPG/PNG receipt up to 5 MB for each shop.
- **Cancel order:** a reason is required; "Other" needs 10 to 300 characters, as on the server.
- **Return / Refund:** description 10 to 500 characters and 1 to 5 JPG/PNG photos up to 5 MB, as on the server.
- **Loved-IT Support chat** (new assistant): works at phone and desktop width; "Talk to a person" hands over and the
  assistant bar goes away.

## Left as they are (small, noted)

- **Addresses:** the recipient's name is held to the account-name rule (2 to 50 letters), which is stricter than the
  server (2 to 100). Stricter is the safe direction, so it was kept.
- **Return / Refund dialog:** says "The shop has 3 days to answer". That number is an admin setting; if an admin
  changes it, this sentence needs a value from the server.

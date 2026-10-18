# Loading the black-box workbooks' test data

The five module workbooks share one Test Data sheet: Buyers 1 and 2 with ADDR-1 to ADDR-4, Sellers 1 to 3, Seller 1's
store categories, products P-01 to P-07, the vouchers, Logistics 1 (Bilis Hatid Express) and 2 (Agila Cargo) with
their zones and test rates, and Riders 1 to 3. One command creates all of it:

```bash
cd backend
php artisan workbook:seed          # asks which database first
php artisan workbook:seed --force  # no question, for scripts
```

- It only adds. Anything that already exists (found by email, voucher code, product name or company slug) is kept as
  it is, passwords included, so it is safe to run again.
- Run it against the database the testers use. It prints the logins and passwords of the Test Data sheet when done.
- The admin's PLAT100 and FREESHIP vouchers are created for the first admin account found.
- Logistics 1's hub covers Seller 1's shop and ADDR-1 and ADDR-2, so checkout gives Seller 1's orders to Logistics 1
  and uses its rates: within NCR ₱50 + ₱15 per extra kg, NCR and Visayas ₱120 + ₱40, within Visayas ₱60 + ₱20.
  ADDR-4 (Itbayat, Batanes) is in no zone, so it cannot be checked out.
- Rider 1 covers Seller 1's barangay and Rider 2 another Quezon City barangay, so a new pickup is offered to Rider 1
  first. Rider 3 is suspended with a reason. Riders go Online from their dashboard before they get offers.
- The barangay codes are placeholders that agree with each other (shop, hub, rider areas, addresses); the city,
  province and region codes are the real PSGC ones, which is what the zones compare.

`tests/Feature/WorkbookSeedTest.php` runs the command twice and checks the worked checkout example (₱1,083.00) on the
seeded records.

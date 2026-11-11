# Backend changes — what the frontend needs to do

**For:** whoever works on the `technest11` frontend
**Backend:** <https://technestbackend-gue0.onrender.com> (version 2.0.0)
**Try every endpoint:** <https://technestbackend-gue0.onrender.com/api/docs>
**Full details:** `API_INTEGRATION.md` sections 13–24 (section numbers below
point there)

The backend gained IMEI checks, email verification, WhatsApp checkout,
identity and phone verification, customer requests with vendor offers,
categories with filters, flash sales, bulk upload and more. A few changes
**break the current frontend** — do those first.

---

## 1. Broken right now — fix first

| What broke | Where in `technest11` | Fix |
|---|---|---|
| **Phone listings are rejected** — the backend requires the IMEI | `app/value/page.tsx` | Send `imei` with phone listings (spaces/dashes fine). Optionally send `imeiPhoto` (Cloudinary URL of the `*#06#` screen). **Stop sending `imeiVerified`** — the server sets it. Show the 400/409 `error` message (bad IMEI, reported stolen, already listed). §13 |
| **"WhatsApp seller" button has no number** — seller phones are no longer public | `app/marketplace/page.tsx` (~line 810, `l.userPhone`) | Replace with the TechNest WhatsApp order: `POST /api/order-requests { listingId, buyerName, buyerPhone }` → open `data.whatsappUrl`. §15 |
| **Owner email / vendor phone missing on listings** | `app/admin/page.tsx` (`owner?.email`, `vendorProfile?.phone`) | Admins still get them from `/api/admin/listings` and `/api/admin/vendors/pending` — use those there. Public listing `owner` now has only `name`, `vendorProfile.businessName/city/states`, `identityVerified`, `phoneVerified`. §22 |
| **Users get a 403 they can't fix** | every form that lists, buys, bids, posts a request | On `code: "email_not_verified"` show the `message` and a **Resend link** button → `POST /api/auth/resend-verification`. §14 |
| **Vendor forms rejected with "Invalid CSRF token"** if not using `apiFetch` | `app/become-vendor/page.tsx` | `PATCH /api/vendor/upgrade` and `/verify` now need the `X-CSRF-Token` header like every other form. §22 |
| **Phone swaps are rejected** — the offered phone's IMEI is now required | the swap form (`/marketplace` swap window) | Send `offeredDevice.imei` when the offered device is a phone; show the 400/409 message. §25 |

## 2. Changed responses

- **Listings** (`GET /api/listings`, `/api/listings/:id`): no `userPhone`,
  owner email or vendor phone for the public; `bids[]` is empty for the
  public and holds only the vendor's own bid for vendors — use `bidCount`;
  new `isReserved` / `isAvailable`, `imeiLast4`, `imeiCheck`, `snapchatStatus`.
  Paged: `?page=&limit=` (max 100) → `total`, `pages`. Statuses other than
  active/sold/swapped are admin-only. §22
- **Errors**: `{ success: false, message, code }`. `message` is always safe
  to show. Codes: `email_not_verified`, `service_unavailable` (show "try
  again" — it has a `Retry-After`), `invalid`, `duplicate`, `bad_json`,
  `too_large`, `cors`, `server_error`. §24
- **Products**: may carry `attributes` (category filters) and
  `sale: { active, priceUkUsed, priceBrandNew, endsAt, label }` — when
  `active`, show the sale price with the normal price struck through. §19
- **`GET /api/me`**: adds `identityVerified`, `identityStatus`, `phone`,
  `phoneVerified`.
- **Valuation** (`POST /api/valuation/estimate`): each `breakdown` line has
  a naira `amount`; adds `confidence`, `likelyRange`, `warnings`,
  `repairDeduction`. `min`/`max`/`value` mean the same as before. §23

## 3. Already built on the frontend — just check

- `/auth/forgot-password` and `/auth/reset-password` already call the right
  endpoints. The email link opens `/auth/reset-password?token=…`. Test it.
- `/auth/login`: the email-confirmation link lands here with
  `?verified=success` or `?verified=invalid` — show a toast for each. §14

## 4. Replace the frontend's own API routes

These Next.js routes talk to MongoDB directly. They don't work on Vercel
(no database settings there) and duplicate what the backend now does:

| Delete | Use instead |
|---|---|
| `app/api/vendor-requests` (on `/b2b`) | `/api/requests` — customer requests, vendor offers (§18) |
| `app/api/repair-vendors` (on `/fix`) | `GET /api/vendors/directory?type=repairs&state=Lagos` (§17) |
| `app/api/vendor-inventory` (on `/b2b`) | `/api/vendor/inventory` + `/api/vendor/inventory/bulk` (§19) |
| `app/api/listing-freshness` (marketplace, `/user`) | `isReserved` / `isAvailable` on each listing (§15) |

## 5. New things to build

### Customers

- **Checkout** (`/checkout`): "Chat with us on WhatsApp" (`POST
  /api/order-requests` → open `whatsappUrl`) and a disabled "Pay online —
  Coming soon" (`GET /api/order-requests/options`). "My orders":
  `GET /api/order-requests/mine`. §15
- **Sell form** (`/value`): cosmetic grade, "What's not working?"
  checkboxes (`GET /api/valuation/conditions`), "Does Snapchat work?",
  "Signed out of iCloud/Google?"; show line amounts, confidence and
  likely range. §23
- **Post a request & compare offers**: `POST /api/requests`, offers come
  best-first with `recommended`; accept → open `whatsappUrl`. §18
- **Get verified** (ID + selfie, private uploads) → "Verified seller"
  badge. §16
- **Verify my number** (WhatsApp) → "Phone verified" tick. §21
- **IMEI check** box and **report a stolen device** page. §13
- **Category menu & filter sidebar** from `/api/categories` and
  `/api/categories/:slug`; **flash sale** strip from
  `/api/products/flash-sale` (use `serverTime` for the countdown). §19
- **Reserved** badge on listings held for a buyer.

### Vendors

- Vendor form: business name, type (phones / gadgets / accessories /
  repairs), states, brands, repair services, CAC certificate upload. §17
- Requests inbox + offer form: `/api/requests/for-vendor`,
  `POST /api/requests/:id/offers`. Bulk stock upload. §18, §19

### Admin

- WhatsApp orders (§15), identity checks (§16), requests (§18), stolen
  reports and IMEI model codes (§13), users & phone waiting list (§21),
  categories editor, bulk product upload, flash sale (§19), announcements
  (§20), estimate accuracy report (§23), listing review flags (§10).

### Everywhere

- Notifications: handle the new `type`s (`device_request`,
  `offer_received`, `offer_accepted`, `offer_update`, `order_request`,
  `identity_update`, `account_update`, `listing_update`,
  `stolen_device_alert`, `stolen_report_update`, `announcement`,
  `admin_alert`). Links: `listing`, `transaction`, `order`, `orderRequest`,
  `deviceRequest` ids.
- Optional status banner from `GET /api/health`.

## 6. Newer additions (§25)

- **Account settings:** log out everywhere, download my data, delete my
  account, email preferences.
- **Sellers:** "Still available" button — listings expire after 30 days
  without it; expired badge.
- **Ratings:** stars on offers and the vendor directory, a vendor rating
  page, "Rate your deal" prompts after completed deals, vendor replies.
- **Disputes:** "Report a problem" on deals and orders, with a message
  thread.
- **WhatsApp checkout:** delivery or pickup, address; delivery status and
  rider on "My orders".
- **Marketplace:** search box, price range, storage, sort.
- **Catalog:** "Only N left" when `lowStock`.
- **Admin:** finance (earnings, payouts owed, commissions due, "mark
  paid"), disputes, reviews moderation, activity log, force sign-out, and
  final price / commission when completing an order or request.
- **Removed:** `/api/gadgets`, `/api/prices`, `/api/devices`,
  `/api/recommendations` — unused by the frontend.

## 7. Mobile UI requests (answers to `mobile-ui-checklist.html`)

Items 1–8 are done; 9 (web push) isn't built yet. Every new field is
optional, so these can be picked up in any order.

### 🔴 1. Product ratings

- Every product from `GET /api/products`, `/products/{id}`,
  `/products/search` and `/products/flash-sale` has
  `rating: { average, count }`, or `null` when nobody has rated it.
  `average` has one decimal place.
- **Rule:** ratings come from buyers of completed catalog orders — online
  orders once paid and delivered, WhatsApp orders once staff complete them.
  One rating per product per order, within 30 days.
- **Asking buyers to rate:** `GET /api/reviews/pending` now also returns
  product deals: `{ type: "order" | "order_request", id, product: { id, name, image }, label }`.
- **Submitting:** `POST /api/reviews { source: { type, id, productId: product.id }, rating, comment }`.
- **Product page:** `GET /api/reviews/products/{slug}` →
  `{ average, count, stars, reviews, page, pages }`.
- **Sort:** `?sort=rating` on `GET /api/products`.

### 🔴 2. Product images

- `image` is now returned for gadgets too (it used to be phones only), plus
  optional `images: string[]` for extra photos.
- Photos appear once admins add them (`PATCH /api/products/{slug}` or the
  `image` / `images` CSV columns) — most products have none yet.
- No `imageWidth` / `imageHeight`: images are on Cloudinary, so use a fixed
  aspect-ratio box plus a Cloudinary resize (e.g. `c_fill,w_400,ar_1:1`).

### 🔴 3. Admin document review

- `GET /api/admin/vendors/pending`: each vendor now has `cacCertificateMime`
  and `identity: { status, idType, fullName, nameMatch, submittedAt, idDocumentUrl, idDocumentMime, selfieUrl, selfieMime, … }`
  (`identity` is `null` if they never did the identity check).
- New `GET /api/admin/identity/{userId}` → same shape as one item of `people`.
- Mime values look like `"application/pdf"` / `"image/jpeg"`, or `null` when
  unknown — keep the URL guess as a fallback.
- Signed links don't expire, so they won't run out during a review.

### 🟡 4. Rate limiting

- Public GET browsing (`/api/listings*`, `/api/products*`,
  `/api/categories*`, public reviews, vendor directory) has its own
  allowance: 1,000 requests per 15 minutes. Everything else: 150.
- Signed-in users are counted per account, not per IP, so people sharing a
  carrier IP don't block each other.
- Every 429 has `Retry-After` (seconds) plus `RateLimit-*` headers.

### 🟡 5. Vendor summary

- `GET /api/vendor/summary` (verified vendors) →
  `{ newRequests, pendingOrders, pendingOrdersBreakdown: { wonRequests, listingOrders }, unreadNotifications, activeListings, rating: { average, count } }`.
- `newRequests` = open matched requests they haven't offered on yet.
- `pendingOrders` = requests they won that aren't completed + WhatsApp
  orders for their listings that staff are still handling.

### 🟡 6. Vendor application status

- `GET /api/me` (and the `PATCH /api/vendor/verify` response) include
  `vendorApplication: { status: "not_started" | "submitted" | "approved" | "rejected", submittedAt, reviewedAt, rejectionReason }`.
  Use it instead of checking `vendorProfile.phone`.
- Rejecting still clears the profile, but `status: "rejected"` and the
  reason stay until the vendor resubmits.

### 🟡 7. Catalog paging and sorting

- Already worked: `page`, `limit` (max 200), `total`, `pages`, `q`,
  `brand`, `sort=price-asc|price-desc`.
- New: `sort=newest`, `sort=rating`, `storage=256GB`, `color=Onyx Black`
  (case-insensitive; comma-separated = any of). Add `condition=brand-new`
  so price sorting uses the brand-new price.

### ⚪ 8. Flash sale extras

- `upcoming[].sale.priceUkUsed` / `priceBrandNew` are returned whenever the
  admin set them — usable now.
- New: when an admin caps a sale, `sale.stockLimit` and `sale.sold` are
  included (progress bar = `sold / stockLimit`). At the cap the sale ends
  (`active: false`) and leaves the flash-sale page. Ordering more than are
  left at the sale price → 409 with a message you can show as-is.

### ⚪ 9. Web push

Not built yet. Tell us if the site becomes installable.

## 8. Testing tips

- In the docs, log in with `POST /api/auth/login` → **Try it out**; the
  session cookies are set for you. For POST / PATCH / DELETE, click
  **Authorize** and paste the `csrfToken` from the login response into
  `csrfHeader (X-CSRF-Token)`.
- Email works on the live backend (Brevo). Phone verification is manual
  until the WhatsApp Cloud API is set up — staff verify from the admin
  panel. Online payment is off (WhatsApp checkout instead).
- Backend tests: `npm test` in the backend repo.

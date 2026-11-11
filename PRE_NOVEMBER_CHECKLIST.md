# Tech Nest — Pre-November Checklist

Status of the pre-November plan as of 10 November 2026, based on what is in
this backend repo. Checked = done. Unchecked = not done or only partly done
(the note says what's missing). Frontend items live in `technest11`; see
`FRONTEND_CHANGES.md` for what it needs to build.

## 1. Business & Platform Foundation

- [ ] CAC business registration — business task
- [x] Hosting runs on Render with a health check (`/api/health`)
- [x] Nightly encrypted database backups
- [x] Team is emailed when the server breaks
- [ ] Current user capacity measured
- [ ] Plan for scaling as users and vendors grow
- [x] Middleman flow for Sell, Swap, Repair and Accessories (WhatsApp orders, customer requests, vendor offers)
- [x] Commission calculation and record of who owes whom (finance dashboard)
- [ ] Final platform percentage agreed — code uses 5% as a placeholder (`PLATFORM_FEE_PERCENT`)
- [x] Paystack integration written: collection, split to vendor, payouts, platform commission
- [x] Customers can't be debited twice for the same transaction (idempotent payment confirmation)
- [ ] Online payments switched on — currently "Coming soon" until `ONLINE_PAYMENTS=on`

## 2. Vendor & Repairer Management

- [x] Email announcements to existing vendors (all / approved / pending)
- [ ] Existing vendors actually notified — announcement not yet sent
- [x] Accessory vendor registration (vendor type `accessories`)
- [ ] Accessory vendors onboarded — people task
- [x] Phone repairer registration (vendor type `repairs`, repair services, CAC upload)
- [ ] Phone repairers onboarded — people task
- [x] Vendors see customer requests relevant to them (matched by type, state and brand)
- [x] Vendors can browse and monitor the marketplace
- [x] Email verification during signup
- [x] Email confirmations and notifications for vendor and customer activity

## 3. Identity, Phone & Device Verification

- [x] Nigerian phone-number format check — invalid numbers rejected
- [ ] Phone number checked at account signup — signup doesn't collect a phone; it's checked on listings, vendor signup, orders and phone verification
- [x] Real phone number verification (WhatsApp code, or by staff)
- [x] Identity check: ID photo, selfie, bank account name match, admin approval
- [ ] NIN verification API — no paid NIN service connected yet
- [x] IMEI format and check-digit validation
- [x] IMEI make/model lookup (own TAC database)
- [x] Stolen-device registry
- [ ] Official Nigerian device-status (IMEI) API — none connected; availability still to be confirmed
- [x] Database of submitted IMEIs
- [x] Duplicate IMEI listings blocked and flagged
- [x] IMEI checked on phones offered in swaps

## 4. Marketplace & Gadget Management

- [x] Listings show whether a gadget is available or reserved
- [x] Sold or unavailable devices don't show as available (stock counts, listing expiry)
- [x] Bulk upload for admins
- [x] Bulk upload for approved vendors
- [x] Automatic response to sell requests
- [x] Automatic response to swap requests
- [x] Automatic response to repair requests
- [x] More accurate device valuation (condition, faults, specs, confidence, likely range)
- [x] Snapchat ban asked during evaluation and lowers the valuation
- [ ] Snapchat ban checked automatically — no service exists; relies on the seller's answer

## 5. Product Categories & Detailed Filters

- [x] Gaming: consoles, gaming PCs, controllers, accessories, games
- [x] Speakers
- [x] Headphones & earphones
- [x] Cameras & CCTV
- [x] Smart glasses
- [x] Projectors
- [x] Microphones
- [x] Power & electrical: extension sockets, power banks, power stations / power tanks, UPS, solar
- [x] Filters specific to each category
- [x] New categories can be added without rebuilding the marketplace

## 6. User Experience, Navigation & Promotions

- [ ] Navbar more prominent and polished — frontend
- [ ] Navbar works well on mobile — frontend
- [x] Flash sale backend (live and upcoming sales, server time for the countdown)
- [ ] Flash sale section visible on the marketplace — frontend
- [ ] Skeleton loading states — frontend
- [x] Clear error responses when services are down (`service_unavailable`, `Retry-After`)
- [ ] User-facing error and downtime screens — frontend

## 7. Final End-to-End Testing

- [x] Automated backend tests: IMEI, phone, valuation, email, marketplace, privacy, health (`npm test`)
- [ ] Full Sell flow tested
- [ ] Full Swap flow tested
- [ ] Full Repair/Fix flow tested
- [ ] Accessories flow tested
- [ ] Vendor onboarding tested
- [ ] Email verification and notifications tested
- [ ] Nigerian phone-number validation tested end to end
- [ ] NIN and IMEI verification tested
- [ ] Duplicate IMEI prevention tested end to end
- [ ] Marketplace availability and bulk uploads tested
- [ ] Payment calculations, commissions, payouts and duplicate-debit prevention tested
- [ ] Category filters and product discovery tested
- [ ] Flash sale visibility tested
- [ ] Responsive behaviour on desktop and mobile tested

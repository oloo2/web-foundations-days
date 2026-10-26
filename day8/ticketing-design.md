# TicketHub: Ticketing System Design

## 1. Requirements

### Functional requirements

- Visitors can browse and search concerts and events, view event details, and see seat availability and prices.
- Registered users can sign in, select available seats, place a temporary hold, and pay for tickets.
- A user can view their orders and retrieve their tickets after a successful purchase.
- Event organizers can create events, configure venues, seats, prices, and sale times, and review sales.
- The system must not confirm more than one active reservation or order for the same seat at an event.
- Failed or abandoned checkouts must release their seats so that other customers can buy them.

### Non-functional requirements

- **Correctness:** Seat allocation and order confirmation must be atomic and durable. A seat must never be sold twice, even under concurrent requests or retries.
- **Fairness:** For a published on-sale time, customers already waiting are assigned a randomized queue position, and refreshing or retrying does not create extra entries or improve a person's place. Later arrivals join the end of the queue.
- **Availability:** Event browsing should remain available during a sale surge. The ticket purchase path should degrade gracefully rather than overload the database.
- **Performance:** Event pages should respond quickly; target a p95 under 300 ms for cached browsing requests. Seat holds should normally respond within 2 seconds, excluding external payment-provider time.
- **Scalability:** Handle 2 million registered users, normal daily browsing and sales, and the concentrated demand for a popular on-sale event.
- **Security:** Authenticate users for checkout and order access; authorize organizer operations; protect personal and payment data; and apply rate limits and bot/fraud controls.
- **Recoverability:** Persist orders and seat state, use idempotent payment/order operations, and monitor queue depth, hold expiry, payment failures, and database health.

## 2. Estimates

These are planning estimates, not measured production peaks. They assume the normal day's traffic is spread across 24 hours. Actual demand will be burstier, so the system should be load-tested and scaled using observed peak traffic.

### Normal day

- **Registered users:** 2,000,000.
- **Visitors:** 50,000 per day.
- **Page views:** 50,000 visitors × 10 pages = **500,000 page views per day**, or about **5.8 page views per second on average**.
- **Planning peak for browsing:** Assuming a 10× peak-to-average ratio gives about **58 page views per second**. Cached event and catalog pages can serve most of this without querying the transactional database.
- **Tickets sold:** 5,000 per day, or about **0.058 tickets per second on average**. Sales are not evenly distributed, so checkout capacity should be based on measured busy periods rather than this daily average alone.

### Popular concert on sale

- **Demand:** 200,000 people try to buy 20,000 seats during the first 10 minutes.
- **Average arrival rate:** 200,000 ÷ 600 seconds = about **333 purchase attempts per second**.
- **Oversubscription:** There are **10 people per seat**. The system must reject or queue unsuccessful attempts; it cannot treat demand as inventory.
- **Burst planning:** If arrivals briefly reach 4× the 10-minute average, the entry point should accommodate about **1,333 attempts per second** or defer excess traffic in a waiting room. This is a stated capacity assumption to verify with load tests, not a guarantee about the actual burst.
- **Admission control:** A virtual waiting room and rate-limited checkout admission smooth bursts before they reach the seat database. Browsing is served separately and can remain available while purchase admission is throttled.

## 3. API

All endpoints are versioned under `/api/v1`. Checkout endpoints require authentication. The client supplies an idempotency key for hold, order, and payment actions so that a network retry does not create duplicate work.

| Method and endpoint                      | Purpose                                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/v1/events?query=&date=&page=`  | Search and paginate events.                                                                                                                                        |
| `GET /api/v1/events/{eventId}`           | Get event details, venue information, and sale status.                                                                                                             |
| `GET /api/v1/events/{eventId}/seats`     | Get a seat map and current availability; availability is informational and can change before a hold is placed.                                                     |
| `POST /api/v1/organizer/events`          | Create an event for an authenticated, authorized organizer.                                                                                                        |
| `POST /api/v1/events/{eventId}/holds`    | Atomically hold one or more requested seats for the authenticated user. Returns a hold ID and expiry time, or a conflict if any seat is no longer available.       |
| `DELETE /api/v1/holds/{holdId}`          | Release the user's unconfirmed hold.                                                                                                                               |
| `POST /api/v1/holds/{holdId}/orders`     | Create a pending order from a valid hold. Repeated requests with the same idempotency key return the same result.                                                  |
| `POST /api/v1/orders/{orderId}/payments` | Submit payment for the authenticated user's pending order and begin payment authorization. Repeated requests with the same idempotency key return the same result. |
| `GET /api/v1/orders/{orderId}`           | Get the authenticated user's order and ticket status.                                                                                                              |
| `GET /api/v1/orders/{orderId}/tickets`   | Retrieve tickets for the authenticated user's confirmed order.                                                                                                     |

The hold endpoint is the authoritative availability check; clients must handle a conflict and choose different seats. The API never promises a seat based only on the seat-map response.

## 4. Data model

Use a relational database for the transactional seat and order records. Primary keys and foreign keys enforce identity and relationships; transactions enforce state changes that span multiple records.

| Table      | Important fields                                                                                                         | Relationships and constraints                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`    | `user_id` (PK), `email` (unique), `created_at`                                                                           | One user can create many holds and orders.                                                                                                                |
| `venues`   | `venue_id` (PK), `name`, `address`                                                                                       | One venue can host many events.                                                                                                                           |
| `events`   | `event_id` (PK), `name`, `venue_id` (FK), `starts_at`, `sale_opens_at`, `status`                                         | Each event belongs to one venue and can have many seats and orders.                                                                                       |
| `seats`    | `seat_id` (PK), `event_id` (FK), `section`, `row`, `number`, `price`, `status`, `hold_id`, `hold_expires_at`, `order_id` | Each seat belongs to one event. `UNIQUE(event_id, section, row, number)` prevents duplicate seat definitions. `status` is `available`, `held`, or `sold`. |
| `holds`    | `hold_id` (PK), `user_id` (FK), `event_id` (FK), `created_at`, `expires_at`, `status`                                    | One user/event hold can cover multiple seats. A hold has many seat assignments; each seat's `hold_id` points to its current hold.                         |
| `orders`   | `order_id` (PK), `user_id` (FK), `event_id` (FK), `hold_id` (FK), `status`, `total`, `created_at`                        | One user can have many orders; an order is created from a hold. `status` includes `pending_payment`, `confirmed`, `cancelled`, and `payment_failed`.      |
| `payments` | `payment_id` (PK), `order_id` (FK), `provider_reference` (unique), `status`, `amount`, `created_at`                      | An order can have payment attempts; provider references are unique to make callbacks and retries idempotent.                                              |

### Preventing two people from buying the same seat

The `seats` row is the single source of truth for each event seat. When a user requests seats, the service runs a database transaction that conditionally changes each requested row from `available` to `held`, sets a unique `hold_id` and `hold_expires_at`, and creates the hold record. The update succeeds only if the seat is still available (or its prior hold has expired). The transaction locks/updates the seat rows and commits all requested seats together; if any requested seat cannot be claimed, it rolls back the whole hold. Concurrent buyers therefore cannot both transition the same seat from available.

After payment authorization, another transaction confirms the order only if the hold is still active and unexpired, changes the held seats to `sold`, assigns the order, and marks the order confirmed. A unique database constraint on the seat's event/seat identity prevents duplicate seat records; row-level conditional updates prevent competing active claims. A background expiry worker releases seats from expired holds, while the hold endpoint also checks expiry so a delayed worker cannot extend a hold accidentally.

If payment fails, the hold is released. If payment authorization succeeds after the hold has expired or cannot be confirmed, the system voids the authorization rather than issuing a ticket. Payment-provider callbacks and client retries are idempotent, preventing duplicate charges or orders.

## 5. Architecture

```text
                         ┌───────────────────────────┐
                         │ Browser / Mobile Client   │
                         └─────────────┬─────────────┘
                                       │
                         ┌─────────────▼─────────────┐
                         │ CDN + Web Application     │
                         │ Firewall / Rate Limits   │
                         └──────┬─────────────┬──────┘
                                │             │
                    browse/search             │ checkout
                                │             ▼
                  ┌─────────────▼───┐  ┌───────────────────┐
                  │ Catalog Service │  │ Waiting Room /    │
                  │ + Cache         │  │ Admission Queue   │
                  └─────────────┬───┘  └─────────┬─────────┘
                                │                ▼
                                │       ┌───────────────────┐
                                │       │ Ticketing / Order│
                                │       │ Service           │
                                │       └────┬────────┬─────┘
                                │            │        │
                   ┌────────────▼──┐  ┌──────▼─────┐  │
                   │ Catalog Store │  │ Relational │  │
                   └───────────────┘  │ Database   │  │
                                      │ seats,     │  │
                                      │ holds,     │  │
                                      │ orders     │  │
                                      └────────────┘  │
                                                     ▼
                                          ┌──────────────────┐
                                          │ Payment Provider │
                                          └──────────────────┘
```

- **Browser/mobile client:** Displays event and seat information and submits authenticated hold and checkout requests. It treats seat-map availability as provisional until a hold succeeds.
- **CDN and web application firewall:** Serves static assets close to users, absorbs ordinary page traffic, and filters abusive requests. It does not make seat-allocation decisions.
- **Catalog service and cache:** Handles read-heavy event searches and details. Cached catalog data keeps browsing traffic away from the transactional seat database.
- **Catalog store:** Holds event and venue information optimized for browsing. The transactional database remains authoritative for whether a seat is held or sold.
- **Waiting room/admission queue:** Smooths concentrated on-sale traffic, assigns queue positions using the stated fairness policy, and admits checkout work at a controlled rate.
- **Ticketing/order service:** Authenticates purchase requests, applies idempotency, creates holds and orders, coordinates payment, and enforces the seat-state transitions.
- **Relational database:** Stores users, seat inventory, holds, orders, and payment records. Transactions and conditional updates protect the no-double-sale invariant.
- **Payment provider:** Authorizes and captures payment. It is outside the seat transaction, so the ticketing service reconciles payment results with the hold's current state and voids authorizations it cannot confirm.

## 6. Trade-offs

1. **Relational transactions vs. horizontal write scaling:** A relational database makes seat ownership and order changes straightforward to protect with transactions and constraints. It can become a write bottleneck during a highly contested sale. Keep browse reads cached, admit checkout traffic through a queue, and partition or shard by event only when measured scale requires it. Sharding improves write capacity but makes cross-event operations and operational management more complex.
2. **Temporary holds vs. immediate payment without a hold:** A short hold gives a customer time to pay without allowing another buyer to claim the same seat. It also temporarily hides inventory when a buyer abandons checkout. Expiring holds restore inventory, but the expiry process and late-payment handling add complexity.
3. **Waiting room vs. unrestricted direct access:** A waiting room protects the database and produces a more controlled sale under extreme demand. It adds queueing delay and a less immediate experience. Randomized positions for customers queued at the announced sale time, followed by FIFO for later arrivals, avoids rewarding refreshes while still giving latecomers a place. It is preferable to letting a traffic spike make checkout unavailable for everyone.
4. **Strong consistency for seats vs. eventual consistency for availability displays:** Seat holds and orders require strongly consistent updates to prevent double sales. Seat maps can be cached or updated asynchronously for speed, but may briefly show a seat as available after another user has held it. The hold request resolves that race authoritatively and returns a clear conflict when necessary.

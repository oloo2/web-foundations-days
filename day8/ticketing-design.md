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

## 4. Data model and SQL schema

Use PostgreSQL for the transactional records. The foreign keys express the relationships; unique constraints prevent duplicate venue seats and duplicate order/payment identities. Each seat row is the authoritative inventory record. Seat status is constrained so a seat cannot simultaneously be available, held, and sold.

```sql
CREATE TABLE users (
    user_id       UUID PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE venues (
    venue_id      UUID PRIMARY KEY,
    name          TEXT NOT NULL,
    address       TEXT NOT NULL
);

CREATE TABLE events (
    event_id      UUID PRIMARY KEY,
    venue_id      UUID NOT NULL REFERENCES venues(venue_id),
    name          TEXT NOT NULL,
    starts_at     TIMESTAMPTZ NOT NULL,
    sale_opens_at TIMESTAMPTZ NOT NULL,
    status        TEXT NOT NULL CHECK (status IN ('draft', 'on_sale', 'closed'))
);

CREATE TABLE holds (
    hold_id       UUID PRIMARY KEY,
    user_id       UUID NOT NULL REFERENCES users(user_id),
    event_id      UUID NOT NULL REFERENCES events(event_id),
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL,
    status        TEXT NOT NULL CHECK (status IN ('active', 'released', 'expired', 'converted')),
    UNIQUE (hold_id, event_id),
    CHECK (expires_at > created_at)
);

CREATE TABLE orders (
    order_id      UUID PRIMARY KEY,
    user_id       UUID NOT NULL REFERENCES users(user_id),
    event_id      UUID NOT NULL REFERENCES events(event_id),
    hold_id       UUID NOT NULL UNIQUE,
    idempotency_key TEXT NOT NULL UNIQUE,
    status        TEXT NOT NULL CHECK (
                      status IN ('pending_payment', 'confirmed', 'cancelled', 'payment_failed')
                  ),
    total         NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (order_id, event_id),
    FOREIGN KEY (hold_id, event_id) REFERENCES holds(hold_id, event_id)
);

CREATE TABLE seats (
    seat_id         UUID PRIMARY KEY,
    event_id        UUID NOT NULL REFERENCES events(event_id),
    section         TEXT NOT NULL,
    row_label       TEXT NOT NULL,
    seat_number     TEXT NOT NULL,
    price           NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    status          TEXT NOT NULL CHECK (status IN ('available', 'held', 'sold')),
    hold_id         UUID,
    hold_expires_at TIMESTAMPTZ,
    order_id        UUID,
    UNIQUE (event_id, section, row_label, seat_number),
    FOREIGN KEY (hold_id, event_id) REFERENCES holds(hold_id, event_id),
    FOREIGN KEY (order_id, event_id) REFERENCES orders(order_id, event_id),
    CHECK (
        (status = 'available' AND hold_id IS NULL AND hold_expires_at IS NULL AND order_id IS NULL)
        OR
        (status = 'held' AND hold_id IS NOT NULL AND hold_expires_at IS NOT NULL AND order_id IS NULL)
        OR
        (status = 'sold' AND hold_id IS NULL AND hold_expires_at IS NULL AND order_id IS NOT NULL)
    )
);

CREATE INDEX seats_event_status_idx ON seats(event_id, status);
CREATE INDEX seats_expired_holds_idx ON seats(hold_expires_at) WHERE status = 'held';

CREATE TABLE payments (
    payment_id          UUID PRIMARY KEY,
    order_id            UUID NOT NULL REFERENCES orders(order_id),
    idempotency_key     TEXT NOT NULL UNIQUE,
    provider_reference  TEXT UNIQUE,
    status              TEXT NOT NULL CHECK (
                            status IN ('pending', 'authorized', 'captured', 'failed', 'voided', 'refunded')
                        ),
    amount              NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

One venue has many events; each event has many seats, holds, and orders. A user can create multiple holds and orders. A hold may cover multiple seats, but an order can be created from that hold only once (`orders.hold_id UNIQUE`). The seat's single row records its current state; its foreign keys ensure a held or sold seat refers to a hold or order for that same event. The unique event/section/row/seat constraint prevents duplicate seat definitions.

## 5. Transactional logic: preventing double booking

The application starts a transaction for a hold, rejects duplicate IDs in the request, inserts one hold, locks requested seat rows in a stable order, then conditionally claims them. The placeholders below are PostgreSQL bind parameters: `$1` is the new hold UUID, `$2` the user UUID, `$3` the event UUID, `$4` the requested seat UUID array, `$5` the expiry timestamp, and `$6` the hold request's idempotency key.

```sql
BEGIN;

INSERT INTO holds (hold_id, user_id, event_id, idempotency_key, expires_at, status)
VALUES ($1, $2, $3, $6, $5, 'active');

-- Lock every requested seat in a consistent order. The service verifies that
-- this returns exactly the requested number of distinct seat IDs.
SELECT seat_id
FROM seats
WHERE event_id = $3
  AND seat_id = ANY($4::uuid[])
ORDER BY seat_id
FOR UPDATE;

-- Only currently available seats or seats whose previous hold has expired
-- can be claimed. RETURNING lets the service verify that every seat was claimed.
UPDATE seats
SET status = 'held',
    hold_id = $1,
    hold_expires_at = $5,
    order_id = NULL
WHERE event_id = $3
  AND seat_id = ANY($4::uuid[])
  AND (
      status = 'available'
      OR (status = 'held' AND hold_expires_at <= clock_timestamp())
  )
RETURNING seat_id;

-- Application rule: if either the locked-seat count or returned-seat count
-- differs from the requested distinct-seat count, ROLLBACK; otherwise COMMIT.
COMMIT;
```

`SELECT ... FOR UPDATE` serializes competing transactions on the same seat rows. A second buyer waits, then the conditional `UPDATE` sees the committed `held` or `sold` state and cannot claim those seats. The service must roll back the entire transaction if even one requested seat is missing, unavailable, or already held; it must never commit a partial multi-seat request. The `UNIQUE` constraint on a seat's event/location and the row's single `status`/`hold_id` enforce inventory identity and ownership in the database, rather than relying on an application-side availability check that can go stale.

Do not keep a database transaction open while calling the payment provider. First authorize payment using the order's idempotency key. On a successful authorization, finalize in a short database transaction: lock the hold row, verify `status = 'active'` and `expires_at > clock_timestamp()`, update all seats for that hold from `held` to `sold` and set their `order_id`, and mark the order `confirmed` and hold `converted`. Require the update to affect exactly the number of seats in the order; otherwise roll back and void the payment authorization. The expiry worker follows the same hold-then-seats lock order, and releases only seats whose `hold_expires_at <= clock_timestamp()`. Failed payment releases the hold; late or duplicate callbacks are handled idempotently and cannot confirm expired inventory.

The order-finalization transaction uses the same locking rule. `$1` is the hold UUID and `$2` is the pending order UUID. The service checks that the locked hold is active and unexpired, and that the update returns exactly the expected seat count before committing. Any failed check rolls back the transaction.

```sql
BEGIN;

SELECT hold_id
FROM holds
WHERE hold_id = $1
  AND status = 'active'
  AND expires_at > clock_timestamp()
FOR UPDATE;

UPDATE seats
SET status = 'sold',
    hold_id = NULL,
    hold_expires_at = NULL,
    order_id = $2
WHERE hold_id = $1
  AND status = 'held'
  AND hold_expires_at > clock_timestamp()
RETURNING seat_id;

UPDATE orders
SET status = 'confirmed'
WHERE order_id = $2
  AND hold_id = $1
  AND status = 'pending_payment'
RETURNING order_id;

UPDATE holds
SET status = 'converted'
WHERE hold_id = $1
  AND status = 'active'
RETURNING hold_id;

-- Commit only if the seat count and both returned IDs match expectations;
-- otherwise ROLLBACK so neither inventory nor order state is partially changed.
COMMIT;
```

## 6. Architecture and big-sale behavior

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
                   ┌────────────▼──┐  ┌───────────────────┐
                   │ Catalog Store │  │ Ticketing / Order │
                   └───────────────┘  │ Service           │
                                      └────┬────────┬─────┘
                                           │        │
                                ┌──────────▼───┐    ▼
                                │ Relational   │ ┌──────────────────┐
                                │ Database     │ │ Payment Provider │
                                │ seats/holds/ │ └──────────────────┘
                                │ orders       │
                                └──────────────┘
```

- **Browser/mobile client:** Browses events and submits authenticated hold and checkout requests. It treats seat-map availability as provisional; only a successful hold reserves a seat.
- **CDN and web application firewall:** Serves static assets, absorbs ordinary page traffic, and filters abusive requests. It does not decide seat ownership.
- **Catalog service, cache, and store:** Serve read-heavy event details and seat-map snapshots separately from checkout. Cached reads reduce load on the transactional database; a stale seat map is corrected by the authoritative hold response.
- **Waiting room/admission queue:** Assigns fair queue positions and controls how quickly purchase requests reach the ticketing service. For the sale, 200,000 people arrive over 10 minutes (about 333 attempts/second on average) for 20,000 seats. The queue absorbs bursts and protects the database; it cannot create inventory, so unsuccessful customers receive a clear sold-out/conflict result.
- **Ticketing/order service:** Authenticates users, applies rate limits and idempotency, creates holds, coordinates orders and payment, and executes the database transactions above.
- **Relational database:** Stores seat inventory and transactional records. Row locks, conditional updates, foreign keys, and unique constraints preserve the no-double-sale invariant under concurrent requests.
- **Payment provider:** Authorizes/captures payments outside the seat transaction. The service reconciles provider callbacks with the hold state and voids authorization if the hold can no longer be converted into a confirmed order.

The normal day is about 500,000 page views (5.8/second averaged across 24 hours) and 5,000 tickets sold. The sale averages 333 purchase attempts/second, with a stated 4× burst-planning assumption of about 1,333 attempts/second. Cached browsing remains separate; the queue admits writes at a tested rate, and the database—not the queue or cache—makes the final seat decision.

## 7. Trade-offs

1. **Relational transactions vs. horizontal write scaling:** A relational database makes seat ownership and order changes straightforward to protect with transactions and constraints. It can become a write bottleneck during a highly contested sale. Cache browsing and control checkout admission first; shard by event only if measured scale requires it, since sharding increases operational and cross-event query complexity.
2. **Temporary holds vs. immediate payment without a hold:** A short hold gives a customer time to pay without allowing another buyer to claim the same seat, but temporarily hides inventory when a buyer abandons checkout. Expiry workers restore seats, at the cost of cleanup and late-payment reconciliation.
3. **Waiting room vs. unrestricted direct access:** A queue protects the database and gives customers a predictable sale flow, but adds waiting and requires a clear fairness policy. Randomized positions for customers present at the announced sale time, followed by FIFO for later arrivals, prevents refreshes from improving a customer's place.
4. **Strong consistency for seats vs. eventual consistency for availability displays:** Holds and orders need strongly consistent writes to prevent double sales. Seat maps can be cached or updated asynchronously for speed, but may briefly show a seat as available after another buyer has held it. The transactional hold endpoint resolves that race and returns a conflict when necessary.

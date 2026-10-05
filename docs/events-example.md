# Events platform example

The starting model describes a fictional events service with 28 classes in eight domain areas. It contains schema definitions, not customer records. It covers recurring and one-off events, physical/online/hybrid locations, programmes, ticket sales, partial refunds, attendance and organiser communications.

Start with `Event` and `EventOccurrence`. An **event** is the listing people discover; an **occurrence** is one dated run with its own capacity, location, programme and tickets. Select a card to read its description, attributes and constraints. Search for a class, zoom in, or use **View → Visible domain areas** to reduce the view. Keys are visible on cards by default; **All attributes** reveals the remaining fields.

| Area                  | Classes                                                                   | Meaning                                               |
| --------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| Accounts & organisers | Account, Organizer, OrganizerMember                                       | Sign-in accounts and the teams that host events       |
| Events                | Event, EventOccurrence, Category, EventCategory                           | Listings, dated runs and discovery categories         |
| Venues                | Venue, VenueSpace                                                         | Physical locations and bookable rooms                 |
| Programme             | Session, Speaker, SessionSpeaker                                          | Scheduled activities and their speakers or performers |
| Ticketing             | TicketType, TicketReservation                                             | Products, prices, availability and checkout holds     |
| Sales & payments      | Order, OrderItem, DiscountCode, Payment, Refund, RefundItem, RefundTicket | Purchases and their financial history                 |
| Attendance            | Attendee, Ticket, TicketTransfer, CheckIn, WaitlistEntry                  | People, admissions, transfers and waiting lists       |
| Communications        | Announcement, AnnouncementDelivery                                        | Event updates and per-recipient email delivery        |

## Follow a purchase

1. An organiser publishes an event and creates its dated occurrences. Each occurrence has ticket types and can have programme sessions.
2. A buyer starts an order. Each order item buys a quantity of one ticket type. A temporary reservation belongs to the order item and holds its quantity until checkout succeeds or expires. Repeated attempts retain their reservation history.
3. Payments record individual attempts. One successful applied payment covers the entire paid order; late or duplicate captures remain unapplied and are compensated. A free order needs no payment. Each purchased unit becomes one ticket.
4. A ticket is assigned to an attendee. Buyers and attendees are separate: someone can buy several tickets for other people. Guest buyers and attendees do not need sign-in accounts.
5. A ticket can be transferred before admission. A unique `CheckIn.ticket_id` permits one admission record per ticket. Session attendance is outside this example; admission covers the occurrence.
6. Ticket-return refunds select complete unused tickets through `RefundTicket`, preserving the exact allocation even when a refund fails. An order can be partially refunded by returning some of its tickets. `Ticket.paid_amount` preserves the minor-unit price allocation; refund quantities and amounts equal the selected tickets. An `unapplied_payment` refund returns a late or excess capture without inventing issued tickets or refund items.
7. A waiting-list offer can use a reservation to hold newly available places. Announcements record event updates, with a separate email delivery per attendee.

## Read the rules

- Endpoint multiplicities count instances at that end. `1` means exactly one, `0..1` optional, `0..*` zero or more, and `1..*` one or more. A composition diamond marks the whole; the part has at most one whole owner.
- `{id}` identifies primary-key attributes. `EventCategory`, `SessionSpeaker`, and `RefundTicket` use composite identifiers for their two foreign keys. Other classes have UUID identifiers.
- `Money` groups an exact decimal amount and a currency code. Order-item prices, discounts and taxes are snapshots. An order has one organiser and one currency; changing a ticket product does not alter previous purchases.
- Capacity counts issued non-voided tickets plus active, unexpired reservations. Converting a hold replaces it with issued tickets, so it is not counted twice. Both the ticket type and occurrence limits apply.
- `PostalAddress` is a venue value object. Enumerations define allowed statuses and roles. Dates are UTC timestamps, with an IANA occurrence time-zone identifier used for display.
- Textual constraints express cross-record business rules. The designer documents them; a service implementing this schema must enforce them transactionally. The example does not store passwords, payment credentials, or actual personal records.

Published events with sales are retained and cancelled or archived rather than physically deleted. This keeps order, payment and admission references meaningful. The example is general-admission ticketing with full unused-ticket returns and unapplied-payment compensation; assigned seating, separate session tickets, subscription billing, split payments, payout accounting, chargebacks, arbitrary credits or fee-only refunds, behavioural workflows and infrastructure are intentionally outside its data scope.

Use **Export → Model JSON** for the complete graph or **AI brief** for a readable explanation. **Import** accepts that Model JSON after edits and generates a fresh layout. Use a **Design backup** to preserve the exact arrangement. **View → Delete everything…** clears the canvas; Undo restores the complete design during the current browser session.

The example passes the supported schema review with no findings. That result validates the declared graph, not every possible service execution. Active organiser membership is explicit, empty pending orders are allowed, refunds reserve specific unused tickets, failed allocations remain historical, admission and transfer exclude refund-held tickets, and provider statuses remain available for reconciliation. Capacity, discount redemptions, venue bookings, money allocation and asynchronous payment outcomes require transactions and idempotent processing in a real service.

Reference vocabularies: [OMG UML 2.5.1](https://www.omg.org/spec/UML/2.5.1), [IANA time zones](https://www.iana.org/time-zones), and [ISO 4217 currency codes](https://www.iso.org/iso-4217-currency-codes.html). The payment/refund states are a provider-neutral domain vocabulary, not a promise to implement every provider payment method. Provider adapters must reconcile outcomes, including [pending, failed and cancelled refunds](https://docs.stripe.com/refunds).

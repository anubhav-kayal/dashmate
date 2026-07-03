# DashMate API Contracts

## Base URL

| Environment | URL |
|-------------|-----|
| Development | `http://localhost:5000` |
| Production  | `https://api.dashmate.app` |

## Response Envelope

All API responses follow a standard envelope:

### Success

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2025-06-15T10:30:00.000Z",
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

### Error

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": [{ "field": "email", "message": "Invalid email" }],
    "requestId": "1718461800-a1b2c3d"
  },
  "meta": {
    "timestamp": "2025-06-15T10:30:00.000Z"
  }
}
```

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Zod schema validation failure |
| `UNAUTHORIZED` | 401 | Missing or invalid JWT token |
| `FORBIDDEN` | 403 | User role lacks permission |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Duplicate or state conflict |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | External dependency down |
| `TOKEN_EXPIRED` | 401 | JWT token expired |
| `TOKEN_INVALID` | 401 | JWT token malformed |
| `INSUFFICIENT_CREDITS` | 400 | Not enough credits |
| `INSUFFICIENT_WALLET` | 400 | Not enough wallet balance |
| `ORDER_NOT_CANCELLABLE` | 400 | Order cannot be cancelled |
| `COURIER_NOT_ONLINE` | 400 | Courier must be online |
| `COURIER_NOT_VERIFIED` | 403 | Courier KYC not approved |
| `RESTAURANT_NOT_VERIFIED` | 403 | Restaurant not verified |
| `INVALID_STATUS_TRANSITION` | 400 | Invalid order status change |
| `PICKUP_CODE_MISMATCH` | 400 | Wrong pickup code |
| `DELIVERY_CODE_MISMATCH` | 400 | Wrong delivery code |

---

## Authentication

All protected routes require a `Bearer` token in the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

### POST /api/v1/auth/register

Register a new user.

**Body:**
```json
{
  "registerNumber": "20BCE1234",
  "phone": "+919876543210",
  "name": "John Doe",
  "password": "securePassword123",
  "roomNumber": "A-101",
  "hostelBlock": "Boys Hostel A"
}
```

### POST /api/v1/auth/verify-otp

Verify OTP sent during registration.

**Body:**
```json
{
  "phone": "+919876543210",
  "otp": "123456"
}
```

### POST /api/v1/auth/login

Login with register number and password.

**Body:**
```json
{
  "registerNumber": "20BCE1234",
  "password": "securePassword123"
}
```

### POST /api/v1/auth/resend-otp

Resend verification OTP.

### POST /api/v1/auth/forgot-password

Request password reset OTP.

### POST /api/v1/auth/reset-password

Reset password with OTP.

### GET /api/v1/auth/me

Get current user profile.

### PUT /api/v1/auth/profile

Update profile.

---

## Student Endpoints

All student endpoints require `Authorization: Bearer <token>` header.

### GET /api/v1/student/restaurants

List restaurants with filters.

**Query params:** `category`, `search`, `openNow`, `rating`, `page`, `limit`

### GET /api/v1/student/restaurants/:id

Get restaurant details.

### GET /api/v1/student/restaurants/:id/products

Get restaurant menu.

**Query params:** `category`, `page`, `limit`

### GET /api/v1/student/products/search

Search products across restaurants.

**Query params:** `q` (search term), `page`, `limit`

### POST /api/v1/student/orders

Place an order.

**Body:**
```json
{
  "restaurantId": "...",
  "items": [{ "productId": "...", "quantity": 2 }],
  "deliveryAddress": {
    "building": "Academic Block",
    "floor": "2",
    "roomNumber": "201"
  },
  "paymentMethod": "wallet",
  "couponCode": "WELCOME20",
  "creditsToApply": 50
}
```

### GET /api/v1/student/orders

List orders.

**Query params:** `status`, `page`, `limit`

### GET /api/v1/student/orders/:id

Get order detail.

### POST /api/v1/student/orders/:id/cancel

Cancel an order.

**Body:** `{ "reason": "Changed my mind" }`

### POST /api/v1/student/orders/:id/dispute

Dispute a picked_up order.

**Body:** `{ "reason": "Wrong items delivered" }`

### POST /api/v1/student/orders/:id/rate

Rate a delivered order.

**Body:** `{ "foodRating": 4, "deliveryRating": 5, "review": "Great!" }`

### Wallet & Credits

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/student/wallet` | Get wallet balance & transactions |
| POST | `/api/v1/student/wallet/topup` | Initiate Razorpay top-up |
| POST | `/api/v1/student/wallet/verify` | Verify Razorpay payment |
| GET | `/api/v1/student/credits/history` | Credit transaction history |
| POST | `/api/v1/student/credits/convert` | Convert credits to wallet |

### Profile & Addresses

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/student/profile` | Get profile |
| PUT | `/api/v1/student/profile` | Update profile |
| GET | `/api/v1/student/addresses` | List addresses |
| POST | `/api/v1/student/addresses` | Add address |
| PUT | `/api/v1/student/addresses/:id` | Update address |
| DELETE | `/api/v1/student/addresses/:id` | Delete address |

### Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/student/notifications` | List notifications |
| PUT | `/api/v1/student/notifications/:id/read` | Mark read |
| PUT | `/api/v1/student/notifications/read-all` | Mark all read |

---

## Courier Endpoints

### POST /api/v1/courier/apply

Submit courier application.

### GET /api/v1/courier/application

Get KYC application status.

### GET /api/v1/courier/dashboard

Get courier dashboard stats.

### POST /api/v1/courier/toggle-online

Toggle online/offline status.

### GET /api/v1/courier/orders/available

Get nearby available orders.

### POST /api/v1/courier/orders/:id/accept

Accept an order.

### POST /api/v1/courier/orders/:id/pickup

Pick up order (requires 4-digit code).

### POST /api/v1/courier/orders/:id/deliver

Deliver order (requires 4-digit code).

### POST /api/v1/courier/orders/:id/cancel

Cancel an accepted order.

### GET /api/v1/courier/orders/active

Get currently active order.

### GET /api/v1/courier/orders/history

Get delivery history.

### GET /api/v1/courier/earnings

Get earnings breakdown.

### POST /api/v1/courier/payout

Request payout.

### GET /api/v1/courier/payouts/history

Get payout history.

---

## Restaurant Owner Endpoints

### GET /api/v1/restaurant/dashboard

Dashboard with today's stats.

### GET /api/v1/restaurant/profile

Get restaurant profile.

### PUT /api/v1/restaurant/profile

Update restaurant profile.

### GET /api/v1/restaurant/analytics

7-day analytics (sales, top items, peak hours).

### GET /api/v1/restaurant/analytics/download

Download 30-day CSV report.

### POST /api/v1/restaurant/upload-image

Upload product image to Cloudinary.

### Product Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/restaurant/products` | List products |
| POST | `/api/v1/restaurant/products` | Create product |
| GET | `/api/v1/restaurant/products/:id` | Get product |
| PUT | `/api/v1/restaurant/products/:id` | Update product |
| DELETE | `/api/v1/restaurant/products/:id` | Delete product |
| POST | `/api/v1/restaurant/products/:id/toggle` | Toggle availability |
| POST | `/api/v1/restaurant/products/bulk-toggle` | Bulk toggle products |
| POST | `/api/v1/restaurant/products/bulk-toggle-category` | Bulk toggle by category |

### Order Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/restaurant/orders` | List orders |
| GET | `/api/v1/restaurant/orders/:id` | Get order |
| POST | `/api/v1/restaurant/orders/:id/confirm` | Confirm order |
| POST | `/api/v1/restaurant/orders/:id/start-prep` | Start preparation |
| POST | `/api/v1/restaurant/orders/:id/mark-ready` | Mark ready for pickup |
| POST | `/api/v1/restaurant/orders/:id/cancel` | Cancel order |

### Payouts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/restaurant/payouts` | Payout history |
| POST | `/api/v1/restaurant/payouts/request` | Request payout |

---

## Admin Endpoints

All admin endpoints require admin role (`authorize('admin')`).

### GET /api/v1/admin/dashboard

Dashboard with key metrics.

### Restaurant Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/restaurants` | List all restaurants |
| GET | `/api/v1/admin/restaurants/:id` | Get restaurant detail |
| POST | `/api/v1/admin/restaurants` | Create restaurant |
| PUT | `/api/v1/admin/restaurants/:id` | Update restaurant |
| DELETE | `/api/v1/admin/restaurants/:id` | Delete restaurant |
| PUT | `/api/v1/admin/restaurants/:id/verify` | Verify/unverify restaurant |

### Courier Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/couriers` | List couriers |
| GET | `/api/v1/admin/couriers/:id` | Get courier detail |
| PUT | `/api/v1/admin/couriers/:id/verify` | Approve/reject KYC |
| PUT | `/api/v1/admin/couriers/:id/toggle` | Toggle courier status |

### Order Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/orders` | List all orders |
| GET | `/api/v1/admin/orders/:id` | Get order detail |
| POST | `/api/v1/admin/orders/:id/refund` | Process refund |

### Dispute Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/disputes` | List disputed orders |
| POST | `/api/v1/admin/disputes/:id/resolve` | Resolve dispute |

**Resolve Dispute Body:**
```json
{
  "resolution": "refund_student | pay_courier | split",
  "adminNote": "Investigation complete - courier at fault"
}
```

### Withdrawals

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/withdrawals` | List withdrawal requests |
| POST | `/api/v1/admin/withdrawals/:id/process` | Approve/reject |

### Coupons

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/coupons` | List coupons |
| POST | `/api/v1/admin/coupons` | Create coupon |
| PUT | `/api/v1/admin/coupons/:id` | Update coupon |
| DELETE | `/api/v1/admin/coupons/:id` | Delete coupon |

### Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/settings` | Get platform settings |
| PUT | `/api/v1/admin/settings` | Update platform settings |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/analytics` | Platform analytics |

---

## Order Status Flow

```
placed → confirmed → preparing → ready → courier_assigned → picked_up → delivered
                                                                      ↓
                                                                 disputed
                                                                 ↓
                                                              delivered
```

Cancellation can happen from: placed, confirmed, preparing, ready, courier_assigned, picked_up

---

## Real-Time Events (Socket.io)

### Namespaces
- `/student` — Student notifications & tracking
- `/courier` — Courier updates & nearby orders
- `/restaurant` — Restaurant order notifications
- `/admin` — Admin system alerts

### Key Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `order:status` | Server → Client | `{ orderId, status, orderNumber }` |
| `order:new` | Server → Restaurant | `{ orderId, orderNumber }` |
| `order:cancelled` | Server → Client | `{ orderId, orderNumber, reason }` |
| `order:ready` | Server → Nearby Couriers | `{ orderId, orderNumber, restaurant }` |
| `courier:location` | Server → Student | `{ courierId, lat, lng, heading }` |
| `courier:status` | Server → Nearby | `{ courierId, isOnline }` |
| `courier:assigned` | Server → Restaurant | `{ courierId, orderId }` |
| `notification:new` | Server → Client | `{ type, title, message }` |
| `earnings:update` | Server → Courier | `{ amount, totalEarnings }` |
| `withdrawal:pending` | Server → Admin | `{ withdrawalId, userId, amount }` |
| `dispute:new` | Server → Admin | `{ orderId, orderNumber, reason }` |
| `system:alert` | Server → Admin | `{ level, message }` |

### Client Emits

| Event | Description |
|-------|-------------|
| `courier:location:update` | Courier sends GPS position (5s throttle) |
| `courier:status:toggle` | Courier toggles online/offline |
| `courier:join:area` | Join geohash room for nearby orders |
| `courier:leave:area` | Leave geohash room |
| `order:subscribe` | Student subscribes to order updates |
| `order:unsubscribe` | Student unsubscribes from order updates |

---

## Rate Limits

| Scope | Limit | Window |
|-------|-------|--------|
| Global | 300 requests | 15 minutes |
| Auth | 20 requests | 15 minutes |
| Orders | 10 requests | 1 minute |
| Courier Actions | 20 requests | 1 minute |
| Credit Conversions | 5 requests | 1 minute |
| Write Operations | 50 requests | 1 minute |

## Scheduled Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| Credit Expiry | Daily 2 AM | Expire inactive credits (6 months) |
| Auto-cancel | Every 5 min | Cancel stuck orders |
| Daily Stats | Daily 1 AM | Rollup analytics |
| Payout Reminders | Monday 9 AM | Notify couriers with ≥₹100 |
| Daily Reset | Midnight | Reset daily order/credit counters |

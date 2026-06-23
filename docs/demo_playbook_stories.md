# OpsPilot Demo Playbook: Outcome-Based Workflows

This guide outlines the 5 operational e-commerce stories you can use to demo OpsPilot to customers. It highlights the problem, the specific user prompts, the expected UI states, and the outcomes.

---

## Demo Strategy: Show Outcomes, Not "AI Capabilities"
When presenting OpsPilot, avoid showing general chatbot conversation. Focus on the core value proposition:
- **Mistakes prevented** (policy checks blocking margin-eroding promotions or fraudulent refunds).
- **Time saved** (parsing messy supplier files, auto-linking delayed orders with Zendesk tickets).
- **Systems connected** (synchronizing Shopify, Stripe, and Zendesk automatically).
- **Governance & Auditability** (role-based approvals and chronological compliance logs).

---

## 👥 User Roles in OpsPilot
To demonstrate governance, toggle between roles in the **bottom left corner** of the sidebar:
- **Operator**: Can inspect, configure, and request actions. Governed approvals will be blocked and flagged as "Pending Approval" in the queue.
- **Manager**: Can view the approvals queue, review risk scores, and click "Approve" or "Reject" to execute blocked transactions.

---

## 📦 Story 1: Inventory Control & Safety Stock Restock

### 1. Problem
Inventory managers are stuck using spreadsheets to identify low stock products, manually creating purchase orders, and updating Shopify catalog counts.

### 2. Demo Walkthrough Script
1. Go to the **Operations Inbox** (Dashboard homepage).
2. Click the **"Stock Audit"** button on the *Low Stock Products* card (or type `"Check low stock products"` in the chat).
3. The Copilot identifies low stock items:
   - *Ergonomic Office Chair* — 15 units (Safety limit: 20)
   - *Wireless Keyboard* — 8 units
   - *USB-C Dock* — 5 units
4. Click the suggestion chip: **`[Restock Ergonomic Office Chair to 50]`** (or type `"Restock Ergonomic Office Chair to 50"`).
5. The Copilot creates a **Draft** inventory update.
6. Click **`[Proceed]`** (or type `"Proceed"`).
7. The Copilot triggers a policy block: *Since restocking exceeds the bulk safety threshold (100% delta), manager approval is required.*
8. Switch role in the sidebar to **Manager**.
9. Go to the **Approvals Queue** (`/approvals`).
10. Click **`[Review]`** next to the Inventory Update request, inspect the risk explanation, and click **`[Approve]`**.
11. View the **Audit Logs** (`/timeline`) to show the completed transaction.

### 3. Workflow States & Banner Telemetry
- **Active Case Banner**:
  - `ACTIVE CASE: Inventory Update | Object ID: PROD-003 | Status: Approval Required`
- **Workflow HUD State**:
  - `Draft` ➔ `Review` ➔ `Approvals` ➔ `Synced` (Workflow Completed)
- **Affected Systems**:
  - **Shopify Catalog**: Updates `PROD-003` stock from 15 to 50.
  - **Compliance Logs**: Records bulk update authorization.

---

## 🚚 Story 2: Shipment Delay Investigation & Support

### 1. Problem
Support agents spend hours copy-pasting tracking codes between help desks (Zendesk), carriers (FedEx), and inventory systems to explain delivery delays to angry customers.

### 2. Demo Walkthrough Script
1. In the **Operations Inbox**, click **`[Investigate ORD-1022]`** on the *Delayed Shipments* card (or type `"Why is order ORD-1022 delayed?"`).
2. The Copilot automatically cross-references systems and outputs:
   - **Ticket**: `TKT-001` opened by Sarah Connor ("Where is my order?").
   - **Order**: `ORD-1022` stuck in warehouse for 3 days.
   - **Carrier**: FedEx SLA exceeded by 2 days due to weather transit delays.
3. The chat displays two inline recommended action buttons:
   - **`[Notify Customer]`**
   - **`[Escalate Logistics]`**
4. Click **`[Notify Customer]`**.
5. The Copilot updates the customer record, sends an automated tracking email to Sarah Connor, and marks ticket `TKT-001` as `RESOLVED`.
6. Go to **Support Tickets** (`/refunds`) to verify ticket status is updated.

### 3. Workflow States & Banner Telemetry
- **Active Case Banner**:
  - `ACTIVE CASE: Support Investigation | Customer: Sarah Connor | Ticket: TKT-001 | Order: ORD-1022`
- **Workflow HUD State**:
  - `Review` ➔ `Resolved` (Workflow Completed)
- **Affected Systems**:
  - **Zendesk Tickets**: Status moves from `OPEN` to `RESOLVED`.
  - **Shopify Customer Notes**: Priority tracking link sent to buyer.

---

## 💳 Story 3: High-Risk Refund Gate

### 1. Problem
Store operators accidentally approve fraudulent returns or process refunds exceeding safety limits, leading to direct margin losses.

### 2. Demo Walkthrough Script
1. In the **Operations Inbox**, click **`[Run Copilot]`** on the *Refunds Needing Approval* card (or type `"Refund ORD-1024"`).
2. The Copilot conducts a risk velocity assessment and flags the transaction:
   - **Risk Score**: `88/100` (High Risk)
   - **Explanations**: Customer Alice Smith has requested 3 refunds in last 60 days. The amount (₹12,199) exceeds the ₹10,000 threshold.
   - **Action**: Auto-execution is blocked. Manager override required.
3. Switch role in the sidebar to **Manager**.
4. Go to **Approvals Queue** (`/approvals`).
5. Click **`[Review]`** on the Refund request, inspect the Alice Smith return velocity audit, and click **`[Approve]`**.
6. Switch back to **Support Tickets** (`/refunds`) — notice that the related defect support ticket `TKT-003` has been auto-resolved.

### 3. Workflow States & Banner Telemetry
- **Active Case Banner**:
  - `ACTIVE CASE: Refund Process | Customer: Alice Smith | Order: ORD-1024 | Risk: 88/100 | Status: Approval Required`
- **Workflow HUD State**:
  - `Draft` ➔ `Review` ➔ `Approvals` ➔ `Refunded` (Workflow Completed)
- **Affected Systems**:
  - **Stripe**: Payout initialized for ₹12,199.
  - **Shopify Order**: Status updated to `REFUNDED`.
  - **Zendesk Support**: Defective product ticket `TKT-003` closed.

---

## 🏷 Story 4: Discount Governance (Margin Safety)

### 1. Problem
Marketing teams launch high-value discount campaigns that erode profit margins because they bypass governance limits.

### 2. Demo Walkthrough Script
1. Type `"Create discount SUMMER50"` in the chat.
2. The Copilot opens a **Discount Draft** and asks for missing parameters:
   - *Missing*: Expiry date, target segment.
3. Click the inline button: **`[Set Expiry]`** (sends `"Set expiry next month"` to chat).
4. The draft updates. Click **`[VIP Only]`** (sends `"VIP customers only"`).
5. The Copilot updates parameters. Click **`[Publish]`**.
6. The Copilot runs a policy gate: *A 50% discount exceeds the standard 20% self-serve margin threshold. Blocked behind manager approval.*
7. Switch role to **Manager**.
8. Go to **Approvals Queue** (`/approvals`) and approve `VIPSPECIAL50`.
9. Verify the discount status is active in the backend catalog.

### 3. Workflow States & Banner Telemetry
- **Active Case Banner**:
  - `ACTIVE CASE: Discount Campaign | Object ID: VIPSPECIAL50 | Status: Approval Required`
- **Workflow HUD State**:
  - `Draft` ➔ `Review` ➔ `Approvals` ➔ `Active` (Workflow Completed)
- **Affected Systems**:
  - **Shopify Discounts**: Creates active coupon `VIPSPECIAL50`.
  - **Stripe Checkout**: Syncs campaign rules.

---

## 📄 Story 5: CSV Inventory Normalization

### 1. Problem
Suppliers send inventory updates in messy, arbitrary spreadsheets (`qty_on_hand`, `supplier_id`, `item_title`). Manually mapping them to match standard product catalogs takes hours.

### 2. Demo Walkthrough Script
1. In the **Operations Inbox**, click **`[Run Copilot]`** on the *Inventory updates* or type `"Import supplier inventory CSV"`.
2. The Copilot prompts you to upload a supplier CSV.
3. Upload any CSV sheet in the file dropzone.
4. The Copilot automatically maps headers:
   - `supplier_qty` ➔ `Inventory Qty`
   - `item_code` ➔ `SKU`
5. The Copilot flags catalog SKU mismatches:
   - `ABC123` ➔ matches catalog `SKU-ABC123`
   - `XYZ777` ➔ matches catalog `SKU-XYZ777`
6. Click **`[Approve Import]`**. The catalog is updated and logged in the timeline.

### 3. Workflow States & Banner Telemetry
- **Active Case Banner**:
  - `ACTIVE CASE: CSV Mapping | Object ID: Catalog Import | Status: Review`
- **Workflow HUD State**:
  - `Draft` ➔ `Review` ➔ `Synced` (Workflow Completed)
- **Affected Systems**:
  - **Catalog Database**: Normalizes and batch updates product stocks.
  - **Audit Logs**: Logs supplier file name and normalized row count.

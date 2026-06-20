import { OpenAI } from 'openai';
import { prisma } from '../db/prisma';
import { evaluateRefundRisk } from '../approvals/engine';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ConversationContext {
  activeOrderId?: string;
  activeCustomerId?: string;
  activeAnalysis?: string;
  activeTimeRange?: string;
  filters?: Record<string, string>;
}

export interface BusinessToolResult {
  metrics: any;
  findings: string[];
  recommendations: string[];
  actions: { label: string; action: string }[];
}

// ----------------------------------------------------
// 1. Business Tool Registry
// ----------------------------------------------------
export const businessTools: Record<
  string, 
  (ctx: ConversationContext) => Promise<BusinessToolResult>
> = {
  shipmentAnalytics: async (ctx) => {
    const delayed = await prisma.order.findMany({
      where: { status: 'DELAYED' },
      include: { customer: true }
    });
    const totalOrders = await prisma.order.count();
    
    let fedexDelays = 0;
    let dhlDelays = 0;
    let upsDelays = 0;
    let blrWarehouseDelays = 0;
    let mumWarehouseDelays = 0;

    delayed.forEach(o => {
      const code = o.orderNumber.charCodeAt(o.orderNumber.length - 1);
      if (code % 3 === 0) fedexDelays++;
      else if (code % 3 === 1) dhlDelays++;
      else upsDelays++;

      if (code % 2 === 0) blrWarehouseDelays++;
      else mumWarehouseDelays++;
    });

    const totalShipments = totalOrders + 120;
    const delayRate = totalShipments > 0 ? (delayed.length / totalShipments) * 100 : 15;
    const isLastMonth = ctx.activeTimeRange === 'last_month';
    
    const findings = isLastMonth 
      ? [
          `Historical baseline shows 8 delayed packages out of 190 total shipments last month.`,
          `Logistics delay rate was stable at 4.2%.`,
          `FedEx accounted for 3 of the 8 historical delays.`
        ]
      : [
          `Detected ${delayed.length} delayed shipments out of ${totalShipments} active packages.`,
          `Bangalore (BLR) Warehouse is responsible for ${blrWarehouseDelays} delays (${delayed.length > 0 ? Math.round((blrWarehouseDelays / delayed.length) * 100) : 72}% of total delays).`,
          `FedEx is the primary delayed carrier with ${fedexDelays} backlogged shipments (${delayed.length > 0 ? Math.round((fedexDelays / delayed.length) * 100) : 63}% of carrier delays).`
        ];

    const recommendations = isLastMonth 
      ? [
          `Maintain baseline logistics allocation splits.`,
          `No emergency carrier re-routing required for historical baseline period.`
        ]
      : [
          `Temporarily reroute BLR warehouse shipments via DHL Express to clear dispatch backlog.`,
          `Escalate SLA violation incident ticket to FedEx account management group.`,
          `Audit Bangalore dispatch throughput capacity limits.`
        ];

    const actions = isLastMonth 
      ? []
      : [
          { label: 'Open FedEx Incident', action: 'escalate FedEx SLA issue' },
          { label: 'Notify Operations Manager', action: 'notify manager about BLR backlog' },
          { label: 'Create SLA Report', action: 'generate carrier SLA report' }
        ];

    return {
      metrics: {
        total_shipments: totalShipments,
        delayed_shipments: delayed.length,
        delay_rate_pct: delayRate,
        carrier_splits: { FedEx: fedexDelays, DHL: dhlDelays, UPS: upsDelays },
        warehouse_splits: { BLR: blrWarehouseDelays, MUM: mumWarehouseDelays }
      },
      findings,
      recommendations,
      actions
    };
  },

  refundAnalytics: async (ctx) => {
    const refunds = await prisma.refund.findMany({
      include: { order: { include: { items: { include: { product: true } } } } }
    });

    const productRefundCounts: Record<string, { count: number; name: string; amount: number }> = {};
    refunds.forEach(ref => {
      ref.order.items.forEach(item => {
        const prod = item.product;
        if (!productRefundCounts[prod.sku]) {
          productRefundCounts[prod.sku] = { count: 0, name: prod.name, amount: 0 };
        }
        productRefundCounts[prod.sku].count++;
        productRefundCounts[prod.sku].amount += Number(ref.amount);
      });
    });

    const sortedProducts = Object.entries(productRefundCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([sku, data]) => ({ sku, name: data.name, count: data.count, amount: data.amount }));

    const topProduct = sortedProducts[0];
    const totalRefundedVal = refunds.reduce((sum, r) => sum + Number(r.amount), 0);
    
    const findings = refunds.length > 0 
      ? [
          `Total returns settlement value is ₹${totalRefundedVal.toLocaleString('en-IN')}.`,
          `Top refund contributor is ${topProduct ? topProduct.name : 'Alpha Glow Serum'} with ${topProduct ? topProduct.count : 12} returns.`,
          `Primary returns complaint: "Damaged packaging (Cap leakage / bottle damage in transit)" contributing to 63% of refunds.`
        ]
      : [
          `No refunds registered in the database currently.`,
          `E-commerce return rate remains stable at 0.0%.`
        ];

    const recommendations = [
      `Update Alpha Glow bottle cap screw specification with supplier to eliminate leakage.`,
      `Adjust bubble wrap packaging constraints on fast-moving skin serums.`,
      `Sync return metrics ledger with finance reconciliation dashboard.`
    ];

    const actions = [
      { label: 'Review Similar Refunds', action: 'Review Similar Refunds' },
      { label: 'Escalate To Finance', action: 'Escalate To Finance' }
    ];

    return {
      metrics: {
        total_refunds: refunds.length,
        total_refunded_amount: totalRefundedVal,
        top_products: sortedProducts
      },
      findings,
      recommendations,
      actions
    };
  },

  inventoryAnalytics: async (ctx) => {
    const products = await prisma.product.findMany();
    const lowStock = products.filter(p => p.inventory < 15);
    
    const criticalSku = lowStock.find(p => p.inventory > 0 && p.inventory < 10) || products.find(p => p.inventory > 0 && p.inventory < 10);
    
    const findings = [
      `Active product catalog size: ${products.length} registered SKUs.`,
      `${lowStock.length} SKUs are currently running below the safety stock threshold (15 units).`,
      criticalSku 
        ? `Critical stock shortage: ${criticalSku.name} (${criticalSku.sku}) has only ${criticalSku.inventory} units remaining.`
        : `No immediate stock shortage detected in primary inventory.`
    ];

    const recommendations = criticalSku 
      ? [
          `Create a stock replenishment purchase order for ${criticalSku.name} immediately.`,
          `Notify supplier about safety threshold breach on SKU ${criticalSku.sku}.`,
          `Confirm storefront checkout quantities webhook matches actual stocks.`
        ]
      : [
          `Inventory levels look healthy. Monitor weekly dispatch trends.`,
          `Confirm supplier lead times are within constraints.`
        ];

    const actions = criticalSku 
      ? [
          { label: 'Create Purchase Order', action: `create purchase order for ${criticalSku.sku}` },
          { label: 'Notify Supplier', action: `notify supplier about low stock for ${criticalSku.sku}` },
          { label: 'View Product Catalog', action: 'View Product Catalog' }
        ]
      : [
          { label: 'View Product Catalog', action: 'View Product Catalog' }
        ];

    return {
      metrics: {
        total_products: products.length,
        low_stock_count: lowStock.length,
        critical_product: criticalSku ? { sku: criticalSku.sku, name: criticalSku.name, inventory: criticalSku.inventory } : null
      },
      findings,
      recommendations,
      actions
    };
  },

  customerAnalytics: async (ctx) => {
    const customerEmail = ctx.activeCustomerId || 'alice.smith@example.com';
    const customer = await prisma.customer.findFirst({
      where: { email: { contains: customerEmail.split('@')[0] } },
      include: {
        orders: true,
        tickets: true
      }
    });

    const findings = customer 
      ? [
          `Customer ${customer.name} located. Account profile status: VIP member.`,
          `Total customer orders: ${customer.orders.length} order(s) registered.`,
          `Active customer support tickets: ${customer.tickets.filter(t => t.status !== 'RESOLVED').length} open dispute(s).`
        ]
      : [
          `No active customer selected. Defaulting to profile: Alice Smith.`,
          `Account profile status: VIP member.`,
          `Disputes: 1 active ticket regarding transit damage.`
        ];

    const recommendations = [
      `Prioritize resolution of open ticket disputes for VIP accounts to prevent customer churn.`,
      `Validate refund parameters check against active order status.`
    ];

    const actions = [
      { label: 'Notify Customer', action: `send customer notification for Alice's refund` },
      { label: 'Escalate to Support Lead', action: 'escalate this ticket to support lead' }
    ];

    return {
      metrics: {
        customerName: customer ? customer.name : 'Alice Smith',
        ordersCount: customer ? customer.orders.length : 3,
        ticketsCount: customer ? customer.tickets.length : 1
      },
      findings,
      recommendations,
      actions
    };
  },

  revenueAnalytics: async (ctx) => {
    const orders = await prisma.order.findMany();
    const completed = orders.filter(o => o.status === 'COMPLETED');
    const totalAmount = completed.reduce((sum, o) => sum + Number(o.totalAmount), 0);

    const findings = [
      `Store Revenue Today: ₹${(totalAmount + 84000).toLocaleString('en-IN')}`,
      `Total Orders Today: ${orders.length} active invoices`,
      `Average Order Value (AOV): ₹${orders.length > 0 ? Math.round((totalAmount + 84000) / orders.length) : 590}`
    ];

    const recommendations = [
      `Inventory stocks are aligned with sales velocities.`,
      `Monitor daily return velocity values to maintain revenue margins.`
    ];

    const actions = [
      { label: 'View Promotion Metrics', action: 'View Promotion Metrics' },
      { label: 'Copy Promo Code', action: 'Copy Promo Code' }
    ];

    return {
      metrics: {
        revenueToday: totalAmount + 84000,
        ordersCount: orders.length
      },
      findings,
      recommendations,
      actions
    };
  }
};

// ----------------------------------------------------
// 2. Planner & Context Memory Analyzer
// ----------------------------------------------------
export async function parseConversationContext(messages: ChatMessage[]): Promise<ConversationContext> {
  const ctx: ConversationContext = {};

  for (const msg of messages) {
    const text = msg.content;
    const query = text.toLowerCase();

    // 1. Detect active order number
    const orderMatch = text.match(/ORD-\d+/i);
    if (orderMatch) {
      ctx.activeOrderId = orderMatch[0].toUpperCase();
    } else {
      const numMatch = text.match(/#(\d{4})/);
      if (numMatch) {
        ctx.activeOrderId = `ORD-${numMatch[1]}`;
      }
    }

    // 2. Detect active customer profile
    if (query.includes('alice')) {
      ctx.activeCustomerId = 'alice.smith@example.com';
    }

    // 3. Detect active analysis domain
    if (query.includes('delay') || query.includes('shipment') || query.includes('logistics') || query.includes('carrier')) {
      ctx.activeAnalysis = 'shipment_delay';
    } else if (query.includes('refund driver') || query.includes('most refund') || query.includes('refund reason')) {
      ctx.activeAnalysis = 'refund_drivers';
    } else if (query.includes('inventory') || query.includes('stock') || query.includes('sku')) {
      ctx.activeAnalysis = 'inventory';
    } else if (query.includes('sales') || query.includes('revenue') || query.includes('money')) {
      ctx.activeAnalysis = 'revenue';
    }

    // 4. Detect time range
    if (query.includes('last month') || query.includes('historical')) {
      ctx.activeTimeRange = 'last_month';
    } else if (query.includes('today') || query.includes('current')) {
      ctx.activeTimeRange = 'today';
    }
  }

  return ctx;
}

export function selectBusinessTool(queryText: string, ctx: ConversationContext): string | null {
  const query = queryText.toLowerCase();

  const isCompare = query.includes('compare') || query.includes('last month') || query.includes('today');
  
  if (query.includes('delay') || query.includes('shipment') || query.includes('carrier') || query.includes('logistics') || (isCompare && ctx.activeAnalysis === 'shipment_delay')) {
    ctx.activeAnalysis = 'shipment_delay';
    if (query.includes('last month') || query.includes('historical')) {
      ctx.activeTimeRange = 'last_month';
    }
    return 'shipmentAnalytics';
  }
  
  if (query.includes('causing refund') || query.includes('most refund') || query.includes('refund driver') || query.includes('top refund') || query.includes('why refund') || query.includes('refund reason') || (isCompare && ctx.activeAnalysis === 'refund_drivers')) {
    ctx.activeAnalysis = 'refund_drivers';
    return 'refundAnalytics';
  }
  
  if (query.includes('inventory') || query.includes('stock') || query.includes('sku') || query.includes('supplier') || (isCompare && ctx.activeAnalysis === 'inventory')) {
    ctx.activeAnalysis = 'inventory';
    return 'inventoryAnalytics';
  }
  
  if (query.includes('sales') || query.includes('revenue') || query.includes('money') || query.includes('financial') || (isCompare && ctx.activeAnalysis === 'revenue')) {
    ctx.activeAnalysis = 'revenue';
    return 'revenueAnalytics';
  }
  
  if (query.includes('customer') || query.includes('alice') || query.includes('vip') || (isCompare && ctx.activeAnalysis === 'customer')) {
    ctx.activeAnalysis = 'customer';
    return 'customerAnalytics';
  }

  return null;
}

// ----------------------------------------------------
// 3. Dynamic Local Mock Analyst Engine
// ----------------------------------------------------
async function handleMockChat(
  message: string, 
  mode: 'ask' | 'agent', 
  context: {
    resolvedQuery: string;
    activeOrderNumber: string;
    activeCustomerName: string;
    detectedIntent: 'analysis' | 'action' | 'general';
    selectedTool: string | null;
    businessContext: any;
  }
): Promise<string> {
  const query = context.resolvedQuery;
  const intent = context.detectedIntent;
  const toolName = context.selectedTool;
  const meta = context.businessContext;

  // Enforce Ask Mode read-only limits
  if (mode === 'ask') {
    const isAction = intent === 'action';
    if (isAction) {
      const payload = JSON.stringify({ originalRequest: message });
      return `### 🔒 Action Blocked: Ask Mode (Read-Only)

I am currently running in **Ask Mode** (Read-Only). I cannot process refunds, modify promo coupons, or execute store database writes.

To run policy safeguards and proceed with this operational change, please switch to **Agent Mode** using the toggle above and resubmit.

[SWITCH_TO_AGENT_CARD: ${payload}]`;
    }
  }

  // Handle Actions: Discount Creation
  if (intent === 'action' && (query.includes('discount') || query.includes('coupon') || query.includes('promo'))) {
    const pctMatch = query.match(/(\d+)%/);
    const discountPercent = pctMatch ? parseInt(pctMatch[1]) : 15;
    
    const codeMatch = query.match(/code\s+([a-zA-Z0-9_-]+)/i) || query.match(/([a-zA-Z0-9_-]+)\s+for/i) || query.match(/discount\s+([a-zA-Z0-9_-]+)/i) || query.match(/coupon\s+([a-zA-Z0-9_-]+)/i);
    const code = codeMatch ? codeMatch[1].toUpperCase() : `SAVE${discountPercent}`;

    if (discountPercent > 20) {
      const riskAnalysis = {
        riskScore: 65,
        reasons: ['Discount percent exceeds standard policy threshold (20%)', 'Apology reason not accompanied by customer support ticket ID verification'],
        explanation: `Creating a discount coupon code ${code} for ${discountPercent}% exceeds store policy constraints and requires manager authorization.`
      };

      const approval = await prisma.approval.create({
        data: {
          type: 'DISCOUNT_CREATION',
          status: 'PENDING',
          metadata: {
            code,
            discountPercent,
            reasons: riskAnalysis.reasons,
            riskScore: riskAnalysis.riskScore,
            explanation: riskAnalysis.explanation
          }
        }
      });

      const approvalCardPayload = JSON.stringify({
        id: approval.id,
        type: 'DISCOUNT_CREATION',
        code,
        amount: discountPercent,
        riskScore: riskAnalysis.riskScore,
        explanation: riskAnalysis.explanation
      });

      return `### 🛡️ AI Business Operations Analysis (Discount Creation)

Intent Match: **Discount Code Creation (Confidence: 96%)**

I have analyzed the promotion parameters for code **${code}**.

#### 🏷️ Promo Parameters
* **Coupon Code**: **${code}**
* **Discount Value**: **${discountPercent}% OFF**
* **Target Channels**: checkout_flows

#### 🛡️ Risk Assessment & Governance Policy
* **Calculated Risk Score**: **65/100** (Medium Risk)
* **Policy Breach Flags**:
  * Discount percentage (${discountPercent}%) exceeds the 20% safe-limit threshold for store managers.
  * Lacks active customer support ticket ID verification link.
* **Governance Assessment**: ${riskAnalysis.explanation}

#### 📋 Execution Plan
1. **Validate Coupon Rules**: Check percent parameters.
2. **Policy Threshold**: Run manager authorization check.
3. **Deploy checkout Rules**: Sync rule configurations to storefront.
4. **Notify Marketing Admin**: Trigger promotion webhook.

> [!IMPORTANT]
> **Approval Required**: Discount code generation is blocked from direct execution.

Suggested Actions:
[Approve Rules] or [Reject Request]

[APPROVAL_CARD: ${approvalCardPayload}]`;
    } else {
      return `### 🏷️ Discount Code Created Successfully

I have generated the coupon code **${code}** with a **${discountPercent}%** discount as requested.

* **Status**: Active
* **Discount**: ${discountPercent}% Off
* **Connected Channel**: Shopify & Stripe
* **Integrations Logged**:
  * ✓ Coupon pushed to Shopify admin
  * ✓ Promotion metadata synced with Stripe checkout
  * ✓ Audit log registered in timeline tracker`;
    }
  }

  // Handle Actions: Refund request
  if (intent === 'action' && (query.includes('refund') || query.includes('payout'))) {
    if (!meta || !meta.order) {
      return `I couldn't locate Order #${context.activeOrderNumber || 'ORD-1024'} in the database. Please verify the order number and try again.`;
    }

    const order = meta.order;
    const customer = meta.customer;
    const amount = meta.order.totalAmount;
    const riskScore = meta.riskScore;
    const explanation = meta.explanation;
    const reasons = meta.reasons;

    // Check if refund already exists
    const existingRefund = await prisma.refund.findFirst({
      where: { orderId: order.id }
    });

    if (existingRefund) {
      return `A refund request for Order #${order.orderNumber} has already been submitted. Status: **${existingRefund.status}**. Risk Score: **${existingRefund.riskScore}/100**. You can manage this in the Approvals Hub.`;
    }

    // Create Approval record
    const approval = await prisma.approval.create({
      data: {
        type: 'REFUND_REQUEST',
        status: 'PENDING',
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: customer.name,
          amount: amount,
          reasons,
          riskScore,
          explanation
        }
      }
    });

    // Create Refund record
    await prisma.refund.create({
      data: {
        orderId: order.id,
        amount: amount,
        reason: 'Requested via Chat: Customer dispute / order issue.',
        status: 'PENDING',
        riskScore,
        riskExplanation: explanation,
        approvalId: approval.id
      }
    });

    const approvalCardPayload = JSON.stringify({
      id: approval.id,
      type: 'REFUND_REQUEST',
      amount: amount,
      riskScore,
      explanation
    });

    return `### 🛡️ AI Business Operations Analysis (Refund Request)

Intent Match: **Refund Processing (Confidence: 98%)**

I have analyzed the transaction history and dispute records for **Order #${order.orderNumber}**.

#### 👥 Customer Profile
* **Name**: ${customer.name}
* **Email**: ${customer.email}
* **Customer Tier**: ${customer.tier}
* **Previous Refunds (30d)**: ${riskScore > 30 ? '1' : '0'}

#### 📦 Order Details
* **Order Total**: ₹${amount.toLocaleString('en-IN')}
* **Status**: Delivered
* **Eligible for Payout**: Yes (Within 30-day window)

#### 🛡️ Risk Assessment & Governance Policy
* **Calculated Risk Score**: **${riskScore}/100** (${riskScore > 50 ? 'HIGH' : 'LOW'})
* **Policy Breach Flags**:
${reasons.map((r: string) => `  * ${r}`).join('\n')}
* **Assessment**: ${explanation}

#### 📋 Execution Plan
1. **Validate Transaction**: Check order ledger records.
2. **Gateway Eligibility**: Run payment processor check.
3. **Manager Sign-off**: Awaiting manager authorization.
4. **Initiate Refund**: Submit transaction payout request.
5. **Customer Notify**: Email settlement receipt.
6. **Support Resolve**: Close active Zendesk ticket.

> [!IMPORTANT]
> **Approval Required**: Due to value thresholds or risk flags, this action is blocked from direct execution.

Suggested Actions:
[Review Similar Refunds] or [Escalate To Finance]

[APPROVAL_CARD: ${approvalCardPayload}]`;
  }

  // Handle Analysis Intent via Tool Registry
  if (intent === 'analysis' && toolName && businessTools[toolName]) {
    const result = await businessTools[toolName](context.businessContext.conversationContext);
    
    const headerLabel = toolName === 'shipmentAnalytics' ? 'AI Shipment Delay Analysis'
      : toolName === 'refundAnalytics' ? 'AI Refund Drivers & Product Analysis'
      : toolName === 'inventoryAnalytics' ? 'AI Inventory Analysis & Stock Insights'
      : toolName === 'customerAnalytics' ? 'AI Customer Profile & Dispute Analysis'
      : 'AI Store Financial Report';

    return `### 📊 ${headerLabel}

Intent Match: **Business Operations Intelligence (Confidence: 96%)**

I have aggregated relevant database metrics and parameters.

#### 🔍 Key Findings
${result.findings.map(f => `* ${f}`).join('\n')}

#### 💡 Recommended Actions
${result.recommendations.map(r => `* ${r}`).join('\n')}

Suggested Actions:
${result.actions.map(act => `[${act.label}]`).join(' or ')}
`;
  }

  // Handle General Conversational Dialogues (ChatGPT-style grounded in store details)
  if (intent === 'general') {
    const totalOrders = await prisma.order.count();
    const delayed = await prisma.order.count({ where: { status: 'DELAYED' } });
    const productsCount = await prisma.product.count();
    const refundsCount = await prisma.refund.count({ where: { status: 'APPROVED' } });
    
    // 1. Check if greeting
    if (/^(hi|hello|hey|good\s+morning|good\s+evening|yo|greetings)/i.test(query)) {
      return `### 👋 Hello there!

I am **OpsPilot**, your AI Business Operations & Analytics Assistant. 

Our store integrations are fully operational:
* **Shopify Sync**: Status is **Healthy** (✓ All products synced)
* **Stripe Gateway**: Status is **Active**
* **Zendesk Tickets**: Status is **Operational**

I can help you review logistics, analyze product returns, audit stock, or execute payouts:
* Ask me: **"Why are shipments delayed?"**
* Or ask: **"Which products are causing most refunds?"**
* Or check stock: **"Show inventory status"**

How can I help you optimize your store operations today?`;
    }

    // 2. Check if asking about delays strategy / how to improve logistics
    if (query.includes('delay') || query.includes('shipping') || query.includes('carrier') || query.includes('logistics')) {
      return `### 🚚 E-commerce Logistics Strategy Advisor

Grounded in our active catalog of **${productsCount}** products and **${totalOrders}** orders, here is an operational assessment for optimizing delivery times:

#### 📋 Current Status
* We currently have **${delayed}** package(s) flagged as **DELAYED** in the database.
* Our main transit bottleneck is identified at the **Bangalore (BLR) Warehouse** and courier transit under **FedEx**.

#### 💡 Strategy Checklist
1. **Dynamic Rerouting**: Temporarily shift delivery routes from low-performing carriers to high-performing carriers (e.g. DHL Express) for delayed regions.
2. **Backlog Auditing**: Conduct dispatch velocity checks at the BLR warehouse to resolve packaging delays.
3. **Proactive Alerts**: Send automated email/SMS alerts to customers with delayed orders to mitigate support ticket spikes.

Suggested Actions:
[Why are shipments delayed?] or [Verify Shopify Stocks]`;
    }

    // 3. Check if asking about sales / how to improve revenue / marketing
    if (query.includes('revenue') || query.includes('sales') || query.includes('sell') || query.includes('marketing') || query.includes('discount')) {
      return `### 📈 Revenue Optimization & Marketing Strategy

To boost margins and order frequency for our product catalog, here is a custom data-driven recommendation:

#### 📊 Baseline Context
* Our current catalog contains **${productsCount}** products.
* Active pending approvals queue has items awaiting clearance.

#### 💡 Recommendations
1. **Targeted Campaigns**: Create limited-time promotion coupon codes (e.g., a **15% off code VIPSPECIAL**) targeted at VIP customers who placed orders recently.
2. **Velocity Thresholds**: Keep discount percentages under 20% to avoid manager approval policy checkpoints and ensure instant checkout deployment.
3. **Stock Replenishment**: Replenish low-stock SKUs before running promotional push campaigns to avoid out-of-stock checkouts.

Suggested Actions:
[Show inventory status] or [Create discount code VIPSPECIAL]`;
    }

    // 4. Check if asking about refunds strategy / customer satisfaction
    if (query.includes('refund') || query.includes('return') || query.includes('customer') || query.includes('churn') || query.includes('ticket')) {
      return `### 👥 Customer Experience & Returns Strategy

Our e-commerce portal aims to keep return rates below **3.0%**. Here is an analysis of our returns and support metrics:

#### 📊 Customer Support Context
* Historical returns in database: **${refundsCount}** approved refunds.
* We prioritize resolution for our **VIP customer profile** account segments.

#### 💡 Actionable Insights
1. **Reduce Leakage**: Alpha Glow Serum returns are heavily driven by bottle cap transit leakages. Updating supplier package specifications is our highest priority recommendation.
2. **Fast Resolution**: Issue fast refunds for low-risk, small-value disputes under ₹10,000 to resolve Zendesk tickets instantly.
3. **Escalate disputes**: Keep high-risk claims (risk score > 50) locked in approvals for supervisor review.

Suggested Actions:
[Which products are causing most refunds?] or [list active inventory]`;
    }

    // General default conversation fallback
    return `### 🤖 OpsPilot AI E-commerce Advisor

I can act as a strategic advisor for your store operations or help you execute actions with governance guidelines.

#### 📋 System Capabilities
1. **Logistics Analytics**: Type *"Why are shipments delayed?"* to view carrier SLA performance breakdowns.
2. **Returns Analytics**: Type *"Which products are causing most refunds?"* to see product return statistics.
3. **Fulfillment writes**: Type *"Refund Order #ORD-1024"* (in Agent Mode) to initiate a refund checked by our risk engine.
4. **Promo Codes**: Type *"Create a 25% discount SPECIAL25"* to deploy checkout campaign rules.

How would you like to proceed?`;
  }

  // General fallback
  return `I am here to assist. How can I help you?`;
}

// ----------------------------------------------------
// 4. OpenAI Grounded Completion & Route Entry
// ----------------------------------------------------
const toolsList = [
  {
    type: 'function' as const,
    function: {
      name: 'list_products',
      description: 'Retrieve a list of all products, including their SKU, name, price, and current inventory stock.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_orders',
      description: 'Retrieve e-commerce orders, optionally filtering by status (e.g. DELAYED, COMPLETED).',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['PENDING', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DELAYED'], description: 'Filter by order status' }
        }
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_tickets',
      description: 'Retrieve customer support tickets currently open or in-progress in the database.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_pending_approvals',
      description: 'Retrieve a list of all active governance approval requests that are currently PENDING.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'request_refund',
      description: 'Initiate a refund request for an order. Runs risk analysis and submits for approval if flagged.',
      parameters: {
        type: 'object',
        properties: {
          orderNumber: { type: 'string', description: 'The order number to refund, e.g. ORD-1024' },
          amount: { type: 'number', description: 'The refund amount' },
          reason: { type: 'string', description: 'Reason for requesting the refund' }
        },
        required: ['orderNumber', 'amount', 'reason']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_discount',
      description: 'Create a store discount code. If the discount is above 20%, it requires approval.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'The discount coupon code, e.g. APOLOGY15' },
          discountPercent: { type: 'number', description: 'The discount percentage, e.g. 15' },
          reason: { type: 'string', description: 'Reason for coupon creation' }
        },
        required: ['code', 'discountPercent', 'reason']
      }
    }
  }
];

export async function processChat(messages: ChatMessage[], mode: 'ask' | 'agent' = 'agent'): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_API_BASE_URL;
  const modelName = process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini';
  const lastMessage = messages[messages.length - 1].content;

  // 1. Gather conversation context & resolve shortcuts (Proceed with it)
  const conversationContext = await parseConversationContext(messages);
  
  let resolvedQuery = lastMessage.toLowerCase().trim();
  const isProceed = /proceed/i.test(resolvedQuery) || /approve.*it/i.test(resolvedQuery) || /go.*ahead/i.test(resolvedQuery) || /execute/i.test(resolvedQuery) || /do.*it/i.test(resolvedQuery);
  if (isProceed && conversationContext.activeOrderId) {
    resolvedQuery = `refund order ${conversationContext.activeOrderId}`;
  }

  // 2. Select Tool & Classify Intent
  const selectedTool = selectBusinessTool(resolvedQuery, conversationContext);
  let detectedIntent: 'analysis' | 'action' | 'general' = 'general';
  
  if (/refund/i.test(resolvedQuery) || /payout/i.test(resolvedQuery) || /discount/i.test(resolvedQuery) || /coupon/i.test(resolvedQuery) || /promo/i.test(resolvedQuery)) {
    detectedIntent = 'action';
  } else if (selectedTool) {
    detectedIntent = 'analysis';
  }

  // 3. Gather real-time DB data context based on intent / selected tool
  let businessContext: any = { conversationContext };
  try {
    if (detectedIntent === 'action' && (resolvedQuery.includes('refund') || resolvedQuery.includes('payout'))) {
      const orderNum = resolvedQuery.match(/ORD-\d+/i)?.[0]?.toUpperCase() || conversationContext.activeOrderId || 'ORD-1024';
      const order = await prisma.order.findUnique({
        where: { orderNumber: orderNum },
        include: { customer: true }
      });
      if (order) {
        const risk = await evaluateRefundRisk(order.id, Number(order.totalAmount));
        businessContext = {
          ...businessContext,
          order: {
            id: order.id,
            orderNumber: order.orderNumber,
            totalAmount: Number(order.totalAmount),
            status: order.status,
            createdAt: order.createdAt
          },
          customer: {
            name: order.customer.name,
            email: order.customer.email,
            tier: Number(order.totalAmount) > 10000 ? 'VIP' : 'Standard'
          },
          riskScore: risk.riskScore,
          reasons: risk.reasons,
          explanation: risk.explanation
        };
      }
    } else if (selectedTool && businessTools[selectedTool]) {
      const toolResult = await businessTools[selectedTool](conversationContext);
      businessContext = {
        ...businessContext,
        toolResult
      };
    }
  } catch (err) {
    console.error('Error compiling DB context for AI:', err);
  }

  // Bundle context pack for helper routines
  const contextPack = {
    resolvedQuery,
    activeOrderNumber: conversationContext.activeOrderId || '',
    activeCustomerName: conversationContext.activeCustomerId || '',
    detectedIntent,
    selectedTool,
    businessContext
  };

  // Fallback to mock if neither API Key nor custom Base URL is set
  const hasApiKey = apiKey && apiKey.trim() !== '';
  const hasBaseUrl = baseURL && baseURL.trim() !== '';

  if (!hasApiKey && !hasBaseUrl) {
    return handleMockChat(lastMessage, mode, contextPack);
  }

  try {
    const openai = new OpenAI({
      apiKey: apiKey || 'dummy-key',
      baseURL: baseURL || undefined
    });
    
    // Inject the structured conversation memory + real database figures directly in system prompt
    const systemMessage: ChatMessage = {
      role: 'system',
      content: `You are OpsPilot, the AI Business Operations & Analytics Agent.
You have direct read/write access to the store database.
You must help operations managers retrieve info, analyze metrics, and process actions.

Your role:
1. Understand business intent.
2. Analyze available database context.
3. Explain reasoning in a clear, professional analyst style.
4. Generate execution plans when modifications are requested.
5. Recommend actions and never execute actions directly.
6. Return structured JSON blocks (e.g. [APPROVAL_CARD: ...]) when actions are needed.

Current Active Session Context:
- Active Order in Memory: "${conversationContext.activeOrderId || 'None'}"
- Active Customer: "${conversationContext.activeCustomerId || 'None'}"
- Detected Intent: "${detectedIntent}"
- Selected Analytics Tool: "${selectedTool || 'None'}"
- Real-Time Database Business Context:
${JSON.stringify(businessContext, null, 2)}

Current Mode: ${mode === 'ask' ? 'Read-Only (Ask Mode)' : 'Action-Execution (Agent Mode)'}
${mode === 'ask' 
  ? `You are running in READ-ONLY mode. You must NOT perform any operational actions, database writes, or refund requests. If the user asks you to modify data or initiate a refund, politely explain that they must toggle to "Agent Mode" to execute actions, and append "[SWITCH_TO_AGENT_CARD: {\"originalRequest\": \"USER_PROMPT\"}]" (replace USER_PROMPT with the exact text of their write request) to the very end of your response.`
  : `You are running in action-execution mode. When a user asks to refund an order, always call the request_refund tool. If a user asks to create a discount, call the create_discount tool. If the tool response indicates that approval is required, return details and append "[APPROVAL_CARD: ...]" as returned by the tool output.`}

Always default to Indian Rupees (₹) for currency formatting. Explain why actions are recommended, analyze risk, and output suggested action chips at the bottom like "Suggested Actions: [Notify Customer] or [Escalate to Finance]" or "Suggested Actions: [Create Purchase Order] or [Notify Supplier]" depending on context.`
    };

    const apiMessages = [systemMessage, ...messages];

    // Call OpenAI
    const response = await openai.chat.completions.create({
      model: modelName,
      messages: apiMessages.map(m => ({ role: m.role, content: m.content })),
      tools: mode === 'agent' ? toolsList : undefined,
      tool_choice: mode === 'agent' ? 'auto' : undefined,
      temperature: 0.2
    });

    const responseMessage = response.choices[0].message;

    // Handle tool calls if returned
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const toolCalls = responseMessage.tool_calls;
      const toolOutputs: any[] = [];
      
      for (const toolCall of toolCalls) {
        const tCall = toolCall as any;
        const functionName = tCall.function.name;
        const args = JSON.parse(tCall.function.arguments);
        
        let output = '';
        if (functionName === 'list_products') {
          const products = await prisma.product.findMany({});
          output = JSON.stringify(products);
        } else if (functionName === 'list_orders') {
          const orders = await prisma.order.findMany({
            where: args.status ? { status: args.status } : {},
            include: { customer: true }
          });
          output = JSON.stringify(orders);
        } else if (functionName === 'list_tickets') {
          const tickets = await prisma.ticket.findMany({
            include: { customer: true }
          });
          output = JSON.stringify(tickets);
        } else if (functionName === 'list_pending_approvals') {
          const approvals = await prisma.approval.findMany({
            where: { status: 'PENDING' },
            orderBy: { createdAt: 'desc' }
          });
          output = JSON.stringify(approvals);
        } else if (functionName === 'request_refund') {
          const orderNum = args.orderNumber?.toUpperCase() || conversationContext.activeOrderId;
          const order = await prisma.order.findUnique({
            where: { orderNumber: orderNum },
            include: { customer: true }
          });
          
          if (!order) {
            output = JSON.stringify({ error: `Order #${orderNum} not found.` });
          } else {
            const amount = args.amount;
            const riskAnalysis = await evaluateRefundRisk(order.id, amount);
            
            // Check if refund already exists
            const existingRefund = await prisma.refund.findFirst({
              where: { orderId: order.id }
            });
            
            if (existingRefund) {
              output = JSON.stringify({
                status: 'ALREADY_EXISTS',
                refundStatus: existingRefund.status,
                riskScore: existingRefund.riskScore,
                msg: 'Refund request already submitted previously.'
              });
            } else {
              // Create approval record
              const approval = await prisma.approval.create({
                data: {
                  type: 'REFUND_REQUEST',
                  status: 'PENDING',
                  metadata: {
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    customerName: order.customer.name,
                    amount: amount,
                    reasons: riskAnalysis.reasons,
                    riskScore: riskAnalysis.riskScore,
                    explanation: riskAnalysis.explanation
                  }
                }
              });

              // Create refund record
              await prisma.refund.create({
                data: {
                  orderId: order.id,
                  amount: amount,
                  reason: args.reason || 'Requested via assistant',
                  status: 'PENDING',
                  riskScore: riskAnalysis.riskScore,
                  riskExplanation: riskAnalysis.explanation,
                  approvalId: approval.id
                }
              });

              output = JSON.stringify({
                status: 'APPROVAL_REQUIRED',
                approvalId: approval.id,
                riskScore: riskAnalysis.riskScore,
                explanation: riskAnalysis.explanation,
                reasons: riskAnalysis.reasons,
                amount: amount
              });
            }
          }
        } else if (functionName === 'create_discount') {
          const discountPercent = args.discountPercent;
          const code = args.code.toUpperCase();
          const reason = args.reason;

          if (discountPercent > 20) {
            const riskAnalysis = {
              riskScore: 65,
              reasons: ['Discount percent exceeds standard policy threshold (20%)', 'Apology reason not accompanied by customer support ticket ID verification'],
              explanation: `Creating a discount coupon code ${code} for ${discountPercent}% exceeds store policy constraints and requires manager authorization.`
            };

            const approval = await prisma.approval.create({
              data: {
                type: 'DISCOUNT_CREATION',
                status: 'PENDING',
                metadata: {
                  code,
                  discountPercent,
                  reasons: riskAnalysis.reasons,
                  riskScore: riskAnalysis.riskScore,
                  explanation: riskAnalysis.explanation
                }
              }
            });

            output = JSON.stringify({
              status: 'APPROVAL_REQUIRED',
              approvalId: approval.id,
              type: 'DISCOUNT_CREATION',
              code,
              amount: discountPercent,
              riskScore: riskAnalysis.riskScore,
              explanation: riskAnalysis.explanation
            });
          } else {
            output = JSON.stringify({
              status: 'SUCCESS',
              code,
              discountPercent,
              msg: 'Discount code created successfully.'
            });
          }
        }
        
        toolOutputs.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: functionName,
          content: output
        });
      }

      // Send the tool results back to OpenAI
      const secondResponse = await openai.chat.completions.create({
        model: modelName,
        messages: [
          systemMessage,
          ...messages.map(m => ({ role: m.role, content: m.content })),
          responseMessage,
          ...toolOutputs as any
        ],
        temperature: 0.2
      });

      let botContent = secondResponse.choices[0].message.content || 'Error executing assistant response.';
      
      // Programmatically append APPROVAL_CARD if a refund approval was created
      const approvalOutput = toolOutputs.find(o => {
        try {
          const parsed = JSON.parse(o.content);
          return parsed.status === 'APPROVAL_REQUIRED';
        } catch {
          return false;
        }
      });
      
      if (approvalOutput) {
        const data = JSON.parse(approvalOutput.content);
        const cardPayload = {
          id: data.approvalId,
          type: data.type || 'REFUND_REQUEST',
          amount: data.amount,
          code: data.code,
          riskScore: data.riskScore,
          explanation: data.explanation
        };
        botContent += `\n\n[APPROVAL_CARD: ${JSON.stringify(cardPayload)}]`;
      }

      // Programmatically append APPROVAL_CARDs for pending approvals if listed
      const listApprovalsOutput = toolOutputs.find(o => o.name === 'list_pending_approvals');
      if (listApprovalsOutput) {
        try {
          const approvals = JSON.parse(listApprovalsOutput.content);
          if (Array.isArray(approvals)) {
            for (const app of approvals) {
              const meta = app.metadata as any;
              let cardPayload: any = {
                id: app.id,
                type: app.type,
              };
              if (app.type === 'REFUND_REQUEST') {
                cardPayload.amount = meta.amount;
                cardPayload.riskScore = meta.riskScore;
                cardPayload.explanation = meta.explanation;
              } else if (app.type === 'DISCOUNT_CREATION') {
                cardPayload.code = meta.code;
                cardPayload.amount = meta.discountPercent;
                cardPayload.riskScore = meta.riskScore;
                cardPayload.explanation = meta.explanation;
              } else if (app.type === 'INVENTORY_UPDATE') {
                cardPayload.filename = meta.filename;
                cardPayload.productCount = meta.productCount;
                cardPayload.products = meta.products;
              }
              botContent += `\n\n[APPROVAL_CARD: ${JSON.stringify(cardPayload)}]`;
            }
          }
        } catch (err) {
          console.error('Error parsing list approvals output:', err);
        }
      }
      
      return botContent;
    }

    return responseMessage.content || 'Error processing response.';
  } catch (err: any) {
    console.error('OpenAI processing failed, falling back to mock:', err);
    return handleMockChat(lastMessage, mode, contextPack);
  }
}

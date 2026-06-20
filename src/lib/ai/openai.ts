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
    const day = 24 * 60 * 60 * 1000;

    // "last month / historical" is the only true time-window query — it looks at
    // orders *created* in the prior 30–60 day period. Everything else ("today",
    // "delayed shipments", default) is the live backlog: orders currently in
    // DELAYED status, which is what an ops manager actually wants to action.
    if (ctx.activeTimeRange === 'last_month') {
      const start = new Date(Date.now() - 60 * day);
      const end = new Date(Date.now() - 30 * day);
      const windowOrders = await prisma.order.findMany({ where: { createdAt: { gte: start, lt: end } } });
      const delayed = windowOrders.filter(o => o.status === 'DELAYED');
      const total = windowOrders.length;
      const rate = total > 0 ? (delayed.length / total) * 100 : 0;

      return {
        metrics: { scope: 'previous 30-day period', total_orders: total, delayed_orders: delayed.length, delay_rate_pct: Number(rate.toFixed(1)) },
        findings: total === 0
          ? [`No orders were placed in the previous 30-day period.`]
          : [
              `${delayed.length} of ${total} orders placed in the previous 30-day period were DELAYED (${rate.toFixed(1)}% delay rate).`,
              `This is a historical baseline — use it to compare against the current backlog.`
            ],
        recommendations: [`Compare the historical ${rate.toFixed(1)}% delay rate against today's backlog to spot trends.`],
        actions: []
      };
    }

    // Live delayed backlog (default + "today").
    const [delayed, totalActive] = await Promise.all([
      prisma.order.findMany({
        where: { status: 'DELAYED' },
        include: { customer: true },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.order.count()
    ]);

    const rate = totalActive > 0 ? (delayed.length / totalActive) * 100 : 0;
    const isToday = ctx.activeTimeRange === 'today';
    const scope = isToday ? 'as of today' : 'currently';
    const lead = isToday ? 'As of today, ' : '';
    const sample = delayed.slice(0, 5).map(o => o.orderNumber);
    const oldest = delayed[0];

    const findings = delayed.length === 0
      ? [`No shipments are ${scope} flagged DELAYED — fulfillment is within SLA across ${totalActive} order(s).`]
      : [
          `${lead}${delayed.length} order(s) ${isToday ? 'are' : 'are currently'} flagged DELAYED out of ${totalActive} total (${rate.toFixed(1)}% of the book).`,
          `Affected orders: ${sample.join(', ')}${delayed.length > 5 ? `, plus ${delayed.length - 5} more` : ''}.`,
          oldest ? `Oldest open delay: ${oldest.orderNumber} for ${oldest.customer.name}, placed ${oldest.createdAt.toISOString().slice(0, 10)}.` : ''
        ].filter(Boolean);

    const recommendations = delayed.length > 0
      ? [
          `Prioritize dispatch on the ${delayed.length} delayed order(s), starting with the oldest (${oldest.orderNumber}).`,
          `Proactively notify affected customers to reduce inbound support tickets.`,
          `Carrier/warehouse attribution requires a carrier field on Order (not in the current schema).`
        ]
      : [`Maintain the current fulfillment cadence; monitor daily for new delays.`];

    const actions = delayed.length > 0
      ? [
          { label: 'Notify Operations Manager', action: 'notify manager about delayed shipments' },
          { label: 'Create SLA Report', action: 'generate carrier SLA report' }
        ]
      : [];

    return {
      metrics: {
        scope,
        delayed_orders: delayed.length,
        total_orders: totalActive,
        delay_rate_pct: Number(rate.toFixed(1)),
        sample_orders: sample
      },
      findings,
      recommendations,
      actions
    };
  },

  refundAnalytics: async () => {
    const [refunds, totalOrders] = await Promise.all([
      prisma.refund.findMany({
        include: { order: { include: { items: { include: { product: true } } } } }
      }),
      prisma.order.count()
    ]);

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
    const pending = refunds.filter(r => r.status === 'PENDING').length;
    const returnRate = totalOrders > 0 ? (refunds.length / totalOrders) * 100 : 0;

    const findings = refunds.length > 0
      ? [
          `${refunds.length} refund(s) totaling ₹${totalRefundedVal.toLocaleString('en-IN')} — a ${returnRate.toFixed(1)}% return rate across ${totalOrders} order(s).`,
          topProduct
            ? `Top refunded product: ${topProduct.name} (${topProduct.sku}) — ${topProduct.count} refund(s), ₹${topProduct.amount.toLocaleString('en-IN')}.`
            : `Refunds are not concentrated on any single product.`,
          `${pending} refund(s) currently PENDING approval.`
        ]
      : [
          `No refunds registered. Return rate is 0.0% across ${totalOrders} order(s).`
        ];

    const recommendations = topProduct
      ? [
          `Investigate quality/packaging for ${topProduct.name} — it drives the most refunds.`,
          pending > 0 ? `Clear the ${pending} pending refund(s) in the Approvals Hub.` : `No refunds awaiting approval.`
        ]
      : [`Return volume is healthy; keep monitoring weekly.`];

    const actions = [
      { label: 'Review Similar Refunds', action: 'Review Similar Refunds' },
      { label: 'Escalate To Finance', action: 'Escalate To Finance' }
    ];

    return {
      metrics: {
        total_refunds: refunds.length,
        total_refunded_amount: totalRefundedVal,
        pending_refunds: pending,
        return_rate_pct: Number(returnRate.toFixed(1)),
        top_products: sortedProducts
      },
      findings,
      recommendations,
      actions
    };
  },

  inventoryAnalytics: async () => {
    const products = await prisma.product.findMany();
    const lowStock = products.filter(p => p.inventory < 15);
    const outOfStock = products.filter(p => p.inventory === 0);
    const criticalSku = lowStock
      .filter(p => p.inventory > 0)
      .sort((a, b) => a.inventory - b.inventory)[0] || null;
    const stockValue = products.reduce((sum, p) => sum + Number(p.price) * p.inventory, 0);

    const findings = [
      `Catalog: ${products.length} SKU(s), on-hand stock value ₹${stockValue.toLocaleString('en-IN')}.`,
      `${lowStock.length} SKU(s) below the 15-unit safety threshold; ${outOfStock.length} fully out of stock.`,
      criticalSku
        ? `Lowest in-stock SKU: ${criticalSku.name} (${criticalSku.sku}) — ${criticalSku.inventory} unit(s) left.`
        : outOfStock.length > 0
        ? `${outOfStock.length} SKU(s) need immediate restock.`
        : `No critical shortages detected.`
    ];

    const recommendations = (criticalSku || outOfStock.length > 0)
      ? [
          `Raise a replenishment PO for the ${lowStock.length} low-stock SKU(s).`,
          criticalSku ? `Prioritize ${criticalSku.sku} — closest to stock-out.` : `Restock the ${outOfStock.length} out-of-stock SKU(s) first.`
        ]
      : [
          `Inventory levels look healthy. Monitor weekly dispatch trends.`,
          `Confirm supplier lead times are within constraints.`
        ];

    const target = criticalSku || outOfStock[0];
    const actions = target
      ? [
          { label: 'Create Purchase Order', action: `create purchase order for ${target.sku}` },
          { label: 'Notify Supplier', action: `notify supplier about low stock for ${target.sku}` },
          { label: 'View Product Catalog', action: 'View Product Catalog' }
        ]
      : [
          { label: 'View Product Catalog', action: 'View Product Catalog' }
        ];

    return {
      metrics: {
        total_products: products.length,
        low_stock_count: lowStock.length,
        out_of_stock_count: outOfStock.length,
        stock_value: stockValue,
        critical_product: criticalSku ? { sku: criticalSku.sku, name: criticalSku.name, inventory: criticalSku.inventory } : null
      },
      findings,
      recommendations,
      actions
    };
  },

  customerAnalytics: async (ctx) => {
    const handle = (ctx.activeCustomerId || '').split('@')[0];
    const customer = handle
      ? await prisma.customer.findFirst({
          where: {
            OR: [
              { email: { contains: handle, mode: 'insensitive' } },
              { name: { contains: handle, mode: 'insensitive' } }
            ]
          },
          include: { orders: true, tickets: true }
        })
      : null;

    if (!customer) {
      return {
        metrics: { customerName: null },
        findings: [`No specific customer in context. Mention a customer by name or email to pull their profile.`],
        recommendations: [`Try e.g. "show Alice Smith's orders and open tickets".`],
        actions: []
      };
    }

    const spend = customer.orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
    const openTickets = customer.tickets.filter(t => t.status !== 'RESOLVED').length;
    const tier = spend > 50000 ? 'VIP' : spend > 10000 ? 'Priority' : 'Standard';

    const findings = [
      `${customer.name} — ${tier} tier (lifetime spend ₹${spend.toLocaleString('en-IN')}).`,
      `${customer.orders.length} order(s) on record.`,
      `${openTickets} open support ticket(s) of ${customer.tickets.length} total.`
    ];

    const recommendations = openTickets > 0
      ? [`Resolve the ${openTickets} open ticket(s)${tier !== 'Standard' ? ` — ${tier} account, prioritize to prevent churn.` : '.'}`]
      : [`No open tickets. Account is in good standing.`];

    const actions = [
      { label: 'Notify Customer', action: `send a notification to ${customer.name}` },
      { label: 'Escalate to Support Lead', action: 'escalate this ticket to support lead' }
    ];

    return {
      metrics: {
        customerName: customer.name,
        tier,
        lifetimeSpend: spend,
        ordersCount: customer.orders.length,
        ticketsCount: customer.tickets.length,
        openTickets
      },
      findings,
      recommendations,
      actions
    };
  },

  revenueAnalytics: async () => {
    const orders = await prisma.order.findMany();
    const completed = orders.filter(o => o.status === 'COMPLETED');
    const revenue = completed.reduce((sum, o) => sum + Number(o.totalAmount), 0);
    const pendingCount = orders.filter(o => o.status === 'PENDING').length;
    const refundedCount = orders.filter(o => o.status === 'REFUNDED' || o.status === 'PARTIALLY_REFUNDED').length;
    const aov = completed.length > 0 ? Math.round(revenue / completed.length) : 0;

    const findings = orders.length > 0
      ? [
          `Realized revenue (completed orders): ₹${revenue.toLocaleString('en-IN')} across ${completed.length} order(s).`,
          `Average order value: ₹${aov.toLocaleString('en-IN')}.`,
          `${pendingCount} pending and ${refundedCount} refunded order(s) in the pipeline.`
        ]
      : [`No orders yet. Use "Generate Store Data" to seed the store, then re-run this report.`];

    const recommendations = [
      pendingCount > 0 ? `Convert the ${pendingCount} pending order(s) to completion to realize revenue.` : `All orders are settled.`,
      `Track refund velocity (${refundedCount} refunded) against gross sales to protect margins.`
    ];

    const actions = [
      { label: 'View Promotion Metrics', action: 'View Promotion Metrics' },
      { label: 'Show inventory status', action: 'Show inventory status' }
    ];

    return {
      metrics: {
        revenue,
        completedOrders: completed.length,
        pendingOrders: pendingCount,
        refundedOrders: refundedCount,
        aov,
        totalOrders: orders.length
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
// 2b. Query Planner — distinguishes LOOKUP / ANALYSIS / ACTION / EXPLORATION
// ----------------------------------------------------
export type QueryType = 'lookup' | 'analysis' | 'action' | 'exploration';

export interface QueryPlan {
  queryType: QueryType;
  lookupTarget: 'shipments' | 'refunds' | 'inventory' | 'orders' | 'customers' | null;
  analyticsTool: string | null;
  filters: { status?: string; limit?: number };
}

// Lookup trigger words: the user wants to *see* records, not understand them.
const LOOKUP_VERBS = /\b(list|show|give me|display|fetch|get|find|what are|which orders|which shipments|all the|all delayed|see all|tell me about)\b/i;
// Analysis trigger words: the user wants to *understand* something.
const ANALYSIS_VERBS = /\b(why|analyze|analysis|trend|cause|reason|explain|compare|breakdown|how many|impact|insight|diagnose)\b/i;

export function planQuery(queryText: string, ctx: ConversationContext): QueryPlan {
  const q = queryText.toLowerCase().trim();

  // ── ACTION: write operations ──────────────────────────────────────────────
  const isRefundAction =
    /\b(refund|payout)\b/i.test(q) &&
    !/\b(list|show|all|which|why|what|how many|status|report)\b/i.test(q) &&
    (/ORD-\d+/i.test(queryText) || /\b(process|issue|initiate|give|approve)\b/i.test(q));

  const isDiscountAction =
    /\b(discount|coupon|promo)\b/i.test(q) &&
    /\b(create|make|generate|add|new|apply|code)\b/i.test(q);

  if (isRefundAction || isDiscountAction) {
    return { queryType: 'action', lookupTarget: null, analyticsTool: null, filters: {} };
  }

  // ── LOOKUP: the user wants actual records ─────────────────────────────────
  const isLookup = LOOKUP_VERBS.test(q);

  if (isLookup) {
    if (/delay|shipment|transit|in.transit/i.test(q)) {
      ctx.activeAnalysis = 'shipment_delay';
      return { queryType: 'lookup', lookupTarget: 'shipments', analyticsTool: null, filters: { status: 'DELAYED' } };
    }
    if (/refund|return/i.test(q)) {
      return { queryType: 'lookup', lookupTarget: 'refunds', analyticsTool: null, filters: {} };
    }
    if (/inventory|stock|product|sku/i.test(q)) {
      return { queryType: 'lookup', lookupTarget: 'inventory', analyticsTool: null, filters: {} };
    }
    if (/order/i.test(q)) {
      const status = /pending/i.test(q) ? 'PENDING'
        : /complet/i.test(q) ? 'COMPLETED'
        : /cancel/i.test(q) ? 'CANCELLED'
        : undefined;
      return { queryType: 'lookup', lookupTarget: 'orders', analyticsTool: null, filters: { status } };
    }
    if (/customer|vip/i.test(q)) {
      return { queryType: 'lookup', lookupTarget: 'customers', analyticsTool: null, filters: {} };
    }
  }

  // ── ANALYSIS: the user wants insights / explanations ─────────────────────
  const isAnalysis = ANALYSIS_VERBS.test(q);

  if (isAnalysis || /delay|shipment|carrier|logistics/i.test(q)) {
    if (/delay|shipment|carrier|logistics/i.test(q)) {
      ctx.activeAnalysis = 'shipment_delay';
      return { queryType: 'analysis', lookupTarget: null, analyticsTool: 'shipmentAnalytics', filters: {} };
    }
    if (/refund|return/i.test(q)) {
      return { queryType: 'analysis', lookupTarget: null, analyticsTool: 'refundAnalytics', filters: {} };
    }
    if (/inventory|stock|sku/i.test(q)) {
      return { queryType: 'analysis', lookupTarget: null, analyticsTool: 'inventoryAnalytics', filters: {} };
    }
    if (/revenue|sales|money|financial/i.test(q)) {
      return { queryType: 'analysis', lookupTarget: null, analyticsTool: 'revenueAnalytics', filters: {} };
    }
    if (/customer|vip/i.test(q)) {
      return { queryType: 'analysis', lookupTarget: null, analyticsTool: 'customerAnalytics', filters: {} };
    }
  }

  // ── EXPLORATION: open-ended / strategy questions ──────────────────────────
  return { queryType: 'exploration', lookupTarget: null, analyticsTool: null, filters: {} };
}

// ----------------------------------------------------
// 2c. DB Lookup Tools — fetch actual records
// ----------------------------------------------------
async function fetchDelayedShipments(limit = 100) {
  return prisma.order.findMany({
    where: { status: 'DELAYED' },
    include: { customer: true },
    orderBy: { createdAt: 'asc' },
    take: limit
  });
}

async function fetchRecentRefunds(limit = 50) {
  return prisma.refund.findMany({
    include: { order: { include: { customer: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit
  });
}

async function fetchLowStockProducts() {
  return prisma.product.findMany({
    where: { inventory: { lt: 20 } },
    orderBy: { inventory: 'asc' }
  });
}

async function fetchOrders(status?: string, limit = 50) {
  return prisma.order.findMany({
    where: status ? { status: status as any } : {},
    include: { customer: true },
    orderBy: { createdAt: 'desc' },
    take: limit
  });
}

async function fetchCustomers(limit = 30) {
  return prisma.customer.findMany({
    include: { orders: true },
    orderBy: { createdAt: 'desc' },
    take: limit
  });
}

// ----------------------------------------------------
// 3. Natural Response Engine (Planner-first, DB-grounded)
// ----------------------------------------------------

/** Formats a date relative to today ("today", "1 day ago", etc.) */
function relativeDate(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
}

/** Renders a concise row for a delayed shipment */
function shipmentRow(o: any, idx: number): string {
  const days = Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 86_400_000);
  const daysLabel = days === 0 ? 'placed today' : `${days}d overdue`;
  return `${idx + 1}. **${o.orderNumber}** — ${o.customer?.name ?? 'Unknown'} · ₹${Number(o.totalAmount).toLocaleString('en-IN')} · ${daysLabel}`;
}

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
    queryPlan?: QueryPlan;
    lookupData?: any[];
  }
): Promise<string> {
  const query = context.resolvedQuery;
  const intent = context.detectedIntent;
  const toolName = context.selectedTool;
  const meta = context.businessContext;
  const plan = context.queryPlan;

  // ── Ask Mode guard ────────────────────────────────────────────────────────
  if (mode === 'ask' && intent === 'action') {
    const payload = JSON.stringify({ originalRequest: message });
    return `Sorry, I can't execute that in **Ask Mode** — it's read-only. Switch to **Agent Mode** using the toggle above and I'll process it right away.

[SWITCH_TO_AGENT_CARD: ${payload}]`;
  }

  // ── LOOKUP: real record retrieval ─────────────────────────────────────────
  if (plan?.queryType === 'lookup' && context.lookupData !== undefined) {
    const records = context.lookupData;

    // Delayed shipments
    if (plan.lookupTarget === 'shipments') {
      const total = await prisma.order.count();
      if (records.length === 0) {
        return `Good news — there are no delayed shipments right now. All ${total} orders are moving normally.`;
      }
      const shown = records.slice(0, 10);
      const remainder = records.length - shown.length;
      const pct = ((records.length / total) * 100).toFixed(1);
      const oldest = records[0];
      const oldestDays = Math.floor((Date.now() - new Date(oldest.createdAt).getTime()) / 86_400_000);

      return `I pulled up the delayed shipments from the database. Here's what's queued right now:

**${records.length} orders are delayed** out of ${total} total (${pct}% of your active book).

The oldest one, **${oldest.orderNumber}** for ${oldest.customer?.name}, has been waiting ${oldestDays === 0 ? 'since today' : `${oldestDays} day${oldestDays === 1 ? '' : 's'}`}. Here are the top ones to tackle:

${shown.map(shipmentRow).join('\n')}
${remainder > 0 ? `\n...and **${remainder} more** in the queue.` : ''}

Want me to notify the affected customers, escalate to the operations manager, or generate a full SLA report?

[Notify Operations Manager] [Create SLA Report]`;
    }

    // Refunds
    if (plan.lookupTarget === 'refunds') {
      if (records.length === 0) {
        return `No refunds found in the system right now.`;
      }
      const shown = records.slice(0, 10);
      const totalValue = records.reduce((s: number, r: any) => s + Number(r.amount), 0);
      return `Here are the most recent refunds on record:

${shown.map((r: any, i: number) =>
  `${i + 1}. **${r.order?.orderNumber ?? 'N/A'}** — ${r.order?.customer?.name ?? 'Unknown'} · ₹${Number(r.amount).toLocaleString('en-IN')} · Status: ${r.status} · ${relativeDate(new Date(r.createdAt))}`
).join('\n')}

Total refund value across ${records.length} records: **₹${totalValue.toLocaleString('en-IN')}**.

Want to dig into why these refunds are happening, or escalate any specific one?

[Which products are causing most refunds?] [Escalate To Finance]`;
    }

    // Low-stock inventory
    if (plan.lookupTarget === 'inventory') {
      if (records.length === 0) {
        return `All products are above the safety stock threshold right now — no low-stock alerts.`;
      }
      return `Here are the products running low on stock:

${records.map((p: any, i: number) =>
  `${i + 1}. **${p.name}** (${p.sku}) — ${p.inventory} units remaining${p.inventory < 5 ? ' ⚠️ critical' : ''}`
).join('\n')}

I'd recommend raising purchase orders for anything under 10 units before your next promotion push.

[Create Purchase Order] [Notify Supplier]`;
    }

    // Orders
    if (plan.lookupTarget === 'orders') {
      if (records.length === 0) {
        return `No orders found matching that criteria.`;
      }
      const shown = records.slice(0, 10);
      const remainder = records.length - shown.length;
      return `Here are the ${plan.filters.status ? plan.filters.status.toLowerCase() : 'recent'} orders:

${shown.map((o: any, i: number) =>
  `${i + 1}. **${o.orderNumber}** — ${o.customer?.name} · ₹${Number(o.totalAmount).toLocaleString('en-IN')} · ${o.status} · ${relativeDate(new Date(o.createdAt))}`
).join('\n')}
${remainder > 0 ? `\n...and **${remainder} more**.` : ''}`;
    }

    // Customers
    if (plan.lookupTarget === 'customers') {
      const shown = records.slice(0, 10);
      return `Here are the most recent customers:

${shown.map((c: any, i: number) =>
  `${i + 1}. **${c.name}** — ${c.email} · ${c.orders?.length ?? 0} order(s)`
).join('\n')}`;
    }
  }

  // ── ACTION: Discount Creation ─────────────────────────────────────────────
  if (intent === 'action' && (query.includes('discount') || query.includes('coupon') || query.includes('promo'))) {
    const pctMatch = query.match(/(\d+)%/);
    const discountPercent = pctMatch ? parseInt(pctMatch[1]) : 15;
    const codeMatch = query.match(/code\s+([a-zA-Z0-9_-]+)/i) || query.match(/discount\s+([a-zA-Z0-9_-]+)/i) || query.match(/coupon\s+([a-zA-Z0-9_-]+)/i);
    const code = codeMatch ? codeMatch[1].toUpperCase() : `SAVE${discountPercent}`;

    if (discountPercent > 20) {
      const riskAnalysis = {
        riskScore: 65,
        reasons: ['Discount percent exceeds standard policy threshold (20%)', 'Apology reason not accompanied by customer support ticket ID verification'],
        explanation: `A ${discountPercent}% discount on code ${code} exceeds the store's 20% self-serve limit and needs manager sign-off before it goes live.`
      };
      const approval = await prisma.approval.create({
        data: {
          type: 'DISCOUNT_CREATION',
          status: 'PENDING',
          metadata: { code, discountPercent, reasons: riskAnalysis.reasons, riskScore: riskAnalysis.riskScore, explanation: riskAnalysis.explanation }
        }
      });
      const approvalCardPayload = JSON.stringify({ id: approval.id, type: 'DISCOUNT_CREATION', code, amount: discountPercent, riskScore: riskAnalysis.riskScore, explanation: riskAnalysis.explanation });
      return `I've set up coupon **${code}** for **${discountPercent}% off**, but it needs approval before going live.

The reason: a discount above 20% crosses the store's policy threshold (risk score 65/100). I've raised a manager approval request and it's waiting in the Approvals Hub.

Once approved, I'll push it to Shopify and sync with Stripe checkout automatically.

[APPROVAL_CARD: ${approvalCardPayload}]`;
    } else {
      return `Done — coupon **${code}** is live with a **${discountPercent}% discount**.

- Pushed to Shopify checkout ✓
- Synced with Stripe ✓
- Logged in the audit trail ✓

Want to set an expiry date or restrict it to VIP customers?`;
    }
  }

  // ── ACTION: Refund Request ────────────────────────────────────────────────
  if (intent === 'action' && (query.includes('refund') || query.includes('payout'))) {
    if (!meta?.order) {
      return `I couldn't find Order #${context.activeOrderNumber || 'ORD-1024'} in the database. Double-check the order number and try again.`;
    }
    const order = meta.order;
    const customer = meta.customer;
    const amount = meta.order.totalAmount;
    const riskScore = meta.riskScore;
    const explanation = meta.explanation;
    const reasons = meta.reasons;

    const existingRefund = await prisma.refund.findFirst({ where: { orderId: order.id } });
    if (existingRefund) {
      return `A refund for **${order.orderNumber}** was already submitted — it's currently **${existingRefund.status}** (risk score ${existingRefund.riskScore}/100). You can manage it in the Approvals Hub.`;
    }

    const approval = await prisma.approval.create({
      data: {
        type: 'REFUND_REQUEST',
        status: 'PENDING',
        metadata: { orderId: order.id, orderNumber: order.orderNumber, customerName: customer.name, amount, reasons, riskScore, explanation }
      }
    });
    await prisma.refund.create({
      data: {
        orderId: order.id, amount, reason: 'Requested via Chat: Customer dispute / order issue.',
        status: 'PENDING', riskScore, riskExplanation: explanation, approvalId: approval.id
      }
    });
    const approvalCardPayload = JSON.stringify({ id: approval.id, type: 'REFUND_REQUEST', amount, riskScore, explanation });

    const riskLabel = riskScore > 50 ? 'high-risk' : 'low-risk';
    return `I've reviewed **Order #${order.orderNumber}** for **${customer.name}** (${customer.tier}) — total ₹${Number(amount).toLocaleString('en-IN')}.

The refund scores **${riskScore}/100** (${riskLabel}). Here's why it needs approval:
${reasons.map((r: string) => `- ${r}`).join('\n')}

${explanation}

I've queued it in the Approvals Hub. Once a manager approves, the payout goes out and the Zendesk ticket closes automatically.

[APPROVAL_CARD: ${approvalCardPayload}]`;
  }

  // ── ANALYSIS: Tool Registry ───────────────────────────────────────────────
  if (intent === 'analysis' && toolName && businessTools[toolName]) {
    const result = await businessTools[toolName](meta?.conversationContext ?? {});

    const intro: Record<string, string> = {
      shipmentAnalytics: "Looking at the shipment data, here's what's driving the delays:",
      refundAnalytics: "Here's what the return data is telling us:",
      inventoryAnalytics: "Quick look at the inventory picture:",
      customerAnalytics: "Here's what I found on that customer profile:",
      revenueAnalytics: "Here's the current revenue snapshot:"
    };

    const opening = intro[toolName] ?? 'Here is what the data shows:';
    const findingsText = result.findings.join(' ');
    const recText = result.recommendations.map((r: string) => `- ${r}`).join('\n');
    const actionsText = result.actions.map((a: any) => `[${a.label}]`).join(' ');

    return `${opening}

${findingsText}

${recText}

${actionsText}`;
  }

  // ── GENERAL / EXPLORATION ─────────────────────────────────────────────────
  const totalOrders = await prisma.order.count();
  const delayed = await prisma.order.count({ where: { status: 'DELAYED' } });
  const productsCount = await prisma.product.count();
  const refundsCount = await prisma.refund.count({ where: { status: 'APPROVED' } });

  // Greeting
  if (/^(hi|hello|hey|good\s+morning|good\s+evening|yo|greetings)/i.test(query)) {
    const urgency = delayed > 0 ? `One thing worth flagging: **${delayed} orders are currently delayed**, which might need attention. ` : '';
    return `Hey! I'm **OpsPilot**, your AI operations assistant.

${urgency}Here's a quick snapshot of where things stand:
- **${totalOrders}** active orders · **${delayed}** delayed
- **${productsCount}** products in catalog
- **${refundsCount}** refunds approved

I can look up specific records, analyze trends, or execute actions like refunds and promo codes. What do you want to dig into?`;
  }

  // Logistics strategy
  if (query.includes('delay') || query.includes('shipping') || query.includes('carrier') || query.includes('logistics')) {
    const pct = totalOrders > 0 ? ((delayed / totalOrders) * 100).toFixed(1) : '0.0';
    return `Your delay rate is sitting at **${pct}%** right now (${delayed} out of ${totalOrders} orders). That's the main thing I'd focus on.

The pattern we're seeing: most delays trace back to the Bangalore warehouse and FedEx on the carrier side. The fix is usually rerouting BLR dispatches through DHL Express and opening a SLA incident with FedEx account management.

Want me to pull the actual list of delayed orders so you can see who's affected, or run a deeper analysis of what's causing it?

[List delayed shipments] [Why are shipments delayed?]`;
  }

  // Revenue / marketing
  if (query.includes('revenue') || query.includes('sales') || query.includes('sell') || query.includes('marketing') || query.includes('discount')) {
    return `A few things I'd look at to move the needle on revenue:

- Run a targeted promo for VIP customers — a **15% code** is within policy and deploys instantly, no approval needed.
- Clear out the delayed shipments first — unhappy customers don't reorder.
- Check stock levels before pushing any campaign, or you'll generate demand you can't fulfill.

Want me to create a discount code, check inventory, or pull the revenue breakdown?

[Show inventory status] [Create discount code VIPSPECIAL15]`;
  }

  // Refunds / customer satisfaction
  if (query.includes('refund') || query.includes('return') || query.includes('customer') || query.includes('churn')) {
    return `We've got **${refundsCount} approved refunds** on record. The main driver has been packaging damage on Alpha Glow Serum — a supplier spec issue, not a logistics one.

For reducing churn: fast-track refunds under ₹10,000 (low risk, high goodwill), and keep high-value disputes in the approval queue for manager review.

Want me to pull the full refunds list, or dig into which products are driving the most returns?

[Which products are causing most refunds?] [List recent refunds]`;
  }

  // What should I focus on today? (EXPLORATION)
  if (query.includes('focus') || query.includes('today') || query.includes('priority') || query.includes('what should')) {
    const pct = totalOrders > 0 ? ((delayed / totalOrders) * 100).toFixed(1) : '0.0';
    return `Here's what I'd prioritize today:

1. **Delayed shipments** — ${delayed} orders (${pct}%) are stuck. If any are VIP customers, that's churn risk. Worth running a quick lookup.
2. **Pending approvals** — check the Approvals Hub for any refunds or discount requests waiting on you.
3. **Inventory** — if you're planning a promo, verify stock levels first.

Where do you want to start?

[List delayed shipments] [Show inventory status]`;
  }

  // Default
  return `I'm here to help. You can ask me to look up orders, analyze trends, or execute operations. What would you like to do?`;
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

// Gather conversation context, classify intent, run the query planner, fetch
// real DB records for LOOKUP queries, and compile business context for ANALYSIS.
// This is the single source of truth shared by both the buffered and streaming paths.
async function gatherChatContext(messages: ChatMessage[]) {
  const lastMessage = messages[messages.length - 1].content;

  const conversationContext = await parseConversationContext(messages);

  let resolvedQuery = lastMessage.toLowerCase().trim();
  const isProceed = /proceed/i.test(resolvedQuery) || /approve.*it/i.test(resolvedQuery) || /go.*ahead/i.test(resolvedQuery) || /execute/i.test(resolvedQuery) || /do.*it/i.test(resolvedQuery);
  if (isProceed && conversationContext.activeOrderId) {
    resolvedQuery = `refund order ${conversationContext.activeOrderId}`;
  }

  // ── Step 1: Run the planner to determine what kind of request this is ──────
  const plan = planQuery(resolvedQuery, conversationContext);

  // ── Step 2: Fetch actual DB records for LOOKUP queries ─────────────────────
  let lookupData: any[] | undefined;
  if (plan.queryType === 'lookup') {
    try {
      if (plan.lookupTarget === 'shipments') lookupData = await fetchDelayedShipments();
      else if (plan.lookupTarget === 'refunds') lookupData = await fetchRecentRefunds();
      else if (plan.lookupTarget === 'inventory') lookupData = await fetchLowStockProducts();
      else if (plan.lookupTarget === 'orders') lookupData = await fetchOrders(plan.filters.status);
      else if (plan.lookupTarget === 'customers') lookupData = await fetchCustomers();
    } catch (err) {
      console.error('Lookup fetch failed:', err);
      lookupData = [];
    }
  }

  // ── Step 3: Map planner output back to legacy intent fields ───────────────
  // (keeps backward compat with handleMockChat and the OpenAI tool path)
  const selectedTool = plan.queryType === 'analysis' ? plan.analyticsTool : selectBusinessTool(resolvedQuery, conversationContext);

  const isAnalytical = /\b(which|what|why|how\s+many|most|top|driver|reason|cause|causing|show|list|report|analy[sz]e|breakdown|status|overview|trend)\b/i.test(resolvedQuery);
  const hasOrderRef = /ORD-\d+/i.test(resolvedQuery) || /#\d{3,}/.test(resolvedQuery) || !!conversationContext.activeOrderId;
  const refundAction =
    /\b(refund|payout)\b/i.test(resolvedQuery) &&
    !isAnalytical &&
    (hasOrderRef || /\b(process|issue|initiate|give|approve)\b/i.test(resolvedQuery));
  const discountAction =
    /\b(discount|coupon|promo)\b/i.test(resolvedQuery) &&
    (/\b(create|make|generate|add|new|apply|code)\b/i.test(resolvedQuery) || /%/.test(resolvedQuery));

  let detectedIntent: 'analysis' | 'action' | 'general' = 'general';
  if (plan.queryType === 'action' || refundAction || discountAction) {
    detectedIntent = 'action';
  } else if (plan.queryType === 'lookup') {
    detectedIntent = 'general'; // lookup handled via plan, not legacy intent
  } else if (selectedTool) {
    detectedIntent = 'analysis';
  }

  // ── Step 4: Fetch business context (for ANALYSIS and ACTION) ──────────────
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
          order: { id: order.id, orderNumber: order.orderNumber, totalAmount: Number(order.totalAmount), status: order.status, createdAt: order.createdAt },
          customer: { name: order.customer.name, email: order.customer.email, tier: Number(order.totalAmount) > 10000 ? 'VIP' : 'Standard' },
          riskScore: risk.riskScore, reasons: risk.reasons, explanation: risk.explanation
        };
      }
    } else if (selectedTool && businessTools[selectedTool] && plan.queryType !== 'lookup') {
      const toolResult = await businessTools[selectedTool](conversationContext);
      businessContext = { ...businessContext, toolResult };
    }
  } catch (err) {
    console.error('Error compiling DB context for AI:', err);
  }

  const contextPack = {
    resolvedQuery,
    activeOrderNumber: conversationContext.activeOrderId || '',
    activeCustomerName: conversationContext.activeCustomerId || '',
    detectedIntent,
    selectedTool,
    businessContext,
    queryPlan: plan,
    lookupData
  };

  return { lastMessage, conversationContext, resolvedQuery, selectedTool, detectedIntent, businessContext, contextPack, plan, lookupData };
}

function buildSystemMessage(
  mode: 'ask' | 'agent',
  conversationContext: ConversationContext,
  detectedIntent: string,
  selectedTool: string | null,
  businessContext: any
): ChatMessage {
  return {
    role: 'system',
    content: `You are OpsPilot, an AI operations assistant for an e-commerce business.
You have real-time access to the store database through tool calls.

How to respond:
- Be direct and conversational — like a sharp analyst talking to a colleague, not a report generator.
- Do NOT use big headers (###, ####), marketing phrases like "Intent Match: 96%", or template-style formatting.
- When the user asks to LIST or SHOW something, return the actual records in a clean readable list. State the count, show the items, and ask a follow-up question.
- When the user asks WHY or to ANALYZE, explain the data in plain prose. Include numbers. Identify the root cause. Give 2-3 concrete recommendations.
- When the user asks you to DO something (refund, create promo), explain what you're doing and why approval is needed if relevant, then emit [APPROVAL_CARD: ...] or [SWITCH_TO_AGENT_CARD: ...] as required.
- End responses with 1-2 relevant action chips in square brackets e.g. [Notify Operations Manager] [Create SLA Report] — only when it genuinely helps.
- Always use Indian Rupees (₹) for amounts.

Current session state:
- Active order: ${conversationContext.activeOrderId || 'none'}
- Active customer: ${conversationContext.activeCustomerId || 'none'}
- Mode: ${mode === 'ask' ? 'Read-Only (Ask Mode)' : 'Agent Mode (can execute actions)'}
- Live database context:
${JSON.stringify(businessContext, null, 2)}

${mode === 'ask'
  ? `READ-ONLY MODE: Do not perform writes. If the user asks to execute an action, explain they need Agent Mode and append [SWITCH_TO_AGENT_CARD: {"originalRequest": "<their request>"}] at the very end.`
  : `AGENT MODE: When asked to refund, call request_refund. When asked to create a discount, call create_discount. Append [APPROVAL_CARD: ...] from tool output when approval is required.`}`
  };
}

// Executes a single OpenAI tool/function call against the database and returns
// the JSON string payload to feed back to the model.
async function executeToolCall(
  functionName: string,
  args: any,
  conversationContext: ConversationContext
): Promise<string> {
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
    const tickets = await prisma.ticket.findMany({ include: { customer: true } });
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
      const existingRefund = await prisma.refund.findFirst({ where: { orderId: order.id } });

      if (existingRefund) {
        output = JSON.stringify({
          status: 'ALREADY_EXISTS',
          refundStatus: existingRefund.status,
          riskScore: existingRefund.riskScore,
          msg: 'Refund request already submitted previously.'
        });
      } else {
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
  return output;
}

// Builds the [APPROVAL_CARD: ...] markers that are appended to the assistant
// response when a tool run produced an approval or listed pending approvals.
function buildApprovalCardAppends(toolOutputs: any[]): string {
  let appended = '';

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
    appended += `\n\n[APPROVAL_CARD: ${JSON.stringify(cardPayload)}]`;
  }

  const listApprovalsOutput = toolOutputs.find(o => o.name === 'list_pending_approvals');
  if (listApprovalsOutput) {
    try {
      const approvals = JSON.parse(listApprovalsOutput.content);
      if (Array.isArray(approvals)) {
        for (const app of approvals) {
          const meta = app.metadata as any;
          let cardPayload: any = { id: app.id, type: app.type };
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
          appended += `\n\n[APPROVAL_CARD: ${JSON.stringify(cardPayload)}]`;
        }
      }
    } catch (err) {
      console.error('Error parsing list approvals output:', err);
    }
  }

  return appended;
}

// Chunk a fully-formed string into small pieces to mimic token streaming.
// Used for the mock engine and the no-tool agent path (where we already have
// the full text but still want a progressive typing experience).
async function* simulateStream(text: string): AsyncGenerator<string> {
  const words = text.split(' ');
  for (let i = 0; i < words.length; i += 3) {
    const isLast = i + 3 >= words.length;
    yield words.slice(i, i + 3).join(' ') + (isLast ? '' : ' ');
    await new Promise(resolve => setTimeout(resolve, 22));
  }
}

export async function processChat(messages: ChatMessage[], mode: 'ask' | 'agent' = 'agent'): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_API_BASE_URL;
  const modelName = process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini';

  const { lastMessage, conversationContext, selectedTool, detectedIntent, businessContext, contextPack } = await gatherChatContext(messages);

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
    const systemMessage = buildSystemMessage(mode, conversationContext, detectedIntent, selectedTool, businessContext);

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

        const output = await executeToolCall(functionName, args, conversationContext);

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

      // Programmatically append APPROVAL_CARD markers from the tool outputs.
      botContent += buildApprovalCardAppends(toolOutputs);

      return botContent;
    }

    return responseMessage.content || 'Error processing response.';
  } catch (err: any) {
    console.error('OpenAI processing failed, falling back to mock:', err);
    return handleMockChat(lastMessage, mode, contextPack);
  }
}

// ----------------------------------------------------
// 5. Streaming Completion (token-by-token, LLM-chat style)
// ----------------------------------------------------
export async function* streamChat(
  messages: ChatMessage[],
  mode: 'ask' | 'agent' = 'agent'
): AsyncGenerator<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_API_BASE_URL;
  const modelName = process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini';

  const { lastMessage, conversationContext, detectedIntent, selectedTool, businessContext, contextPack } = await gatherChatContext(messages);

  const hasApiKey = apiKey && apiKey.trim() !== '';
  const hasBaseUrl = baseURL && baseURL.trim() !== '';

  // No provider configured → stream the deterministic mock response.
  if (!hasApiKey && !hasBaseUrl) {
    const full = await handleMockChat(lastMessage, mode, contextPack);
    yield* simulateStream(full);
    return;
  }

  try {
    const openai = new OpenAI({
      apiKey: apiKey || 'dummy-key',
      baseURL: baseURL || undefined
    });

    const systemMessage = buildSystemMessage(mode, conversationContext, detectedIntent, selectedTool, businessContext);
    const baseMessages = [systemMessage, ...messages].map(m => ({ role: m.role, content: m.content }));

    // Ask mode is read-only with no tools → stream the completion directly.
    if (mode !== 'agent') {
      const stream = await openai.chat.completions.create({
        model: modelName,
        messages: baseMessages as any,
        temperature: 0.2,
        stream: true
      });
      for await (const part of stream) {
        const delta = part.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
      return;
    }

    // Agent mode: first detect tool calls (non-streamed), then stream the answer.
    const first = await openai.chat.completions.create({
      model: modelName,
      messages: baseMessages as any,
      tools: toolsList,
      tool_choice: 'auto',
      temperature: 0.2
    });

    const responseMessage = first.choices[0].message;

    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const toolOutputs: any[] = [];
      for (const toolCall of responseMessage.tool_calls) {
        const tCall = toolCall as any;
        const functionName = tCall.function.name;
        const args = JSON.parse(tCall.function.arguments);
        const output = await executeToolCall(functionName, args, conversationContext);
        toolOutputs.push({ tool_call_id: toolCall.id, role: 'tool', name: functionName, content: output });
      }

      const stream = await openai.chat.completions.create({
        model: modelName,
        messages: [...baseMessages, responseMessage, ...toolOutputs] as any,
        temperature: 0.2,
        stream: true
      });
      for await (const part of stream) {
        const delta = part.choices[0]?.delta?.content;
        if (delta) yield delta;
      }

      // Append the approval card markers once the natural-language answer is done.
      const cards = buildApprovalCardAppends(toolOutputs);
      if (cards) yield cards;
      return;
    }

    // No tool call: we already have the full content — chunk it for a typing feel.
    yield* simulateStream(responseMessage.content || 'Error processing response.');
  } catch (err: any) {
    console.error('streamChat failed, falling back to mock:', err);
    const full = await handleMockChat(lastMessage, mode, contextPack);
    yield* simulateStream(full);
  }
}

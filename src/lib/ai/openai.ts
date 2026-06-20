/* eslint-disable @typescript-eslint/no-explicit-any */
import { OpenAI } from 'openai';
import { prisma } from '../db/prisma';
import { evaluateRefundRisk } from '../approvals/engine';
import { logToFile } from './logger';

// ----------------------------------------------------
// Endpoint Health Cache
// Avoids repeated DNS timeouts when the custom base URL is unreachable.
// After the first connection failure the endpoint is marked "down" for
// ENDPOINT_CACHE_TTL ms. Requests within that window immediately fall
// through to the local mock engine instead of waiting on a DNS timeout.
// ----------------------------------------------------
const ENDPOINT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let _endpointDown = false;
let _endpointDownAt = 0;

function isEndpointDown(): boolean {
  if (!_endpointDown) return false;
  if (Date.now() - _endpointDownAt > ENDPOINT_CACHE_TTL) {
    // TTL expired — retry the real endpoint
    _endpointDown = false;
    return false;
  }
  return true;
}

function markEndpointDown(err: any): void {
  const isNetworkError =
    err?.code === 'ENOTFOUND' ||
    err?.code === 'ECONNREFUSED' ||
    err?.code === 'ECONNRESET' ||
    err?.cause?.code === 'ENOTFOUND' ||
    err?.cause?.code === 'ECONNREFUSED' ||
    err?.cause?.cause?.code === 'ENOTFOUND' ||
    err?.cause?.cause?.code === 'ECONNREFUSED' ||
    String(err?.message ?? '').includes('getaddrinfo') ||
    String(err?.message ?? '').includes('Connection error');

  if (isNetworkError) {
    _endpointDown = true;
    _endpointDownAt = Date.now();
    const baseURL = process.env.OPENAI_API_BASE_URL ?? 'unknown';
    console.warn(`[OpsPilot] LLM endpoint unreachable (${baseURL}). Falling back to local mock for ${ENDPOINT_CACHE_TTL / 60000} min.`);
  } else {
    console.error('[OpsPilot] LLM call failed:', err?.message ?? err);
  }
}

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
  activeObjectType?: string | null;
  activeObjectId?: string | null;
  activeWorkflow?: string | null;
  workflowState?: string | null;
  workflowMetadata?: any;
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
export async function parseConversationContext(messages: ChatMessage[], chatId?: string): Promise<ConversationContext> {
  const ctx: ConversationContext = {};

  if (chatId && (prisma as any).conversationState) {
    try {
      const dbState = await (prisma as any).conversationState.findUnique({
        where: { chatId }
      });
      if (dbState) {
        ctx.activeObjectType = dbState.activeObjectType;
        ctx.activeObjectId = dbState.activeObjectId;
        ctx.activeWorkflow = dbState.activeWorkflow;
        ctx.workflowState = dbState.workflowState;
        ctx.workflowMetadata = dbState.metadata || {};
        if (dbState.activeObjectType === 'refund' && dbState.activeObjectId) {
          ctx.activeOrderId = dbState.activeObjectId;
        }
      }
    } catch (err) {
      console.error('Failed to load conversation state:', err);
    }
  }

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
export type Timeframe = 'today' | 'yesterday' | 'last_7_days' | 'last_30_days' | 'this_month' | 'all';

export interface QueryPlan {
  queryType: QueryType;
  lookupTarget: 'shipments' | 'refunds' | 'inventory' | 'orders' | 'customers' | null;
  analyticsTool: string | null;
  filters: { status?: string; limit?: number; timeframe?: Timeframe };
}

// ----------------------------------------------------
// Timeframe layer — shared by the LLM tools AND the offline planner so that
// parameter handling ("today", "last week") is correct regardless of path.
// A timeframe is a createdAt lower-bound; 'all' means no date filter.
// ----------------------------------------------------
function timeframeStart(tf: Timeframe): Date | null {
  const now = new Date();
  switch (tf) {
    case 'today': { const d = new Date(now); d.setHours(0, 0, 0, 0); return d; }
    case 'yesterday': { const d = new Date(now); d.setDate(d.getDate() - 1); d.setHours(0, 0, 0, 0); return d; }
    case 'last_7_days': return new Date(now.getTime() - 7 * 86_400_000);
    case 'last_30_days': return new Date(now.getTime() - 30 * 86_400_000);
    case 'this_month': return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'all':
    default: return null;
  }
}

function timeframeLabel(tf: Timeframe): string {
  return {
    today: 'today',
    yesterday: 'yesterday',
    last_7_days: 'the last 7 days',
    last_30_days: 'the last 30 days',
    this_month: 'this month',
    all: 'all time'
  }[tf];
}

/** Extract a timeframe from free text — the offline equivalent of what the
 *  model does natively when it fills a tool's `timeframe` parameter. */
function extractTimeframe(q: string): Timeframe {
  if (/\b(today|right now|currently|at the moment|so far)\b/i.test(q)) return 'today';
  if (/\byesterday\b/i.test(q)) return 'yesterday';
  if (/\b(this week|past week|last week|last 7 days|past 7 days|recent)\b/i.test(q)) return 'last_7_days';
  if (/\bthis month\b/i.test(q)) return 'this_month';
  if (/\b(last month|past month|last 30 days|past 30 days|this quarter)\b/i.test(q)) return 'last_30_days';
  return 'all';
}

// Lookup trigger words: the user wants to *see* records, not understand them.
const LOOKUP_VERBS = /\b(list|show|give me|display|fetch|get|find|what are|what's|whats|what is|which|all the|all delayed|see all|tell me about|pull up|any)\b/i;
// Analysis trigger words: the user wants to *understand* something, not just see rows.
const ANALYSIS_VERBS = /\b(why|analy[sz]e|analysis|trend|cause|root cause|reason|explain|compare|breakdown|how many|impact|insight|diagnose|driv(?:e|ing|er)|spik(?:e|ed|ing)|surg(?:e|ing))\b/i;

// Domain synonyms — maps loose phrasing onto a data domain. Order matters:
// the most specific signals are checked first.
function detectDomain(q: string): QueryPlan['lookupTarget'] | 'revenue' {
  if (/\b(delay|delayed|shipment|shipping|transit|stuck|overdue|backed up|back-?logged|not shipped|unshipped|awaiting dispatch|late|carrier|logistics|fulfil?ment)\b/i.test(q)) return 'shipments';
  if (/\b(refund|refunds|return|returns|chargeback)\b/i.test(q)) return 'refunds';
  if (/\b(revenue|sales|turnover|money|financial|aov|gmv)\b/i.test(q)) return 'revenue';
  if (/\b(inventory|stock|sku|restock|out of stock|low stock|product|catalog)\b/i.test(q)) return 'inventory';
  if (/\b(customer|customers|vip|buyer|shopper)\b/i.test(q)) return 'customers';
  if (/\b(order|orders|invoice|purchase)\b/i.test(q)) return 'orders';
  return null;
}

const ANALYTICS_TOOL: Record<string, string> = {
  shipments: 'shipmentAnalytics',
  refunds: 'refundAnalytics',
  inventory: 'inventoryAnalytics',
  customers: 'customerAnalytics',
  revenue: 'revenueAnalytics',
  orders: 'revenueAnalytics'
};

export function planQuery(queryText: string, ctx: ConversationContext): QueryPlan {
  const q = queryText.toLowerCase().trim();
  const timeframe = extractTimeframe(q);

  // ── ACTION: write operations ──────────────────────────────────────────────
  const isRefundAction =
    /\b(refund|payout)\b/i.test(q) &&
    !/\b(list|show|all|which|why|what|how many|status|report)\b/i.test(q) &&
    (/ORD-\d+/i.test(queryText) || /\b(process|issue|initiate|give|approve)\b/i.test(q));

  const isDiscountAction =
    /\b(discount|coupon|promo)\b/i.test(q) &&
    /\b(create|make|generate|add|new|apply|code)\b/i.test(q);

  if (isRefundAction || isDiscountAction) {
    return { queryType: 'action', lookupTarget: null, analyticsTool: null, filters: { timeframe } };
  }

  const domain = detectDomain(q);
  const wantsUnderstanding = ANALYSIS_VERBS.test(q);
  const isLookup = LOOKUP_VERBS.test(q);

  // ── ANALYSIS wins when the user wants to understand ("show me WHY ... SPIKED")
  if (domain && wantsUnderstanding) {
    if ((domain as string) === 'shipments') ctx.activeAnalysis = 'shipment_delay';
    return { queryType: 'analysis', lookupTarget: null, analyticsTool: ANALYTICS_TOOL[domain], filters: { timeframe } };
  }

  // ── LOOKUP: the user wants actual records ─────────────────────────────────
  if (domain && (isLookup || domain === 'shipments')) {
    if (domain === 'revenue') {
      // "show revenue" has no record list — answer it analytically.
      return { queryType: 'analysis', lookupTarget: null, analyticsTool: 'revenueAnalytics', filters: { timeframe } };
    }
    if (domain === 'shipments') {
      ctx.activeAnalysis = 'shipment_delay';
      return { queryType: 'lookup', lookupTarget: 'shipments', analyticsTool: null, filters: { status: 'DELAYED', timeframe } };
    }
    if (domain === 'orders') {
      const status = /pending/i.test(q) ? 'PENDING'
        : /complet/i.test(q) ? 'COMPLETED'
        : /cancel/i.test(q) ? 'CANCELLED'
        : /refund/i.test(q) ? 'REFUNDED'
        : undefined;
      return { queryType: 'lookup', lookupTarget: 'orders', analyticsTool: null, filters: { status, timeframe } };
    }
    return { queryType: 'lookup', lookupTarget: domain, analyticsTool: null, filters: { timeframe } };
  }

  // ── ANALYSIS fallback for a bare domain mention ("refund drivers") ─────────
  if (domain) {
    if ((domain as string) === 'shipments') ctx.activeAnalysis = 'shipment_delay';
    return { queryType: 'analysis', lookupTarget: null, analyticsTool: ANALYTICS_TOOL[domain], filters: { timeframe } };
  }

  // ── EXPLORATION: open-ended / strategy questions ──────────────────────────
  return { queryType: 'exploration', lookupTarget: null, analyticsTool: null, filters: { timeframe } };
}

// ----------------------------------------------------
// 2c. DB Lookup Tools — fetch actual records
// ----------------------------------------------------
async function fetchDelayedShipments(timeframe: Timeframe = 'all', limit = 100) {
  const start = timeframeStart(timeframe);
  return prisma.order.findMany({
    where: { status: 'DELAYED', ...(start ? { createdAt: { gte: start } } : {}) },
    include: { customer: true },
    orderBy: { createdAt: 'asc' },
    take: limit
  });
}

async function fetchRecentRefunds(timeframe: Timeframe = 'all', limit = 50) {
  const start = timeframeStart(timeframe);
  return prisma.refund.findMany({
    where: start ? { createdAt: { gte: start } } : {},
    include: { order: { include: { customer: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit
  });
}

async function fetchLowStockProducts(threshold = 20) {
  return prisma.product.findMany({
    where: { inventory: { lt: threshold } },
    orderBy: { inventory: 'asc' }
  });
}

async function fetchOrders(status?: string, timeframe: Timeframe = 'all', limit = 50) {
  const start = timeframeStart(timeframe);
  return prisma.order.findMany({
    where: {
      ...(status ? { status: status as any } : {}),
      ...(start ? { createdAt: { gte: start } } : {})
    },
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
  },
  chatId?: string
): Promise<string> {
  const query = context.resolvedQuery;
  const intent = context.detectedIntent;
  const toolName = context.selectedTool;
  const meta = context.businessContext;
  const plan = context.queryPlan;

  // ── 0. Workflow State Machine Interceptor ──────────────────────────────────
  if (chatId && (prisma as any).conversationState) {
    try {
      logToFile(`[MOCK CHAT] Checking workflow state for chatId=${chatId}, message="${message}"`);
      const dbState = await (prisma as any).conversationState.findUnique({
        where: { chatId }
      });
      const activeWorkflow = dbState?.activeWorkflow;
      const workflowState = dbState?.workflowState;
      const metadata = (dbState?.metadata as any) || {};
      logToFile(`[MOCK CHAT] activeWorkflow=${activeWorkflow}, workflowState=${workflowState}, metadata=${JSON.stringify(metadata)}`);

      // A. Discount Creation Workflow
      if (activeWorkflow === 'discount_creation') {
        const q = message.toLowerCase();
        
        // Expiry date config
        if (q.includes('expiry') || q.includes('month') || q.includes('date')) {
          const nextMonth = new Date();
          nextMonth.setMonth(nextMonth.getMonth() + 1);
          const expiryStr = nextMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' });
          
          const updatedMeta = { ...metadata, expiry: expiryStr };
          const hasSegment = !!updatedMeta.segment;
          const nextState = hasSegment ? 'review' : 'draft';

          await prisma.conversationState.update({
            where: { chatId },
            data: {
              workflowState: nextState,
              metadata: updatedMeta
            }
          });

          await prisma.discount.update({
            where: { code: metadata.code },
            data: {
              expiry: expiryStr,
              status: hasSegment ? 'CONFIGURED' : 'DRAFT'
            }
          });

          const wfCardPayload = JSON.stringify({
            activeObjectType: 'discount',
            activeObjectId: metadata.code,
            activeWorkflow: 'discount_creation',
            workflowState: nextState,
            metadata: {
              ...updatedMeta,
              status: hasSegment ? 'CONFIGURED' : 'DRAFT',
              missing: hasSegment ? [] : ['Customer Segment'],
              actions: hasSegment ? ['Publish'] : ['VIP Only', 'Publish']
            }
          });

          return `I've configured the expiry date for coupon **${metadata.code}** to **${expiryStr}**.
${hasSegment ? 'All required parameters are set. The campaign is now ready to review.' : 'The coupon segment is still missing. Restrict it to VIP customers before publishing.'}

[WORKFLOW_CARD: ${wfCardPayload}]`;
        }

        // Segment config
        if (q.includes('vip') || q.includes('segment') || q.includes('customer')) {
          const updatedMeta = { ...metadata, segment: 'VIP Customers Only' };
          const hasExpiry = !!updatedMeta.expiry;
          const nextState = hasExpiry ? 'review' : 'draft';

          await prisma.conversationState.update({
            where: { chatId },
            data: {
              workflowState: nextState,
              metadata: updatedMeta
            }
          });

          await prisma.discount.update({
            where: { code: metadata.code },
            data: {
              segment: 'VIP',
              status: hasExpiry ? 'CONFIGURED' : 'DRAFT'
            }
          });

          const wfCardPayload = JSON.stringify({
            activeObjectType: 'discount',
            activeObjectId: metadata.code,
            activeWorkflow: 'discount_creation',
            workflowState: nextState,
            metadata: {
              ...updatedMeta,
              status: hasExpiry ? 'CONFIGURED' : 'DRAFT',
              missing: hasExpiry ? [] : ['Expiry Date'],
              actions: hasExpiry ? ['Publish'] : ['Set Expiry', 'Publish']
            }
          });

          return `I've restricted coupon **${metadata.code}** to **VIP Customers Only**.
${hasExpiry ? 'All parameters are configured. We are ready to publish.' : 'We still need an expiry date before this goes live.'}

[WORKFLOW_CARD: ${wfCardPayload}]`;
        }

        // Publish Coupon
        if (q.includes('publish') || q.includes('submit') || q.includes('go live')) {
          const code = metadata.code;
          const discountPercent = metadata.discountPercent || 15;

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

            await prisma.conversationState.update({
              where: { chatId },
              data: {
                workflowState: 'approval_required',
                metadata: { ...metadata, approvalId: approval.id, status: 'PENDING_APPROVAL' }
              }
            });

            await prisma.discount.update({
              where: { code },
              data: { status: 'PENDING_APPROVAL' }
            });

            const wfCardPayload = JSON.stringify({
              activeObjectType: 'discount',
              activeObjectId: code,
              activeWorkflow: 'discount_creation',
              workflowState: 'approval_required',
              metadata: {
                ...metadata,
                status: 'PENDING_APPROVAL',
                missing: [],
                actions: []
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

            return `I've requested publisher approval for coupon **${code}**.
Because the discount exceeds our 20% guardrail limit, the system flagged it for review.

Once approved by a manager, the coupon code will immediately sync with Shopify and Stripe checkouts.

[APPROVAL_CARD: ${approvalCardPayload}]
[WORKFLOW_CARD: ${wfCardPayload}]`;
          } else {
            // Auto approve
            await prisma.conversationState.update({
              where: { chatId },
              data: {
                workflowState: 'completed',
                metadata: { ...metadata, status: 'ACTIVE' }
              }
            });

            await prisma.discount.update({
              where: { code },
              data: { status: 'ACTIVE' }
            });

            const wfCardPayload = JSON.stringify({
              activeObjectType: 'discount',
              activeObjectId: code,
              activeWorkflow: 'discount_creation',
              workflowState: 'completed',
              metadata: {
                ...metadata,
                status: 'ACTIVE',
                missing: [],
                actions: []
              }
            });

            return `Done — coupon **${code}** is now **ACTIVE** and published to Stripe and Shopify!
- Pushed to Shopify checkout ✓
- Synced with Stripe ✓
- Logged in the audit trail ✓

[WORKFLOW_CARD: ${wfCardPayload}]`;
          }
        }
      }

      // AA. Product Creation Workflow
      if (activeWorkflow === 'product_creation') {
        const q = message.toLowerCase();
        
        // Set Price
        if (q.includes('price') || q.includes('₹') || q.includes('cost') || q.includes('rate') || q.includes('value')) {
          // Parse price
          const numMatch = q.match(/(\d+)/);
          const priceVal = numMatch ? parseFloat(numMatch[1]) : 1500;
          
          const updatedMeta = { ...metadata, price: priceVal };
          const hasStock = updatedMeta.stock !== null && updatedMeta.stock !== undefined;
          const nextState = hasStock ? 'review' : 'draft';

          await prisma.conversationState.update({
            where: { chatId },
            data: {
              workflowState: nextState,
              metadata: updatedMeta
            }
          });

          const missingFields = [];
          if (!hasStock) missingFields.push('Initial Stock');

          const actions = [];
          if (!hasStock) actions.push('Set Stock');
          if (nextState === 'review') actions.push('Publish Product');

          const wfCardPayload = JSON.stringify({
            activeObjectType: 'product',
            activeObjectId: metadata.sku,
            activeWorkflow: 'product_creation',
            workflowState: nextState,
            metadata: {
              ...updatedMeta,
              missing: missingFields,
              actions
            }
          });

          return `I've configured the price for product **${metadata.name}** to **₹${priceVal.toLocaleString('en-IN')}**.
${hasStock ? 'All required parameters are set. The product is now ready to review and publish.' : 'The stock count is still missing. Configure stock levels before publishing.'}

[WORKFLOW_CARD: ${wfCardPayload}]`;
        }

        // Set Stock
        if (q.includes('stock') || q.includes('qty') || q.includes('quantity') || q.includes('count')) {
          // Parse stock count
          const numMatch = q.match(/(\d+)/);
          const stockVal = numMatch ? parseInt(numMatch[1]) : 100;
          
          const updatedMeta = { ...metadata, stock: stockVal };
          const hasPrice = updatedMeta.price !== null && updatedMeta.price !== undefined;
          const nextState = hasPrice ? 'review' : 'draft';

          await prisma.conversationState.update({
            where: { chatId },
            data: {
              workflowState: nextState,
              metadata: updatedMeta
            }
          });

          const missingFields = [];
          if (!hasPrice) missingFields.push('Price');

          const actions = [];
          if (!hasPrice) actions.push('Set Price');
          if (nextState === 'review') actions.push('Publish Product');

          const wfCardPayload = JSON.stringify({
            activeObjectType: 'product',
            activeObjectId: metadata.sku,
            activeWorkflow: 'product_creation',
            workflowState: nextState,
            metadata: {
              ...updatedMeta,
              missing: missingFields,
              actions
            }
          });

          return `I've configured the initial stock level for **${metadata.name}** to **${stockVal} units**.
${hasPrice ? 'All required parameters are set. The product is now ready to review and publish.' : 'The pricing parameter is still missing. Configure the price before publishing.'}

[WORKFLOW_CARD: ${wfCardPayload}]`;
        }

        // Publish Product
        if (q.includes('publish') || q.includes('submit')) {
          const priceVal = metadata.price || 1500;
          const stockVal = metadata.stock || 100;
          
          // Check for governance threshold: if price > 5000, we require approval
          const needsApproval = priceVal > 5000;
          const nextState = needsApproval ? 'approval_required' : 'completed';

          if (needsApproval) {
            let approvalId = metadata.approvalId;
            if (!approvalId) {
              // Create a pending approval record
              const approval = await prisma.approval.create({
                data: {
                  type: 'INVENTORY_UPDATE',
                  status: 'PENDING',
                  metadata: {
                    sku: metadata.sku,
                    name: metadata.name,
                    price: priceVal,
                    inventory: stockVal,
                    products: [
                      {
                        sku: metadata.sku,
                        name: metadata.name,
                        price: priceVal,
                        inventory: stockVal
                      }
                    ],
                    action: 'create_product',
                    explanation: 'Product price exceeds the ₹5,000 threshold. Manager approval required.'
                  }
                }
              });
              approvalId = approval.id;

              await prisma.conversationState.update({
                where: { chatId },
                data: {
                  workflowState: 'approval_required',
                  metadata: {
                    ...metadata,
                    approvalId: approval.id,
                    actions: []
                  }
                }
              });
            }

            const wfCardPayload = JSON.stringify({
              activeObjectType: 'product',
              activeObjectId: metadata.sku,
              activeWorkflow: 'product_creation',
              workflowState: 'approval_required',
              metadata: {
                ...metadata,
                approvalId: approvalId,
                actions: []
              }
            });

            return `⚠️ **Governance Alert**: The product **${metadata.name}** is priced at **₹${priceVal.toLocaleString('en-IN')}**, which exceeds our **₹5,000 auto-publish threshold**.

A product creation approval request has been dispatched to the **Approvals Hub** (ID: \`${approvalId}\`). The product will be published to the catalog once approved.

[WORKFLOW_CARD: ${wfCardPayload}]`;
          } else {
            // Auto-publish: check if product already exists to prevent unique key violation on regeneration
            const existingProduct = await prisma.product.findUnique({
              where: { sku: metadata.sku }
            });

            if (!existingProduct) {
              await prisma.product.create({
                data: {
                  sku: metadata.sku,
                  name: metadata.name,
                  price: priceVal,
                  inventory: stockVal,
                  category: 'Uncategorized',
                  supplier: 'Manual Creator'
                }
              });

              await prisma.conversationState.update({
                where: { chatId },
                data: {
                  workflowState: 'completed',
                  metadata: {
                    ...metadata,
                    status: 'ACTIVE',
                    actions: []
                  }
                }
              });
            }

            const wfCardPayload = JSON.stringify({
              activeObjectType: 'product',
              activeObjectId: metadata.sku,
              activeWorkflow: 'product_creation',
              workflowState: 'completed',
              metadata: {
                ...metadata,
                status: 'ACTIVE',
                actions: []
              }
            });

            return `✅ **Catalog Success**: Product **${metadata.name}** (SKU: \`${metadata.sku}\`) has been successfully created and published to the inventory!

*   Price: **₹${priceVal.toLocaleString('en-IN')}**
*   Stock: **${stockVal} units**

[WORKFLOW_CARD: ${wfCardPayload}]`;
          }
        }
      }

      // B. Refund Request Workflow
      if (activeWorkflow === 'refund_processing') {
        const q = message.toLowerCase();

        // Reason config
        if (q.includes('reason') || q.includes('because') || q.includes('due to') || q.includes('for')) {
          const reasonStr = message.replace(/reason:?/i, '').trim() || 'Requested via Chat Interface';
          const updatedMeta = { ...metadata, reason: reasonStr };

          await prisma.conversationState.update({
            where: { chatId },
            data: {
              workflowState: 'review',
              metadata: updatedMeta
            }
          });

          const wfCardPayload = JSON.stringify({
            activeObjectType: 'refund',
            activeObjectId: metadata.orderNumber,
            activeWorkflow: 'refund_processing',
            workflowState: 'review',
            metadata: {
              ...updatedMeta,
              status: 'REVIEWING',
              missing: [],
              actions: ['Submit Refund']
            }
          });

          return `I've updated the refund reason for **${metadata.orderNumber}** to: "${reasonStr}".
The request is now ready for final submission.

[WORKFLOW_CARD: ${wfCardPayload}]`;
        }

        // Submit Refund
        if (q.includes('submit') || q.includes('publish') || q.includes('execute') || q.includes('payout')) {
          const orderNum = metadata.orderNumber;
          const order = await prisma.order.findUnique({
            where: { orderNumber: orderNum },
            include: { customer: true }
          });

          if (!order) {
            return `Error: Order #${orderNum} not found in the database.`;
          }

          const amount = Number(order.totalAmount);
          const riskAnalysis = await evaluateRefundRisk(order.id, amount);
          const reasons = riskAnalysis.reasons;
          const riskScore = riskAnalysis.riskScore;
          const explanation = riskAnalysis.explanation;

          const existingRefund = await prisma.refund.findFirst({ where: { orderId: order.id } });
          const isRegenerating = metadata.status === 'PENDING_APPROVAL' || metadata.status === 'COMPLETED';

          if (existingRefund && !isRegenerating) {
            return `A refund for **${order.orderNumber}** has already been created. Current status: **${existingRefund.status}**.`;
          }

          if (amount > 10000 || riskScore > 50) {
            // Requires approval
            let approvalId = metadata.approvalId;
            if (!existingRefund) {
              const approval = await prisma.approval.create({
                data: {
                  type: 'REFUND_REQUEST',
                  status: 'PENDING',
                  metadata: { orderId: order.id, orderNumber: order.orderNumber, customerName: order.customer.name, amount, reasons, riskScore, explanation }
                }
              });
              approvalId = approval.id;

              await prisma.refund.create({
                data: {
                  orderId: order.id,
                  amount,
                  reason: metadata.reason || 'Customer request',
                  status: 'PENDING',
                  riskScore,
                  riskExplanation: explanation,
                  approvalId: approval.id
                }
              });

              await prisma.conversationState.update({
                where: { chatId },
                data: {
                  workflowState: 'approval_required',
                  metadata: { ...metadata, status: 'PENDING_APPROVAL', approvalId: approval.id }
                }
              });
            }

            const wfCardPayload = JSON.stringify({
              activeObjectType: 'refund',
              activeObjectId: orderNum,
              activeWorkflow: 'refund_processing',
              workflowState: 'approval_required',
              metadata: {
                ...metadata,
                status: 'PENDING_APPROVAL',
                missing: [],
                actions: []
              }
            });

            const approvalCardPayload = JSON.stringify({
              id: approvalId,
              type: 'REFUND_REQUEST',
              amount,
              riskScore,
              explanation
            });

            return `I've submitted the refund request for **${orderNum}** (₹${amount.toLocaleString('en-IN')}) for manager approval.
Because this exceeds the 10,000 threshold or is flagged high-risk, it requires sign-off.

[APPROVAL_CARD: ${approvalCardPayload}]
[WORKFLOW_CARD: ${wfCardPayload}]`;
          } else {
            // Low risk auto approve
            let approvalId = metadata.approvalId;
            if (!existingRefund) {
              const approval = await prisma.approval.create({
                data: {
                  type: 'REFUND_REQUEST',
                  status: 'APPROVED',
                  metadata: { orderId: order.id, orderNumber: order.orderNumber, customerName: order.customer.name, amount, reasons, riskScore, explanation }
                }
              });
              approvalId = approval.id;

              await prisma.refund.create({
                data: {
                  orderId: order.id,
                  amount,
                  reason: metadata.reason || 'Customer request',
                  status: 'APPROVED',
                  riskScore,
                  riskExplanation: 'Auto-approved low risk refund.',
                  approvalId: approval.id
                }
              });

              await prisma.conversationState.update({
                where: { chatId },
                data: {
                  workflowState: 'completed',
                  metadata: { ...metadata, status: 'COMPLETED', approvalId: approval.id }
                }
              });

              // Update order status to REFUNDED
              await prisma.order.update({
                where: { id: order.id },
                data: { status: 'REFUNDED' }
              });
            }

            const wfCardPayload = JSON.stringify({
              activeObjectType: 'refund',
              activeObjectId: orderNum,
              activeWorkflow: 'refund_processing',
              workflowState: 'completed',
              metadata: {
                ...metadata,
                status: 'COMPLETED',
                missing: [],
                actions: []
              }
            });

            return `Done — refund for **${orderNum}** (₹${amount.toLocaleString('en-IN')}) has been auto-approved and processed!
- Stripe payout initialized ✓
- Zendesk ticket updated and closed ✓
- Customer notified via email ✓

[WORKFLOW_CARD: ${wfCardPayload}]`;
          }
        }
      }
    } catch (err) {
      console.error('Error running workflow state machine:', err);
    }
  }

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
      const tf = plan.filters.timeframe || 'all';
      const scope = tf === 'all' ? '' : ` (placed ${timeframeLabel(tf)})`;
      const total = await prisma.order.count();
      if (records.length === 0) {
        return tf === 'all'
          ? `Good news — there are no delayed shipments right now. All ${total} orders are moving normally.`
          : `No delayed shipments ${timeframeLabel(tf)}. Nothing in that window needs attention.`;
      }
      const shown = records.slice(0, 10);
      const remainder = records.length - shown.length;
      const pct = ((records.length / total) * 100).toFixed(1);
      const oldest = records[0];
      const oldestDays = Math.floor((Date.now() - new Date(oldest.createdAt).getTime()) / 86_400_000);

      return `I pulled up the delayed shipments${scope} from the database. Here's what's queued:

**${records.length} orders are delayed**${scope} out of ${total} total (${pct}% of your active book).

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

  // ── ACTION: Product Creation ──────────────────────────────────────────────
  const lowerQ = query.toLowerCase();
  if (intent === 'action' && (lowerQ.includes('product') || lowerQ.includes('item') || lowerQ.includes('inventory')) && (lowerQ.includes('create') || lowerQ.includes('add') || lowerQ.includes('new'))) {
    // Match product name
    const nameMatch = query.match(/(?:create|add|new)\s+product\s+([^with|price|stock|qty|in|for]+)/i) || 
                      query.match(/(?:create|add|new)\s+item\s+([^with|price|stock|qty|in|for]+)/i);
    let productName = nameMatch ? nameMatch[1].trim() : 'New Product';
    
    // Clean up trailing/leading spaces or punctuation
    productName = productName.replace(/^(a|an|the)\s+/i, '').replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").trim();
    if (!productName) productName = 'New Product';

    // Match price
    const priceMatch = query.match(/(?:price|₹|rs\.?)\s*(\d+(?:\.\d+)?)/i) || query.match(/(\d+(?:\.\d+)?)\s*(?:inr|rs|rupees)/i);
    const priceVal = priceMatch ? parseFloat(priceMatch[1]) : null;

    // Match stock
    const stockMatch = query.match(/(?:stock|qty|quantity|count)\s*(\d+)/i) || query.match(/(\d+)\s*(?:units|pcs|items)/i);
    const stockVal = stockMatch ? parseInt(stockMatch[1]) : null;

    const sku = productName.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 8) + Math.floor(100 + Math.random() * 900);

    logToFile(`[MOCK CHAT] Creating product: name=${productName}, sku=${sku}, price=${priceVal}, stock=${stockVal}, chatId=${chatId}`);

    const hasPrice = priceVal !== null;
    const hasStock = stockVal !== null;
    const isCompleted = hasPrice && hasStock;
    const nextState = isCompleted ? 'review' : 'draft';

    const missingFields = [];
    if (!hasPrice) missingFields.push('Price');
    if (!hasStock) missingFields.push('Initial Stock');

    const actions = [];
    if (!hasPrice) actions.push('Set Price');
    if (!hasStock) actions.push('Set Stock');
    if (isCompleted) actions.push('Publish Product');

    if (chatId) {
      try {
        await prisma.conversationState.upsert({
          where: { chatId },
          update: {
            activeObjectType: 'product',
            activeObjectId: sku,
            activeWorkflow: 'product_creation',
            workflowState: nextState,
            metadata: { sku, name: productName, price: priceVal, stock: stockVal, status: 'DRAFT' }
          },
          create: {
            chatId,
            activeObjectType: 'product',
            activeObjectId: sku,
            activeWorkflow: 'product_creation',
            workflowState: nextState,
            metadata: { sku, name: productName, price: priceVal, stock: stockVal, status: 'DRAFT' }
          }
        });
        logToFile(`[MOCK CHAT] Upserted conversationState for product_creation to DB successfully`);
      } catch (err: any) {
        logToFile(`[MOCK CHAT] Failed to write product draft state to DB: ${err.message}`);
      }
    }

    const wfCardPayload = JSON.stringify({
      activeObjectType: 'product',
      activeObjectId: sku,
      activeWorkflow: 'product_creation',
      workflowState: nextState,
      metadata: {
        sku,
        name: productName,
        price: priceVal,
        stock: stockVal,
        status: 'DRAFT',
        missing: missingFields,
        actions
      }
    });

    return `I've started a new product creation workflow for **${productName}** (SKU: \`${sku}\`).
${isCompleted ? 'The product draft is ready. Verify details and publish.' : `The product draft is created. We need to configure the ${missingFields.join(' and ')} before publishing.`}

[WORKFLOW_CARD: ${wfCardPayload}]`;
  }

  // ── ACTION: Discount Creation ─────────────────────────────────────────────
  if (intent === 'action' && (query.includes('discount') || query.includes('coupon') || query.includes('promo'))) {
    const pctMatch = query.match(/(\d+)%/);
    const discountPercent = pctMatch ? parseInt(pctMatch[1]) : 15;
    const codeMatch = query.match(/code\s+([a-zA-Z0-9_-]+)/i) || query.match(/discount\s+([a-zA-Z0-9_-]+)/i) || query.match(/coupon\s+([a-zA-Z0-9_-]+)/i);
    const code = codeMatch ? codeMatch[1].toUpperCase() : `SAVE${discountPercent}`;

    logToFile(`[MOCK CHAT] Creating discount: code=${code}, discountPercent=${discountPercent}, chatId=${chatId}`);
    if (chatId) {
      try {
        await prisma.conversationState.upsert({
          where: { chatId },
          update: {
            activeObjectType: 'discount',
            activeObjectId: code,
            activeWorkflow: 'discount_creation',
            workflowState: 'draft',
            metadata: { code, discountPercent, expiry: null, segment: null, status: 'DRAFT' }
          },
          create: {
            chatId,
            activeObjectType: 'discount',
            activeObjectId: code,
            activeWorkflow: 'discount_creation',
            workflowState: 'draft',
            metadata: { code, discountPercent, expiry: null, segment: null, status: 'DRAFT' }
          }
        });

        await prisma.discount.upsert({
          where: { code },
          update: {
            discountPercent,
            expiry: null,
            segment: null,
            status: 'DRAFT'
          },
          create: {
            code,
            discountPercent,
            expiry: null,
            segment: null,
            status: 'DRAFT'
          }
        });
        logToFile(`[MOCK CHAT] Upserted conversationState and discount to DB successfully`);
      } catch (err: any) {
        logToFile(`[MOCK CHAT] Failed to write discount draft to DB: ${err.message}`);
        console.error('Failed to write discount draft to DB:', err);
      }
    } else {
      logToFile(`[MOCK CHAT] Skip DB write because chatId is falsy`);
    }

    const wfCardPayload = JSON.stringify({
      activeObjectType: 'discount',
      activeObjectId: code,
      activeWorkflow: 'discount_creation',
      workflowState: 'draft',
      metadata: {
        code,
        discountPercent,
        expiry: null,
        segment: null,
        status: 'DRAFT',
        missing: ['Expiry Date', 'Customer Segment'],
        actions: ['Set Expiry', 'VIP Only', 'Publish']
      }
    });

    return `I've started a new discount creation workflow for coupon code **${code}** with a **${discountPercent}% discount**.
The coupon draft is ready. We need to set an expiry date and specify a customer segment before publishing it.

[WORKFLOW_CARD: ${wfCardPayload}]`;
  }

  // ── ACTION: Refund Request ────────────────────────────────────────────────
  if (intent === 'action' && (query.includes('refund') || query.includes('payout'))) {
    if (!meta?.order) {
      return `I couldn't find Order #${context.activeOrderNumber || 'ORD-1024'} in the database. Double-check the order number and try again.`;
    }
    const order = meta.order;
    const customer = meta.customer;
    const amount = Number(order.totalAmount);
    
    if (chatId) {
      try {
        await prisma.conversationState.upsert({
          where: { chatId },
          update: {
            activeObjectType: 'refund',
            activeObjectId: order.orderNumber,
            activeWorkflow: 'refund_processing',
            workflowState: 'draft',
            metadata: { orderNumber: order.orderNumber, customerName: customer.name, amount, reason: null, status: 'DRAFT' }
          },
          create: {
            chatId,
            activeObjectType: 'refund',
            activeObjectId: order.orderNumber,
            activeWorkflow: 'refund_processing',
            workflowState: 'draft',
            metadata: { orderNumber: order.orderNumber, customerName: customer.name, amount, reason: null, status: 'DRAFT' }
          }
        });
      } catch (err) {
        console.error('Failed to write refund state to DB:', err);
      }
    }

    const wfCardPayload = JSON.stringify({
      activeObjectType: 'refund',
      activeObjectId: order.orderNumber,
      activeWorkflow: 'refund_processing',
      workflowState: 'draft',
      metadata: {
        orderNumber: order.orderNumber,
        customerName: customer.name,
        amount,
        reason: null,
        status: 'DRAFT',
        missing: ['Reason for Refund'],
        actions: ['Set Reason']
      }
    });

    return `I've initiated a refund processing workflow for **Order #${order.orderNumber}** (₹${amount.toLocaleString('en-IN')}).
Please provide a reason for the refund before we submit it.

[WORKFLOW_CARD: ${wfCardPayload}]`;
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

  // Show active discount campaigns
  if (
    query.includes('active discount') || 
    query.includes('active campaign') || 
    query.includes('list discount') || 
    query.includes('list campaign') ||
    query.includes('show discount')
  ) {
    const pendingDiscounts = await prisma.approval.findMany({ where: { type: 'DISCOUNT_CREATION', status: 'PENDING' } });
    const approvedDiscounts = await prisma.approval.findMany({ where: { type: 'DISCOUNT_CREATION', status: 'APPROVED' } });
    
    let listText = `Here are the active and pending discount campaigns in our store:
 
1. **VIP10** — 10% OFF · Status: **ACTIVE** · Safe-mode auto-deployment
2. **SAVE20** — 20% OFF · Status: **ACTIVE** · Safe-mode auto-deployment\n`;
 
    if (approvedDiscounts.length > 0) {
      approvedDiscounts.forEach((d: any, idx: number) => {
        const m = d.metadata as any;
        listText += `${idx + 3}. **${m.code || 'COUPON'}** — ${m.discountPercent}% OFF · Status: **ACTIVE** · Approved by Manager · ${relativeDate(new Date(d.updatedAt))}\n`;
      });
    }
 
    if (pendingDiscounts.length > 0) {
      listText += `\n**Pending Manager Review:**\n`;
      pendingDiscounts.forEach((d: any) => {
        const m = d.metadata as any;
        listText += `- **${m.code || 'COUPON'}** — ${m.discountPercent}% OFF · Status: **PENDING APPROVAL** · Risk score: ${m.riskScore || 65}/100\n`;
      });
    } else {
      listText += `\nNo pending discount approvals in queue.`;
    }
 
    return `${listText}
 
Want me to create a new promo code, review the safety policy, or go to Approvals Hub?
 
[Create discount code VIPSPECIAL15] [Check discount coupon governance policy]`;
  }
 
  // Check discount coupon governance policy
  if (
    query.includes('governance policy') || 
    query.includes('coupon policy') || 
    query.includes('discount policy') ||
    query.includes('safety policy')
  ) {
    return `### AI Governance Policy: Promotional Discounts
 
To protect store revenue and prevent coupon abuse, OpsPilot enforces three guardrails:
1. **Discount Cap**: Coupons with discount values **under or equal to 20%** are classified as low-risk and will auto-deploy immediately to checkout channels.
2. **Approval Gate**: Any coupon request exceeding **20% discount** is flagged as high-risk (Risk Score: 65/100) and requires explicit manager approval in the Approvals Hub.
3. **Execution Sync**: Upon approval, coupon rules are securely provisioned on Shopify and Stripe checkout gateway APIs via background worker executions.
 
Would you like to test these safety gates by creating a coupon now?
 
[Create discount code VIP10 with 10% discount] [Create discount code promo50 with 50% discount]`;
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
// Read tools are safe in any mode (including Ask/read-only).
const readTools = [
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
      name: 'get_orders',
      description: 'Retrieve e-commerce orders, optionally filtered by status and a timeframe. Use this for "list/show orders".',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['PENDING', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DELAYED'], description: 'Filter by order status' },
          timeframe: { type: 'string', enum: ['today', 'yesterday', 'last_7_days', 'last_30_days', 'this_month', 'all'], description: 'Restrict to orders placed within this window (default all)' }
        }
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_shipments',
      description: 'Retrieve the delayed-shipment backlog (orders in DELAYED status). Use for "delayed shipments", "what is overdue", "stuck orders", optionally scoped by timeframe.',
      parameters: {
        type: 'object',
        properties: {
          timeframe: { type: 'string', enum: ['today', 'yesterday', 'last_7_days', 'last_30_days', 'this_month', 'all'], description: 'Restrict to delayed orders placed within this window (default all)' }
        }
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_refunds',
      description: 'Retrieve refund records with their order and customer, optionally scoped by timeframe. Use for "list refunds", "refunds this week".',
      parameters: {
        type: 'object',
        properties: {
          timeframe: { type: 'string', enum: ['today', 'yesterday', 'last_7_days', 'last_30_days', 'this_month', 'all'], description: 'Restrict to refunds created within this window (default all)' }
        }
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_inventory',
      description: 'Retrieve products at or below a stock threshold. Use for "low stock", "what needs restocking".',
      parameters: {
        type: 'object',
        properties: {
          threshold: { type: 'number', description: 'Stock level at/under which to flag a product (default 20)' }
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
  }
];

// Write tools mutate the store and are only offered in Agent mode.
const writeTools = [
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

// Ask mode → reads only. Agent mode → reads + writes.
const toolsList = [...readTools, ...writeTools];
function toolsForMode(mode: 'ask' | 'agent') {
  return mode === 'agent' ? toolsList : readTools;
}

// Gather conversation context, classify intent, run the query planner, fetch
// real DB records for LOOKUP queries, and compile business context for ANALYSIS.
// This is the single source of truth shared by both the buffered and streaming paths.
async function gatherChatContext(messages: ChatMessage[], chatId?: string) {
  const lastMessage = messages[messages.length - 1].content;

  const conversationContext = await parseConversationContext(messages, chatId);

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
      const tf = plan.filters.timeframe || 'all';
      if (plan.lookupTarget === 'shipments') lookupData = await fetchDelayedShipments(tf);
      else if (plan.lookupTarget === 'refunds') lookupData = await fetchRecentRefunds(tf);
      else if (plan.lookupTarget === 'inventory') lookupData = await fetchLowStockProducts();
      else if (plan.lookupTarget === 'orders') lookupData = await fetchOrders(plan.filters.status, tf);
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
  const productAction =
    /\b(product|item|inventory)\b/i.test(resolvedQuery) &&
    /\b(create|add|new)\b/i.test(resolvedQuery);

  let detectedIntent: 'analysis' | 'action' | 'general' = 'general';
  if (plan.queryType === 'action' || refundAction || discountAction || productAction) {
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
    content: `You are OpsPilot, a highly interactive AI operations assistant for an e-commerce business.
Your goal is to provide a smooth, ChatGPT-like conversational experience with deep context awareness and analytical depth.

Core Operating Guidelines:
1. **Interactive & Context-Aware**: Always analyze the full chat history. Maintain continuity. If the user asks follow-up questions like "why are they delayed?" or "what about Sarah?", connect it to the preceding turns.
2. **Explain Data & Database Constraints**: When asked why a shipment is delayed, explain the underlying issues. The database schema lacks carrier details (like tracking numbers, courier names) or warehouse locations. Explain this constraint to the user conversationally if they ask for details not in the schema.
3. **Inspect Support Tickets**: When analyzing delays, always query customer support tickets using the 'list_tickets' tool to cross-reference customer complaints (e.g., package stuck, damaged in transit) and explain these reasons clearly.
4. **No Empty Responses or Tool Loops**: Never repeatedly call the same tool in a loop. If a tool doesn't yield the required information or if there is a schema limitation, explain the limitation clearly and suggest next steps.
5. **Fetching data**: ALWAYS call a tool, never guess from memory:
   - Delayed/stuck/overdue shipments → get_shipments(timeframe). Use timeframe="today" for "today", "last_7_days" for "this week", etc. Default "all" = the full backlog.
   - Refunds/returns → get_refunds(timeframe). Orders → get_orders(status, timeframe). Low/out-of-stock → get_inventory(threshold). Catalog → list_products. Tickets → list_tickets. Pending approvals → list_pending_approvals.
   - Extract the timeframe and any status filter from the user's wording and pass them as parameters.

How to respond:
- Be direct and conversational — like a sharp analyst talking to a colleague, not a template or report generator. Provide depth, explanations, and insights.
- Do NOT use big headers (###, ####), marketing phrases like "Intent Match: 96%", or template-style formatting. Use clean markdown formatting.
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
  } else if (functionName === 'get_orders' || functionName === 'list_orders') {
    const orders = await fetchOrders(args.status, (args.timeframe as Timeframe) || 'all');
    output = JSON.stringify({ count: orders.length, timeframe: args.timeframe || 'all', orders });
  } else if (functionName === 'get_shipments') {
    const delayed = await fetchDelayedShipments((args.timeframe as Timeframe) || 'all');
    const totalOrders = await prisma.order.count();
    output = JSON.stringify({ delayed_count: delayed.length, total_orders: totalOrders, timeframe: args.timeframe || 'all', shipments: delayed });
  } else if (functionName === 'get_refunds') {
    const refunds = await fetchRecentRefunds((args.timeframe as Timeframe) || 'all');
    const totalValue = refunds.reduce((s, r) => s + Number(r.amount), 0);
    output = JSON.stringify({ count: refunds.length, total_value: totalValue, timeframe: args.timeframe || 'all', refunds });
  } else if (functionName === 'get_inventory') {
    const products = await fetchLowStockProducts(typeof args.threshold === 'number' ? args.threshold : 20);
    output = JSON.stringify({ low_stock_count: products.length, threshold: args.threshold || 20, products });
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
          const cardPayload: any = { id: app.id, type: app.type };
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

export async function processChat(messages: ChatMessage[], mode: 'ask' | 'agent' = 'agent', chatId?: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_API_BASE_URL;
  const modelName = process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini';

  const { lastMessage, conversationContext, selectedTool, detectedIntent, businessContext, contextPack } = await gatherChatContext(messages, chatId);

  const hasApiKey = apiKey && apiKey.trim() !== '';
  const hasBaseUrl = baseURL && baseURL.trim() !== '';

  if (!hasApiKey && !hasBaseUrl) {
    return handleMockChat(lastMessage, mode, contextPack, chatId);
  }

  try {
    const openai = new OpenAI({
      apiKey: apiKey || 'dummy-key',
      baseURL: baseURL || undefined,
      timeout: 8000,   // fail fast — 8 s hard cap
      maxRetries: 0    // no SDK-level retries; we handle fallback ourselves
    });
    
    // Inject the structured conversation memory + real database figures directly in system prompt
    const systemMessage = buildSystemMessage(mode, conversationContext, detectedIntent, selectedTool, businessContext);

    // Keep only the last 10 messages of history to conserve tokens during demo
    const historyLimit = 10;
    const truncatedHistory = messages.slice(-historyLimit);
    const apiMessages = [systemMessage, ...truncatedHistory];

    // Call OpenAI
    const response = await openai.chat.completions.create({
      model: modelName,
      messages: apiMessages.map(m => ({ role: m.role, content: m.content })),
      tools: toolsForMode(mode),       // reads in Ask mode, reads + writes in Agent mode
      tool_choice: 'auto',
      temperature: 0.2,
      max_tokens: 800
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
          ...truncatedHistory.map(m => ({ role: m.role, content: m.content })),
          responseMessage,
          ...toolOutputs as any
        ],
        temperature: 0.2,
        max_tokens: 800
      });

      let botContent = secondResponse.choices[0].message.content || 'Error executing assistant response.';

      // Programmatically append APPROVAL_CARD markers from the tool outputs.
      botContent += buildApprovalCardAppends(toolOutputs);

      return botContent;
    }

    return responseMessage.content || 'Error processing response.';
  } catch (err: any) {
    markEndpointDown(err);
    const errMessage = err?.message ?? String(err);
    return `⚠️ **LLM Connection Failed**: ${errMessage}\n\n*Please verify that your \`OPENAI_API_KEY\` and \`OPENAI_API_BASE_URL\` are correct.*`;
  }
}

// ----------------------------------------------------
// 5. Streaming Completion (token-by-token, LLM-chat style)
// ----------------------------------------------------
export async function* streamChat(
  messages: ChatMessage[],
  mode: 'ask' | 'agent' = 'agent',
  chatId?: string
): AsyncGenerator<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_API_BASE_URL;
  const modelName = process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini';

  const { lastMessage, conversationContext, detectedIntent, selectedTool, businessContext, contextPack } = await gatherChatContext(messages, chatId);

  const hasApiKey = apiKey && apiKey.trim() !== '';
  const hasBaseUrl = baseURL && baseURL.trim() !== '';

  if (!hasApiKey && !hasBaseUrl) {
    const full = await handleMockChat(lastMessage, mode, contextPack, chatId);
    yield* simulateStream(full);
    return;
  }

  try {
    const openai = new OpenAI({
      apiKey: apiKey || 'dummy-key',
      baseURL: baseURL || undefined,
      timeout: 8000,   // fail fast — 8 s hard cap
      maxRetries: 0    // no SDK-level retries; we handle fallback ourselves
    });

    const systemMessage = buildSystemMessage(mode, conversationContext, detectedIntent, selectedTool, businessContext);
    
    // Keep only the last 10 messages of history to conserve tokens during demo
    const historyLimit = 10;
    const truncatedHistory = messages.slice(-historyLimit);
    const baseMessages = [systemMessage, ...truncatedHistory].map(m => ({ role: m.role, content: m.content }));

    // Both modes can call tools (Ask gets reads only). First detect tool calls
    // (non-streamed), run them, then stream the natural-language answer.
    const first = await openai.chat.completions.create({
      model: modelName,
      messages: baseMessages as any,
      tools: toolsForMode(mode),
      tool_choice: 'auto',
      temperature: 0.2,
      max_tokens: 800
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
        stream: true,
        max_tokens: 800
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
    const errMessage = err?.message ?? String(err);
    logToFile(`[streamChat ERROR] LLM call failed: ${errMessage}. Config: model=${modelName}, baseURL=${baseURL}, hasApiKey=${hasApiKey}`);
    markEndpointDown(err);
    yield `⚠️ **LLM Connection Failed**: ${errMessage}\n\n*Please verify that your \`OPENAI_API_KEY\` and \`OPENAI_API_BASE_URL\` are correct.*`;
  }
}

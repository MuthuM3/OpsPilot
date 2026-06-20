import { prisma } from '../db/prisma';
import { OpenAI } from 'openai';

export interface RiskAnalysis {
  riskScore: number;
  requiresApproval: boolean;
  explanation: string;
  reasons: string[];
}

export async function evaluateRefundRisk(
  orderId: string,
  refundAmount: number
): Promise<RiskAnalysis> {
  // Fetch order, customer, previous refunds, and support tickets
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: {
        include: {
          orders: {
            where: {
              status: 'REFUNDED'
            }
          },
          tickets: {
            where: {
              status: { in: ['OPEN', 'IN_PROGRESS'] }
            }
          }
        }
      }
    }
  });

  if (!order) {
    throw new Error(`Order with ID ${orderId} not found`);
  }

  const customer = order.customer;
  
  // Calculate previous refund count
  // We can query the Refund table directly for this customer's orders
  const previousRefundsCount = await prisma.refund.count({
    where: {
      order: { customerId: customer.id },
      status: 'APPROVED'
    }
  });

  const reasons: string[] = [];
  let riskScore = 10; // Base risk score

  // 1. Amount threshold (Amount > ₹10,000)
  if (refundAmount > 10000) {
    riskScore += 40;
    reasons.push(`High value refund: ₹${refundAmount.toLocaleString('en-IN')} (threshold is ₹10,000)`);
  }

  // 2. Customer refund frequency
  if (previousRefundsCount >= 2) {
    riskScore += 35;
    reasons.push(`Frequent refund customer: ${previousRefundsCount} previous refunds on file`);
  } else if (previousRefundsCount === 1) {
    riskScore += 15;
    reasons.push('Customer has 1 previous refund');
  }

  // 3. Open support disputes/tickets
  const openTicketsCount = customer.tickets.length;
  if (openTicketsCount > 0) {
    riskScore += 15;
    reasons.push(`Active customer support dispute: ${openTicketsCount} open ticket(s)`);
  }

  // Cap score at 100, minimum at 0
  riskScore = Math.min(100, Math.max(0, riskScore));
  const requiresApproval = riskScore > 50 || refundAmount > 10000;

  // Generate explanation
  let explanation = '';
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey && apiKey.trim() !== '') {
    try {
      const openai = new OpenAI({ apiKey });
      const prompt = `You are an AI E-commerce Risk Officer. Evaluate the refund request risk.
Order: ${order.orderNumber}
Customer: ${customer.name}
Refund Amount: ₹${refundAmount}
Previous Refunds: ${previousRefundsCount}
Open Tickets: ${openTicketsCount}
Calculated Risk Score: ${riskScore}/100
Flags identified:
${reasons.map(r => `- ${r}`).join('\n')}

Write a concise 2-3 sentence risk explanation justifying the governance decision (e.g. why it requires approval or why it is flagged). Keep it highly professional, factual, and direct.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2
      });
      explanation = response.choices[0].message.content?.trim() || '';
    } catch (err) {
      console.error('AI risk explanation failed, falling back to rule-based template:', err);
      explanation = generateDefaultExplanation(customer.name, refundAmount, previousRefundsCount, openTicketsCount, riskScore);
    }
  } else {
    explanation = generateDefaultExplanation(customer.name, refundAmount, previousRefundsCount, openTicketsCount, riskScore);
  }

  return {
    riskScore,
    requiresApproval,
    explanation,
    reasons
  };
}

function generateDefaultExplanation(
  customerName: string,
  amount: number,
  prevCount: number,
  openTickets: number,
  score: number
): string {
  const flags = [];
  if (amount > 10000) flags.push(`refund value (₹${amount.toLocaleString('en-IN')}) exceeds ₹10,000`);
  if (prevCount >= 2) flags.push(`customer has high refund count (${prevCount} historical refunds)`);
  if (openTickets > 0) flags.push(`there is an active open dispute ticket`);

  if (flags.length === 0) {
    return `Refund is within normal operational parameters. Risk score is low (${score}/100) and no governance policy flags were triggered.`;
  }

  return `Manual review and approval required because ${flags.join(', and ')}. The calculated risk score is ${score}/100, indicating a heightened need for oversight.`;
}

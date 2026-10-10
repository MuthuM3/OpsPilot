export interface OverviewMetrics {
  ordersCount: number;
  pendingApprovalsCount: number;
  lowStockCount: number;
  delayedShipmentsCount: number;
}

export function summarizeOperations(metrics?: OverviewMetrics) {
  if (!metrics || [metrics.ordersCount, metrics.pendingApprovalsCount, metrics.lowStockCount, metrics.delayedShipmentsCount]
    .some(value => !Number.isInteger(value) || value < 0)) return null;
  const alerts = [
    { count: metrics.delayedShipmentsCount, label: 'Delayed shipments', href: '/dashboard#demo-guide' },
    { count: metrics.lowStockCount, label: 'Low-stock products', href: '/inventory' },
    { count: metrics.pendingApprovalsCount, label: 'Pending approvals', href: '/approvals' },
  ].filter(alert => alert.count > 0);
  return { metrics, alerts, status: alerts.length ? 'Needs attention' : 'No flagged items' };
}

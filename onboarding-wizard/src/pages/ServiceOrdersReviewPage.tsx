import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { RepairOrderMatch, RepairOrderUpdatePayload } from '../../shared/onboarding';
import { onboardingApi } from '../services/onboardingApi';

export default function ServiceOrdersReviewPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [isSkippingAll, setIsSkippingAll] = useState(false);
  const [isMarkingSelected, setIsMarkingSelected] = useState(false);

  // Fetch repair orders from API
  const { data: apiData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['repairOrders', customerId],
    queryFn: () => onboardingApi.fetchRepairOrders(customerId!),
    enabled: !!customerId,
  });

  const orders = apiData?.repairOrders || [];

  // Mutation for updating repair orders
  const updateMutation = useMutation({
    mutationFn: async ({ orderId, payload }: { orderId: string; payload: RepairOrderUpdatePayload }) => {
      return onboardingApi.updateRepairOrder(customerId!, orderId, payload);
    },
    onSuccess: () => {
      // Refresh data immediately to avoid delay
      refetch();
      setEditingOrder(null);
    },
  });

  // Group orders by status
  const { needsAttention, validated, legacy } = useMemo(() => {
    return {
      needsAttention: orders.filter(o => o.status === 'pending'),
      validated: orders.filter(o => o.status === 'validated'),
      legacy: orders.filter(o => o.status === 'legacy'),
    };
  }, [orders]);

  const totalRevenue = orders.reduce((sum, o) => sum + (o.grandTotal || 0), 0);
  const totalPaid = orders.reduce((sum, o) => sum + (o.paidAmount || 0), 0);
  const totalOutstanding = orders.reduce((sum, o) => sum + (o.balanceDue || 0), 0);

  const handleSelectAll = () => {
    setSelectedIds(new Set(needsAttention.map(o => o.repairOrderId)));
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleToggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleMarkAsLegacy = async (ids: string[]) => {
    setIsMarkingSelected(true);
    try {
      for (const orderId of ids) {
        await updateMutation.mutateAsync({
          orderId,
          payload: { markAsLegacy: true }
        });
      }
      setSelectedIds(new Set());
    } finally {
      setIsMarkingSelected(false);
    }
  };

  const handleSkipAll = async () => {
    setIsSkippingAll(true);
    try {
      const allIds = needsAttention.map(o => o.repairOrderId);
      for (const orderId of allIds) {
        await updateMutation.mutateAsync({
          orderId,
          payload: { markAsLegacy: true }
        });
      }
    } finally {
      setIsSkippingAll(false);
    }
  };

  const handleRemoveFromLegacy = async (orderId: string) => {
    await updateMutation.mutateAsync({
      orderId,
      payload: { markAsLegacy: false }
    });
  };

  const handleQuickFix = (order: RepairOrderMatch, field: string) => {
    setEditingOrder({ id: order.repairOrderId, field });
    const value = order[field as keyof RepairOrderMatch];
    setEditValue(typeof value === 'number' ? value.toString() : (value as string) || '');
  };

  const handleSaveQuickFix = async () => {
    if (!editingOrder) return;

    const payload: RepairOrderUpdatePayload = {};
    const field = editingOrder.field as keyof RepairOrderUpdatePayload;

    // Parse numbers for financial fields
    if (['laborTotal', 'partsTotal', 'taxTotal', 'outsideTotal', 'discountTotal', 'odometer'].includes(field)) {
      payload[field] = parseFloat(editValue) || 0;
    } else {
      payload[field] = editValue;
    }

    await updateMutation.mutateAsync({
      orderId: editingOrder.id,
      payload
    });
  };

  const handleCancelQuickFix = () => {
    setEditingOrder(null);
    setEditValue('');
  };

  const toggleExpanded = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="wizard-container">
        <div className="panel" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>⏳</div>
          <h2>Loading service orders...</h2>
          <p style={{ color: 'var(--color-text-secondary)' }}>Please wait while we fetch repair order data.</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (isError) {
    return (
      <div className="wizard-container">
        <div className="panel" style={{ textAlign: 'center', padding: 'var(--space-2xl)', background: '#fee2e2', borderColor: '#fca5a5' }}>
          <div style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>❌</div>
          <h2>Error loading service orders</h2>
          <p style={{ color: '#991b1b' }}>{(error as Error)?.message || 'Failed to load repair order data'}</p>
          <button onClick={() => navigate('/onboarding')} className="button" style={{ marginTop: 'var(--space-lg)' }}>
            ← Back to start
          </button>
        </div>
      </div>
    );
  }

  // Show no data state
  if (orders.length === 0) {
    return (
      <div className="wizard-container">
        <div className="panel" style={{ textAlign: 'center', padding: 'var(--space-2xl)', background: '#fef3c7', borderColor: '#fde047' }}>
          <div style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>📭</div>
          <h2>No service order data</h2>
          <p style={{ color: '#854d0e' }}>This entity has no repair order records to display.</p>
          <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'center', marginTop: 'var(--space-lg)' }}>
            <button onClick={() => navigate(`/onboarding/${customerId}/parts`)} className="button button-secondary">
              ← Back to parts
            </button>
            <button onClick={() => navigate(`/onboarding/${customerId}/financial`)} className="button">
              Continue to financial →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wizard-container">
      <div className="wizard-header">
        <button onClick={() => navigate(`/customer/${customerId}`)} className="button button-secondary">
          ← Back
        </button>
        <div>
          <h2>Review Service Orders</h2>
          <p>Validate repair order data before migration</p>
        </div>
      </div>

      <nav style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-md) 0' }}>
        <button className="button button-secondary" onClick={() => navigate(`/onboarding/${customerId}/parts`)}>
          ← Back to parts
        </button>
        <button className="button" onClick={() => navigate(`/onboarding/${customerId}/financial`)}>
          Continue to financial →
        </button>
      </nav>

      {/* Legacy explanation panel */}
      <div className="panel" style={{ background: '#eff6ff', borderColor: '#bfdbfe', marginBottom: 'var(--space-lg)' }}>
        <h4>💡 About Legacy Service Orders</h4>
        <p>Can't complete all repair order data right now? Mark orders as "legacy" to import them as-is.</p>
        <ul style={{ marginTop: 'var(--space-sm)', paddingLeft: 'var(--space-lg)' }}>
          <li><strong>Financial data is preserved</strong> - All invoices and payment records remain intact</li>
          <li>Historical records maintained for reporting</li>
          <li>Can be updated later if needed</li>
        </ul>
        <div style={{ marginTop: 'var(--space-sm)', padding: 'var(--space-sm)', background: '#dbeafe', borderRadius: 'var(--radius-md)' }}>
          <strong>Priority:</strong> Financial data is critical. Service orders with valid invoices should always be imported.
        </div>
      </div>

      {/* Financial stats summary */}
      <div className="stats-grid" style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="stat-card">
          <div className="stat-value">{needsAttention.length}</div>
          <div className="stat-label">Need Attention</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{validated.length}</div>
          <div className="stat-label">Validated</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: '1.5rem' }}>${totalRevenue.toLocaleString()}</div>
          <div className="stat-label">Total Revenue</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: '1.5rem', color: totalOutstanding > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
            ${totalOutstanding.toLocaleString()}
          </div>
          <div className="stat-label">Outstanding Balance</div>
        </div>
      </div>

      {/* Needs Attention Section */}
      {needsAttention.length > 0 && (
        <section style={{ marginBottom: 'var(--space-2xl)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
            <h3>Needs Attention ({needsAttention.length})</h3>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button
                onClick={handleSkipAll}
                className="button"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#991b1b' }}
                disabled={isSkippingAll}
              >
                {isSkippingAll ? (
                  <>
                    <span className="spinner" style={{ marginRight: '8px' }}></span>
                    Marking as legacy...
                  </>
                ) : (
                  'Skip all & import as legacy'
                )}
              </button>
              <button onClick={handleSelectAll} className="button button-secondary">
                Select all
              </button>
              <button onClick={handleClearSelection} className="button button-secondary">
                Clear
              </button>
            </div>
          </div>

          {/* Selected actions */}
          {selectedIds.size > 0 && (
            <div className="panel" style={{ background: '#fef3c7', borderColor: '#fbbf24', marginBottom: 'var(--space-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span><strong>{selectedIds.size}</strong> order(s) selected</span>
                <button
                  onClick={() => handleMarkAsLegacy(Array.from(selectedIds))}
                  className="button"
                  style={{ background: 'rgba(249,115,22,0.1)', color: '#9a3412' }}
                  disabled={isMarkingSelected}
                >
                  {isMarkingSelected ? (
                    <>
                      <span className="spinner" style={{ marginRight: '8px', borderTopColor: '#9a3412', borderColor: 'rgba(154,52,18,0.3)' }}></span>
                      Marking {selectedIds.size} as legacy...
                    </>
                  ) : (
                    'Mark selected as legacy'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Order list */}
          <div className="vehicle-list">
            {needsAttention.map(order => (
              <div key={order.repairOrderId} className="vehicle-card">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-md)' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(order.repairOrderId)}
                    onChange={() => handleToggleSelect(order.repairOrderId)}
                    style={{ marginTop: '4px' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ marginBottom: 'var(--space-xs)' }}>
                          {order.roNumber || <span style={{ color: 'var(--color-danger)' }}>Missing RO Number</span>}
                        </h4>
                        <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: 'var(--space-sm)' }}>
                          {order.customerName || <span style={{ color: 'var(--color-danger)' }}>Unknown customer</span>} • {order.unitLabel || 'No unit'}
                        </div>
                        <div style={{ fontSize: '0.875rem' }}>
                          {order.description}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                        <div
                          className="badge"
                          style={{
                            background: order.matchRate === 100 ? '#dcfce7' : order.matchRate >= 75 ? '#fef3c7' : '#fee2e2',
                            color: order.matchRate === 100 ? '#166534' : order.matchRate >= 75 ? '#854d0e' : '#991b1b',
                          }}
                        >
                          {order.matchRate}% complete
                        </div>
                        <button
                          onClick={() => toggleExpanded(order.repairOrderId)}
                          className="button button-secondary button-sm"
                        >
                          {expandedId === order.repairOrderId ? 'Hide' : 'Details'}
                        </button>
                      </div>
                    </div>

                    {/* Financial summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-sm)', marginTop: 'var(--space-md)', padding: 'var(--space-sm)', background: '#f8fafc', borderRadius: 'var(--radius-md)' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Labor</div>
                        <div style={{ fontWeight: 500 }}>${(order.laborTotal || 0).toFixed(2)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Parts</div>
                        <div style={{ fontWeight: 500 }}>${(order.partsTotal || 0).toFixed(2)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Tax</div>
                        <div style={{ fontWeight: 500 }}>${(order.taxTotal || 0).toFixed(2)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Total</div>
                        <div style={{ fontWeight: 600, fontSize: '1.125rem' }}>${(order.grandTotal || 0).toFixed(2)}</div>
                      </div>
                    </div>

                    {/* Payment status */}
                    {order.balanceDue && order.balanceDue > 0 && (
                      <div style={{ marginTop: 'var(--space-sm)', padding: 'var(--space-sm)', background: '#fef3c7', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.875rem' }}>
                          <strong>Balance Due:</strong> ${order.balanceDue.toFixed(2)}
                        </span>
                        <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                          Paid: ${(order.paidAmount || 0).toFixed(2)}
                        </span>
                      </div>
                    )}

                    {/* Expanded details */}
                    {expandedId === order.repairOrderId && (
                      <div style={{ marginTop: 'var(--space-md)', padding: 'var(--space-md)', background: '#f8fafc', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-md)' }}>
                          <div>
                            <strong>Created:</strong> {order.createdDate || 'N/A'}
                          </div>
                          <div>
                            <strong>Completed:</strong> {order.completedDate || <span style={{ color: 'var(--color-warning)' }}>In progress</span>}
                          </div>
                          <div>
                            <strong>Status:</strong> {order.workFlowStatus || 'Unknown'}
                          </div>
                          <div>
                            <strong>Odometer:</strong> {order.odometer ? order.odometer.toLocaleString() : 'N/A'}
                          </div>
                          <div>
                            <strong>Invoices:</strong> {order.invoiceCount || 0}
                          </div>
                          <div>
                            <strong>Financial Data:</strong> {order.hasFinancialData ? '✓ Yes' : <span style={{ color: 'var(--color-danger)' }}>✗ No</span>}
                          </div>
                        </div>
                        {order.outsideTotal && order.outsideTotal > 0 && (
                          <div style={{ marginTop: 'var(--space-sm)' }}>
                            <strong>Outside Services:</strong> ${order.outsideTotal.toFixed(2)}
                          </div>
                        )}
                        {order.discountTotal && order.discountTotal > 0 && (
                          <div style={{ marginTop: 'var(--space-sm)' }}>
                            <strong>Discount:</strong> -${order.discountTotal.toFixed(2)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Issues with Quick Fix */}
                    {order.issues && order.issues.length > 0 && (
                      <div style={{ marginTop: 'var(--space-sm)', padding: 'var(--space-sm)', background: '#fee2e2', borderRadius: 'var(--radius-md)' }}>
                        <strong style={{ fontSize: '0.875rem', color: '#991b1b' }}>Issues - Quick Fix Available:</strong>
                        <div style={{ marginTop: 'var(--space-sm)', display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                          {order.issues.includes('missing-ro-number') && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', fontSize: '0.875rem' }}>
                              <span style={{ color: '#991b1b', minWidth: '150px' }}>Missing RO Number:</span>
                              {editingOrder?.id === order.repairOrderId && editingOrder?.field === 'roNumber' ? (
                                <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
                                  <input
                                    type="text"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    placeholder="e.g., RO-2024-001"
                                    autoFocus
                                    disabled={updateMutation.isPending}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSaveQuickFix();
                                      if (e.key === 'Escape') handleCancelQuickFix();
                                    }}
                                    style={{ flex: 1 }}
                                  />
                                  <button onClick={handleSaveQuickFix} disabled={updateMutation.isPending} className="button button-sm">✓</button>
                                  <button onClick={handleCancelQuickFix} disabled={updateMutation.isPending} className="button button-sm">✗</button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleQuickFix(order, 'roNumber')}
                                  disabled={updateMutation.isPending}
                                  className="button button-sm"
                                  style={{ background: '#dcfce7', color: '#166534' }}
                                >
                                  Add RO Number
                                </button>
                              )}
                            </div>
                          )}
                          {order.issues.includes('missing-completed-date') && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', fontSize: '0.875rem' }}>
                              <span style={{ color: '#991b1b', minWidth: '150px' }}>Missing Completed Date:</span>
                              {editingOrder?.id === order.repairOrderId && editingOrder?.field === 'completedDate' ? (
                                <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
                                  <input
                                    type="date"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    autoFocus
                                    disabled={updateMutation.isPending}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSaveQuickFix();
                                      if (e.key === 'Escape') handleCancelQuickFix();
                                    }}
                                    style={{ flex: 1 }}
                                  />
                                  <button onClick={handleSaveQuickFix} disabled={updateMutation.isPending} className="button button-sm">✓</button>
                                  <button onClick={handleCancelQuickFix} disabled={updateMutation.isPending} className="button button-sm">✗</button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleQuickFix(order, 'completedDate')}
                                  disabled={updateMutation.isPending}
                                  className="button button-sm"
                                  style={{ background: '#dcfce7', color: '#166534' }}
                                >
                                  Set Completed Date
                                </button>
                              )}
                            </div>
                          )}
                          {order.issues.includes('missing-unit') && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', fontSize: '0.875rem' }}>
                              <span style={{ color: '#991b1b', minWidth: '150px' }}>Missing Unit:</span>
                              {editingOrder?.id === order.repairOrderId && editingOrder?.field === 'customerUnitId' ? (
                                <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
                                  <input
                                    type="text"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    placeholder="Unit ID"
                                    autoFocus
                                    disabled={updateMutation.isPending}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSaveQuickFix();
                                      if (e.key === 'Escape') handleCancelQuickFix();
                                    }}
                                    style={{ flex: 1 }}
                                  />
                                  <button onClick={handleSaveQuickFix} disabled={updateMutation.isPending} className="button button-sm">✓</button>
                                  <button onClick={handleCancelQuickFix} disabled={updateMutation.isPending} className="button button-sm">✗</button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleQuickFix(order, 'customerUnitId')}
                                  disabled={updateMutation.isPending}
                                  className="button button-sm"
                                  style={{ background: '#dcfce7', color: '#166534' }}
                                >
                                  Add Unit ID
                                </button>
                              )}
                            </div>
                          )}
                          {order.issues.includes('missing-customer') && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', fontSize: '0.875rem' }}>
                              <span style={{ color: '#991b1b', minWidth: '150px' }}>Missing Customer:</span>
                              {editingOrder?.id === order.repairOrderId && editingOrder?.field === 'customerId' ? (
                                <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
                                  <input
                                    type="text"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    placeholder="Customer ID"
                                    autoFocus
                                    disabled={updateMutation.isPending}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSaveQuickFix();
                                      if (e.key === 'Escape') handleCancelQuickFix();
                                    }}
                                    style={{ flex: 1 }}
                                  />
                                  <button onClick={handleSaveQuickFix} disabled={updateMutation.isPending} className="button button-sm">✓</button>
                                  <button onClick={handleCancelQuickFix} disabled={updateMutation.isPending} className="button button-sm">✗</button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleQuickFix(order, 'customerId')}
                                  disabled={updateMutation.isPending}
                                  className="button button-sm"
                                  style={{ background: '#dcfce7', color: '#166534' }}
                                >
                                  Add Customer ID
                                </button>
                              )}
                            </div>
                          )}
                          {(order.issues.includes('missing-financial-data') || order.issues.includes('missing-total')) && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', fontSize: '0.875rem' }}>
                              <span style={{ color: '#991b1b', minWidth: '150px' }}>Financial Data:</span>
                              <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                                <button
                                  onClick={() => handleQuickFix(order, 'laborTotal')}
                                  disabled={updateMutation.isPending}
                                  className="button button-sm"
                                  style={{ background: '#dcfce7', color: '#166534' }}
                                >
                                  Labor: ${order.laborTotal?.toFixed(2) || '0.00'}
                                </button>
                                <button
                                  onClick={() => handleQuickFix(order, 'partsTotal')}
                                  disabled={updateMutation.isPending}
                                  className="button button-sm"
                                  style={{ background: '#dcfce7', color: '#166534' }}
                                >
                                  Parts: ${order.partsTotal?.toFixed(2) || '0.00'}
                                </button>
                                <button
                                  onClick={() => handleQuickFix(order, 'taxTotal')}
                                  disabled={updateMutation.isPending}
                                  className="button button-sm"
                                  style={{ background: '#dcfce7', color: '#166534' }}
                                >
                                  Tax: ${order.taxTotal?.toFixed(2) || '0.00'}
                                </button>
                              </div>
                              {editingOrder?.id === order.repairOrderId && ['laborTotal', 'partsTotal', 'taxTotal'].includes(editingOrder?.field) && (
                                <div style={{ display: 'flex', gap: '4px', marginLeft: 'var(--space-sm)' }}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    placeholder="Amount"
                                    autoFocus
                                    disabled={updateMutation.isPending}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSaveQuickFix();
                                      if (e.key === 'Escape') handleCancelQuickFix();
                                    }}
                                    style={{ width: '120px' }}
                                  />
                                  <button onClick={handleSaveQuickFix} disabled={updateMutation.isPending} className="button button-sm">✓</button>
                                  <button onClick={handleCancelQuickFix} disabled={updateMutation.isPending} className="button button-sm">✗</button>
                                </div>
                              )}
                            </div>
                          )}
                          {order.issues.includes('unpaid-balance') && (
                            <div style={{ fontSize: '0.875rem', color: '#991b1b', marginTop: 'var(--space-xs)' }}>
                              ⚠️ Outstanding balance: ${order.balanceDue?.toFixed(2)} (informational - can be resolved post-migration)
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Validated Section */}
      {validated.length > 0 && (
        <section style={{ marginBottom: 'var(--space-2xl)' }}>
          <h3 style={{ marginBottom: 'var(--space-md)' }}>✓ Validated ({validated.length})</h3>
          <div className="vehicle-list">
            {validated.map(order => (
              <div key={order.repairOrderId} className="vehicle-card" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ marginBottom: 'var(--space-xs)' }}>
                      {order.roNumber}
                    </h4>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                      {order.customerName} • {order.unitLabel} • ${order.grandTotal?.toFixed(2)}
                    </div>
                  </div>
                  <div className="badge" style={{ background: '#dcfce7', color: '#166534' }}>
                    ✓ Ready
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Legacy Section */}
      {legacy.length > 0 && (
        <section>
          <h3 style={{ marginBottom: 'var(--space-md)' }}>Legacy ({legacy.length})</h3>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
            Imported as-is. Financial data preserved. Can be updated later.
          </p>
          <div className="vehicle-list">
            {legacy.map(order => (
              <div key={order.repairOrderId} className="vehicle-card" style={{ background: '#fef3c7', borderColor: '#fde047' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ marginBottom: 'var(--space-xs)' }}>
                      {order.roNumber || order.repairOrderId}
                    </h4>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                      {order.customerName} • ${order.grandTotal?.toFixed(2)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveFromLegacy(order.repairOrderId)}
                    disabled={updateMutation.isPending}
                    className="button button-secondary button-sm"
                  >
                    Remove from legacy
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Action footer */}
      <div style={{ marginTop: 'var(--space-2xl)', padding: 'var(--space-lg)', background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', position: 'sticky', bottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>{validated.length + legacy.length}</strong> of {orders.length} orders ready • ${totalPaid.toLocaleString()} collected
          </div>
          <button
            onClick={() => navigate(`/onboarding/${customerId}/financial`)}
            className="button button-primary"
          >
            Continue to financial →
          </button>
        </div>
      </div>
    </div>
  );
}

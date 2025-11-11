import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Button } from './ui/button';
import { Tooltip } from './ui/tooltip';

import { DataTable as ShadcnDataTable } from './ui/data-table';
import { useToast } from '../hooks/use-toast';
import { BreadcrumbNavigation } from './BreadcrumbNavigation';

const API_BASE = '/output';

// Helper function to get match rate color
const getMatchRateColor = (rate: number): string => {
  if (rate >= 80) return '#10b981'; // green
  if (rate >= 50) return '#f59e0b'; // yellow/orange
  return '#ef4444'; // red
};

// Helper function to format percentage
const formatPercentage = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

// Invoices Tab Component
interface InvoicesTabContentProps {
  entityId: string;
  data: any;
  loading: boolean;
  navigate: any;
}

const InvoicesTabContent: React.FC<InvoicesTabContentProps> = ({ entityId, data, loading, navigate }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'customer'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  const INVOICES_PER_PAGE = 50;

  if (loading) {
    return (
      <div className="loading-spinner">
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem' }}>
          Loading Invoices...
        </h3>
        <p>Please wait while we fetch the invoice data</p>
      </div>
    );
  }

  if (!data || !data.invoices) {
    return (
      <div className="text-center py-12">
        <div className="text-lg font-medium text-gray-500">No invoice data available</div>
        <p className="text-sm text-gray-400 mt-2">Invoices have not been aggregated for this entity yet</p>
      </div>
    );
  }

  const summary = data.summary;
  const allInvoices = data.invoices;

  // Filter and sort
  let filteredInvoices = [...allInvoices];

  // Apply search
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filteredInvoices = filteredInvoices.filter(inv =>
      inv.invoiceNumber?.toString().includes(term) ||
      inv.customerTitle?.toLowerCase().includes(term) ||
      inv.repairOrderNumber?.toString().includes(term)
    );
  }

  // Apply status filter
  if (statusFilter !== 'all') {
    filteredInvoices = filteredInvoices.filter(inv => inv.status === statusFilter);
  }

  // Apply sorting
  filteredInvoices.sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case 'date':
        const dateA = a.invoiceDate || a.created || '';
        const dateB = b.invoiceDate || b.created || '';
        comparison = dateA.localeCompare(dateB);
        break;
      case 'amount':
        comparison = (a.total || 0) - (b.total || 0);
        break;
      case 'customer':
        comparison = (a.customerTitle || '').localeCompare(b.customerTitle || '');
        break;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  // Pagination
  const totalPages = Math.ceil(filteredInvoices.length / INVOICES_PER_PAGE);
  const startIndex = (currentPage - 1) * INVOICES_PER_PAGE;
  const endIndex = startIndex + INVOICES_PER_PAGE;
  const paginatedInvoices = filteredInvoices.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, sortBy, sortOrder]);

  const formatCurrency = (amount?: number): string => {
    if (amount === undefined || amount === null) return '$0.00';
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return '—';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return '—';
    }
  };

  const handleInvoiceClick = (invoice: any) => {
    navigate(`/${entityId}/${invoice.serviceOrderPath}`);
  };

  const statusOptions = Object.keys(summary.byStatus || {});

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1rem'
      }}>
        <div className="card" style={{ borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '0.875rem', color: '#166534', marginBottom: '0.5rem', fontWeight: 500 }}>
            Total Revenue
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#15803d' }}>
            {formatCurrency(summary.totalRevenue)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#166534', marginTop: '0.25rem' }}>
            Avg: {formatCurrency(summary.averageInvoiceAmount)}
          </div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: '0.875rem', color: '#92400e', marginBottom: '0.5rem', fontWeight: 500 }}>
            Outstanding Balance
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#b45309' }}>
            {formatCurrency(summary.totalBalance)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#92400e', marginTop: '0.25rem' }}>
            {Math.round((summary.totalBalance / summary.totalRevenue) * 100)}% of revenue
          </div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid #3b82f6' }}>
          <div style={{ fontSize: '0.875rem', color: '#1e40af', marginBottom: '0.5rem', fontWeight: 500 }}>
            Total Paid
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2563eb' }}>
            {formatCurrency(summary.totalPaid)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#1e40af', marginTop: '0.25rem' }}>
            {Math.round((summary.totalPaid / summary.totalRevenue) * 100)}% of revenue
          </div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid #6b7280' }}>
          <div style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.5rem', fontWeight: 500 }}>
            Total Invoices
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1f2937' }}>
            {summary.totalInvoices?.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
            {summary.exported} exported ({Math.round((summary.exported / summary.totalInvoices) * 100)}%)
          </div>
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="card" style={{ borderLeft: '4px solid #8b5cf6' }}>
        <div className="card-header">📊 Invoice Status Breakdown</div>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          {Object.entries(summary.byStatus || {}).map(([status, count]: [string, any]) => (
            <div key={status} style={{ flex: '1', minWidth: '150px' }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                {status}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937' }}>
                {count?.toLocaleString()}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                {Math.round((count / summary.totalInvoices) * 100)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters and Search */}
      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 500 }}>
              Search
            </label>
            <input
              type="text"
              placeholder="Invoice #, Customer, RO #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '0.5rem', 
                border: '1px solid #d1d5db', 
                borderRadius: '0.375rem',
                fontSize: '0.875rem'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 500 }}>
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '0.5rem', 
                border: '1px solid #d1d5db', 
                borderRadius: '0.375rem',
                fontSize: '0.875rem'
              }}
            >
              <option value="all">All Statuses</option>
              {statusOptions.map(status => (
                <option key={status} value={status}>
                  {status} ({summary.byStatus[status]})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 500 }}>
              Sort By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{ 
                width: '100%', 
                padding: '0.5rem', 
                border: '1px solid #d1d5db', 
                borderRadius: '0.375rem',
                fontSize: '0.875rem'
              }}
            >
              <option value="date">Date</option>
              <option value="amount">Amount</option>
              <option value="customer">Customer</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 500 }}>
              Order
            </label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as any)}
              style={{ 
                width: '100%', 
                padding: '0.5rem', 
                border: '1px solid #d1d5db', 
                borderRadius: '0.375rem',
                fontSize: '0.875rem'
              }}
            >
              <option value="desc">Newest First</option>
              <option value="asc">Oldest First</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
          Showing {startIndex + 1}-{Math.min(endIndex, filteredInvoices.length)} of {filteredInvoices.length} invoices
          {filteredInvoices.length !== allInvoices.length && ` (filtered from ${allInvoices.length} total)`}
        </div>
      </div>

      {/* Invoices Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600 }}>
                  Invoice #
                </th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600 }}>
                  Date
                </th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600 }}>
                  Customer
                </th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600 }}>
                  RO #
                </th>
                <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: 600 }}>
                  Total
                </th>
                <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: 600 }}>
                  Balance
                </th>
                <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: 600 }}>
                  Status
                </th>
                <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: 600 }}>
                  Payments
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedInvoices.map((invoice, idx) => (
                <tr 
                  key={invoice.repairOrderInvoiceId}
                  onClick={() => handleInvoiceClick(invoice)}
                  style={{ 
                    borderBottom: idx < paginatedInvoices.length - 1 ? '1px solid #f3f4f6' : 'none',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.875rem' }}>
                    {invoice.invoiceNumber}
                  </td>
                  <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                    {formatDate(invoice.invoiceDate)}
                  </td>
                  <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                    {invoice.customerTitle || '—'}
                  </td>
                  <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.875rem' }}>
                    {invoice.repairOrderNumber || '—'}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: 500 }}>
                    {formatCurrency(invoice.total)}
                  </td>
                  <td style={{ 
                    padding: '0.75rem', 
                    textAlign: 'right', 
                    fontSize: '0.875rem', 
                    fontWeight: 500,
                    color: (invoice.balance || 0) > 0 ? '#b45309' : '#166534'
                  }}>
                    {formatCurrency(invoice.balance)}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.75rem' }}>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem',
                      background: invoice.status === 'paid' ? '#d1fae5' : '#dbeafe',
                      color: invoice.status === 'paid' ? '#065f46' : '#1e40af'
                    }}>
                      {invoice.status || 'unknown'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.875rem' }}>
                    {invoice.paymentCount > 0 ? (
                      <span style={{ color: '#166534', fontWeight: 500 }}>✓ {invoice.paymentCount}</span>
                    ) : (
                      <span style={{ color: '#9ca3af' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {paginatedInvoices.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
              No invoices found matching your filters.
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              background: currentPage === 1 ? '#f3f4f6' : 'white',
              cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem'
            }}
          >
            ← Previous
          </button>
          
          <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Page {currentPage} of {totalPages}
          </span>
          
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              background: currentPage === totalPages ? '#f3f4f6' : 'white',
              cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
};

// AutoCare Detail Component
interface AutoCareDetailProps {
  autoCareData: any;
}

const AutoCareDetail: React.FC<AutoCareDetailProps> = ({ autoCareData }) => {
  const [expandedCommonFailures, setExpandedCommonFailures] = useState<{[key: string]: boolean}>({});
  const [commonFailuresPage, setCommonFailuresPage] = useState<{[key: string]: number}>({
    vehicle: 1,
    parts: 1
  });
  
  const FAILURES_PER_PAGE = 10;

  if (!autoCareData) {
    return (
      <div className="text-center py-12">
        <div className="text-lg font-medium text-gray-500">No AutoCare data available</div>
        <p className="text-sm text-gray-400 mt-2">This entity does not have ACES/PIES matching data</p>
      </div>
    );
  }

  const vehicleData = autoCareData.vehicleMatching;
  const partsData = autoCareData.partsMatching;

  const toggleCommonFailures = (section: string) => {
    setExpandedCommonFailures(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const getPagedFailures = (failures: any[], section: string) => {
    const currentPage = commonFailuresPage[section] || 1;
    const startIndex = (currentPage - 1) * FAILURES_PER_PAGE;
    const endIndex = startIndex + FAILURES_PER_PAGE;
    return failures.slice(startIndex, endIndex);
  };

  const getTotalPages = (failures: any[]) => {
    return Math.ceil(failures.length / FAILURES_PER_PAGE);
  };

  const handlePageChange = (section: string, page: number) => {
    setCommonFailuresPage(prev => ({
      ...prev,
      [section]: page
    }));
  };

  return (
    <div className="space-y-6">
      {/* Vehicle Matching Section */}
      {vehicleData && (
        <div className="card" style={{ borderLeft: '4px solid #059669' }}>
          <div className="mb-4">
            <h3 className="card-header mb-1">🚗 Vehicle Matching (ACES)</h3>
            <p className="card-meta">Vehicle data matching with AutoCare ACES database</p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-emerald-600">
                {vehicleData.totalVehicles?.toLocaleString() || '0'}
              </div>
              <div className="text-sm text-gray-600">Total Vehicles</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-emerald-600">
                {vehicleData.matchedVehicles?.toLocaleString() || '0'}
              </div>
              <div className="text-sm text-gray-600">Matched</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold" style={{ color: getMatchRateColor(vehicleData.matchRate || 0) }}>
                {formatPercentage(vehicleData.matchRate || 0)}
              </div>
              <div className="text-sm text-gray-600">Match Rate</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-700">
                {vehicleData.averageConfidence || 'N/A'}
              </div>
              <div className="text-sm text-gray-600">Avg Confidence</div>
            </div>
          </div>

          <div className="space-y-6">
            {/* Failure Statistics */}
            {vehicleData.failureStatistics && (
              <div>
                <h4 className="text-lg font-semibold mb-3">Failure Statistics</h4>
                <div className="text-sm text-gray-600 mb-2">
                  Total Failures: <span className="font-semibold">{vehicleData.failureStatistics.totalFailures || 0}</span>
                </div>
                {vehicleData.failureStatistics.failuresByReason && (
                  <div className="space-y-1 mb-4">
                    {vehicleData.failureStatistics.failuresByReason.map((failure: any, index: number) => (
                      <div key={index} className="flex justify-between items-center p-2 bg-red-50 rounded text-sm">
                        <span>{failure.reason.replace(/_/g, ' ')}</span>
                        <span className="font-semibold text-red-600">{failure.count}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Common Failures */}
                {vehicleData.failureStatistics.commonFailures && vehicleData.failureStatistics.commonFailures.length > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="text-md font-semibold">Common Failure Reasons</h5>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleCommonFailures('vehicle')}
                        className="text-xs"
                      >
                        {expandedCommonFailures.vehicle ? 'Hide' : 'Show'} ({vehicleData.failureStatistics.commonFailures.length})
                      </Button>
                    </div>
                    {expandedCommonFailures.vehicle && (
                      <div className="border border-gray-200 rounded-lg bg-gray-50">
                        <div className="space-y-2 p-3">
                          {getPagedFailures(vehicleData.failureStatistics.commonFailures, 'vehicle').map((failure: any, index: number) => (
                            <div key={index} className="p-2 bg-white rounded border-l-4 border-red-300 text-xs">
                              <div className="font-medium text-gray-800 mb-1">
                                {failure.vehicleInfo || 'Unknown Vehicle'}
                              </div>
                              <div className="text-gray-600 space-x-2">
                                <span>Make: <span className="font-medium">{failure.make || '-'}</span></span>
                                <span>Model: <span className="font-medium">{failure.model || '-'}</span></span>
                                <span>Year: <span className="font-medium">{failure.year || '-'}</span></span>
                              </div>
                              <div className="text-red-600 font-medium mt-1">
                                Reason: {failure.reason?.replace(/_/g, ' ') || 'Unknown'}
                              </div>
                            </div>
                          ))}
                        </div>
                        {vehicleData.failureStatistics.commonFailures.length > FAILURES_PER_PAGE && (
                          <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 bg-white rounded-b-lg">
                            <span className="text-xs text-gray-600">
                              Showing {((commonFailuresPage.vehicle - 1) * FAILURES_PER_PAGE) + 1}-{Math.min(commonFailuresPage.vehicle * FAILURES_PER_PAGE, vehicleData.failureStatistics.commonFailures.length)} of {vehicleData.failureStatistics.commonFailures.length}
                            </span>
                            <div className="flex items-center space-x-1">
                              <button
                                onClick={() => handlePageChange('vehicle', commonFailuresPage.vehicle - 1)}
                                disabled={commonFailuresPage.vehicle === 1}
                                className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Prev
                              </button>
                              <span className="text-xs text-gray-600">
                                Page {commonFailuresPage.vehicle} of {getTotalPages(vehicleData.failureStatistics.commonFailures)}
                              </span>
                              <button
                                onClick={() => handlePageChange('vehicle', commonFailuresPage.vehicle + 1)}
                                disabled={commonFailuresPage.vehicle >= getTotalPages(vehicleData.failureStatistics.commonFailures)}
                                className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {/* Vehicle Failure Analytics */}
            {vehicleData.failureStatistics?.failureAnalytics && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="text-md font-semibold">🔍 Advanced Failure Analytics</h5>
                  <div className="text-xs text-gray-600">
                    {vehicleData.failureStatistics.failureAnalytics.uniqueFailureCount.toLocaleString()} unique failures analyzed
                  </div>
                </div>
                <div className="space-y-4">
                  {/* Top Failure Patterns */}
                  <div className="p-3 bg-gradient-to-r from-red-50 to-orange-50 rounded-lg border border-red-200">
                    <h6 className="text-sm font-semibold text-red-700 mb-2">
                      All Failure Patterns ({vehicleData.failureStatistics.failureAnalytics.topFailurePatterns.length})
                    </h6>
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {vehicleData.failureStatistics.failureAnalytics.topFailurePatterns.map((pattern: any, index: number) => (
                        <div key={index} className="flex justify-between items-center text-xs p-1 hover:bg-red-100 rounded">
                          <span className="text-gray-700 flex-1 mr-2">{pattern.pattern}</span>
                          <span className="font-medium text-red-600 min-w-0 text-right mr-2">{pattern.count}</span>
                          <span className="text-gray-500 min-w-0 text-right">({pattern.percentage}%)</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Year Distribution */}
                  {vehicleData.failureStatistics.failureAnalytics.yearDistribution && (
                    <div className="p-3 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg border border-blue-200">
                      <h6 className="text-sm font-semibold text-blue-700 mb-2">Failure Year Distribution</h6>
                      <div className="grid grid-cols-2 gap-2">
                        {vehicleData.failureStatistics.failureAnalytics.yearDistribution.map((year: any, index: number) => (
                          <div key={index} className="flex justify-between items-center text-xs p-1 bg-white rounded">
                            <span className="text-gray-700">{year.yearRange}</span>
                            <div className="text-right">
                              <span className="font-medium text-blue-600 mr-1">{year.count}</span>
                              <span className="text-gray-500">({year.percentage}%)</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* VIN Failure Stats */}
                  {vehicleData.failureStatistics.failureAnalytics.vinFailureStats && (
                    <div className="p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
                      <h6 className="text-sm font-semibold text-purple-700 mb-2">VIN Decode Issues</h6>
                      <div className="grid grid-cols-1 gap-2 mb-3">
                        <div className="flex justify-between items-center text-xs p-1 bg-white rounded">
                          <span className="text-gray-700">Total VIN Attempts</span>
                          <span className="font-medium text-purple-600">
                            {vehicleData.failureStatistics.failureAnalytics.vinFailureStats.totalVinAttempts}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs p-1 bg-white rounded">
                          <span className="text-gray-700">VIN Decode Failures</span>
                          <span className="font-medium text-red-600">
                            {vehicleData.failureStatistics.failureAnalytics.vinFailureStats.vinDecodeFailures}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs p-1 bg-white rounded">
                          <span className="text-gray-700">Failure Rate</span>
                          <span className="font-medium text-red-600">
                            {vehicleData.failureStatistics.failureAnalytics.vinFailureStats.vinFailureRate}%
                          </span>
                        </div>
                      </div>
                      {vehicleData.failureStatistics.failureAnalytics.vinFailureStats.commonVinIssues && (
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-purple-700">Common Issues:</div>
                          {vehicleData.failureStatistics.failureAnalytics.vinFailureStats.commonVinIssues.map((issue: any, index: number) => (
                            <div key={index} className="flex justify-between items-center text-xs p-1 bg-white rounded">
                              <span className="text-gray-700">{issue.issue}</span>
                              <span className="font-medium text-purple-600">{issue.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          {/* Vehicle Match Distribution - moved to bottom */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h4 className="text-lg font-semibold mb-3">Match Distribution</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="flex justify-between items-center p-2 bg-green-50 rounded">
                <span className="text-sm">Exact Matches</span>
                <span className="font-semibold text-green-600">{vehicleData.exactMatches || 0}</span>
              </div>
              <div className="flex justify-between items-center p-2 bg-yellow-50 rounded">
                <span className="text-sm">Fuzzy Matches</span>
                <span className="font-semibold text-yellow-600">{vehicleData.fuzzyMatches || 0}</span>
              </div>
              <div className="flex justify-between items-center p-2 bg-red-50 rounded">
                <span className="text-sm">No Matches</span>
                <span className="font-semibold text-red-600">{vehicleData.noMatches || 0}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Parts Matching Section */}
      {partsData && (
        <div className="card" style={{ borderLeft: '4px solid #0ea5e9' }}>
          <div className="mb-4">
            <h3 className="card-header mb-1">🔧 Parts Matching (PIES)</h3>
            <p className="card-meta">Parts data matching with AutoCare PIES database</p>
          </div>
          
          {/* Display available statistics - prioritize matchingStatistics if available */}
          {partsData.matchingStatistics ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-sky-600">
                  {partsData.matchingStatistics.totalParts?.toLocaleString() || '0'}
                </div>
                <div className="text-sm text-gray-600">Total Parts</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-sky-600">
                  {partsData.matchingStatistics.matchedParts?.toLocaleString() || '0'}
                </div>
                <div className="text-sm text-gray-600">Matched</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold" style={{ color: getMatchRateColor(partsData.matchingStatistics.matchRate || 0) }}>
                  {formatPercentage(partsData.matchingStatistics.matchRate || 0)}
                </div>
                <div className="text-sm text-gray-600">Match Rate</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-700">
                  {partsData.matchingStatistics.averageConfidence ? 
                    formatPercentage(partsData.matchingStatistics.averageConfidence) : '-'}
                </div>
                <div className="text-sm text-gray-600">Avg Confidence</div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-sky-600">
                  {partsData.totalUniqueParts?.toLocaleString() || 'N/A'}
                </div>
                <div className="text-sm text-gray-600">Total Unique Parts</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-500">
                  N/A
                </div>
                <div className="text-sm text-gray-600">Matched</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-500">
                  N/A
                </div>
                <div className="text-sm text-gray-600">Match Rate</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-500">
                  N/A
                </div>
                <div className="text-sm text-gray-600">Avg Confidence</div>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {/* Failure Statistics */}
            {partsData.failureStatistics && (
              <div>
                <h4 className="text-lg font-semibold mb-3">Failure Statistics</h4>
                <div className="text-sm text-gray-600 mb-2">
                  Total Failures: <span className="font-semibold">{partsData.failureStatistics.totalFailures || 0}</span>
                </div>
                {partsData.failureStatistics.failuresByReason && (
                  <div className="space-y-1 mb-4">
                    {partsData.failureStatistics.failuresByReason.map((failure: any, index: number) => (
                      <div key={index} className="flex justify-between items-center p-2 bg-red-50 rounded text-sm">
                        <span>{failure.reason.replace(/_/g, ' ')}</span>
                        <span className="font-semibold text-red-600">{failure.count}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Common Failures */}
                {partsData.failureStatistics.commonFailures && partsData.failureStatistics.commonFailures.length > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="text-md font-semibold">Common Failure Reasons</h5>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleCommonFailures('parts')}
                        className="text-xs"
                      >
                        {expandedCommonFailures.parts ? 'Hide' : 'Show'} ({partsData.failureStatistics.commonFailures.length})
                      </Button>
                    </div>
                    {expandedCommonFailures.parts && (
                      <div className="border border-gray-200 rounded-lg bg-gray-50">
                        <div className="space-y-2 p-3">
                          {getPagedFailures(partsData.failureStatistics.commonFailures, 'parts').map((failure: any, index: number) => (
                            <div key={index} className="p-2 bg-white rounded border-l-4 border-blue-300 text-xs">
                              <div className="font-medium text-gray-800 mb-1">
                                {failure.partName || 'Unknown Part'}
                              </div>
                              <div className="text-gray-600">
                                Count: <span className="font-medium text-blue-600">{failure.count || 'N/A'}</span>
                              </div>
                              {failure.reason && (
                                <div className="text-red-600 font-medium mt-1">
                                  Reason: {failure.reason.replace(/_/g, ' ')}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        {partsData.failureStatistics.commonFailures.length > FAILURES_PER_PAGE && (
                          <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 bg-white rounded-b-lg">
                            <span className="text-xs text-gray-600">
                              Showing {((commonFailuresPage.parts - 1) * FAILURES_PER_PAGE) + 1}-{Math.min(commonFailuresPage.parts * FAILURES_PER_PAGE, partsData.failureStatistics.commonFailures.length)} of {partsData.failureStatistics.commonFailures.length}
                            </span>
                            <div className="flex items-center space-x-1">
                              <button
                                onClick={() => handlePageChange('parts', commonFailuresPage.parts - 1)}
                                disabled={commonFailuresPage.parts === 1}
                                className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Prev
                              </button>
                              <span className="text-xs text-gray-600">
                                Page {commonFailuresPage.parts} of {getTotalPages(partsData.failureStatistics.commonFailures)}
                              </span>
                              <button
                                onClick={() => handlePageChange('parts', commonFailuresPage.parts + 1)}
                                disabled={commonFailuresPage.parts >= getTotalPages(partsData.failureStatistics.commonFailures)}
                                className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {/* Parts Failure Analytics */}
            {partsData.failureStatistics?.failureAnalytics && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="text-md font-semibold">🔍 Advanced Failure Analytics</h5>
                  <div className="text-xs text-gray-600">
                    {partsData.failureStatistics.failureAnalytics.uniqueFailedParts.toLocaleString()} unique failed parts analyzed
                  </div>
                </div>
                <div className="space-y-4">
                  {/* Failures by Category */}
                  <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                    <h6 className="text-sm font-semibold text-blue-700 mb-2">
                      Failures by Category ({partsData.failureStatistics.failureAnalytics.failuresByCategory.length})
                    </h6>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {partsData.failureStatistics.failureAnalytics.failuresByCategory.map((category: any, index: number) => (
                        <div key={index} className="flex justify-between items-center text-xs p-1 bg-white rounded hover:bg-blue-50">
                          <span className="text-gray-700 flex-1 mr-2">{category.category}</span>
                          <div className="text-right">
                            <span className="font-medium text-blue-600 mr-1">{category.count.toLocaleString()}</span>
                            <span className="text-gray-500">({category.percentage}%)</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>


                  {/* Failure Distribution */}
                  {partsData.failureStatistics.failureAnalytics.failureDistribution && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* By Frequency */}
                      {partsData.failureStatistics.failureAnalytics.failureDistribution.byFrequency && (
                        <div className="p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                          <h6 className="text-sm font-semibold text-green-700 mb-2">Failure Frequency Distribution</h6>
                          <div className="space-y-1">
                            {partsData.failureStatistics.failureAnalytics.failureDistribution.byFrequency.map((freq: any, index: number) => (
                              <div key={index} className="flex justify-between items-center text-xs p-1 bg-white rounded">
                                <span className="text-gray-700">{freq.range}</span>
                                <div className="text-right">
                                  <span className="font-medium text-green-600 mr-1">{freq.count.toLocaleString()}</span>
                                  <span className="text-gray-500">({freq.percentage}%)</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Top Failure Reasons */}
                      {partsData.failureStatistics.failureAnalytics.failureDistribution.topFailureReasons && (
                        <div className="p-3 bg-gradient-to-r from-red-50 to-pink-50 rounded-lg border border-red-200">
                          <h6 className="text-sm font-semibold text-red-700 mb-2">Top Failure Reasons</h6>
                          <div className="space-y-1">
                            {partsData.failureStatistics.failureAnalytics.failureDistribution.topFailureReasons.map((reason: any, index: number) => (
                              <div key={index} className="flex justify-between items-center text-xs p-1 bg-white rounded">
                                <span className="text-gray-700">{reason.reason.replace(/_/g, ' ')}</span>
                                <div className="text-right">
                                  <span className="font-medium text-red-600 mr-1">{reason.count.toLocaleString()}</span>
                                  <span className="text-gray-500">({reason.percentage}%)</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          {/* Match Distribution - moved to bottom */}
          {partsData.matchingStatistics && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h4 className="text-lg font-semibold mb-3">Match Distribution</h4>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="flex justify-between items-center p-2 bg-green-50 rounded">
                  <span className="text-sm">Exact Matches</span>
                  <span className="font-semibold text-green-600">{partsData.matchingStatistics.exactMatches || 0}</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-blue-50 rounded">
                  <span className="text-sm">Fuzzy Matches</span>
                  <span className="font-semibold text-blue-600">{partsData.matchingStatistics.fuzzyMatches || 0}</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-purple-50 rounded">
                  <span className="text-sm">Description Matches</span>
                  <span className="font-semibold text-purple-600">{partsData.matchingStatistics.descriptionMatches || 0}</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-indigo-50 rounded">
                  <span className="text-sm">Keyword Matches</span>
                  <span className="font-semibold text-indigo-600">{partsData.matchingStatistics.keywordMatches || 0}</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-red-50 rounded">
                  <span className="text-sm">No Matches</span>
                  <span className="font-semibold text-red-600">{partsData.matchingStatistics.noMatches || 0}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}


    </div>
  );
};

interface EntityCategoryData {
  metadata: {
    entityId: number;
    category: string;
    totalRecords: number;
    tableCount: number;
    exportTimestamp: string;
  };
  [key: string]: any;
}

interface CategoryInfo {
  key: string;
  title: string;
  icon: string;
  description: string;
  filename: string;
  color: string;
}

const ENTITY_CATEGORIES: CategoryInfo[] = [
  {
    key: 'core',
    title: 'Core Business',
    icon: '🏢',
    description: 'Basic entity information, addresses, locations, employees',
    filename: 'entity.json',
    color: '#3b82f6'
  },
  {
    key: 'employees',
    title: 'Employee Management',
    icon: '👥',
    description: 'Employee data, achievements, schedules, notifications',
    filename: 'employees.json',
    color: '#10b981'
  },
  {
    key: 'locations',
    title: 'Location Management',
    icon: '📍',
    description: 'Location APIs, calendar events, QuickBooks integration',
    filename: 'locations.json',
    color: '#8b5cf6'
  },
  {
    key: 'parts',
    title: 'Parts & Inventory',
    icon: '🔧',
    description: 'Parts, vendors, inventory, orders, serialized items',
    filename: 'parts.json',
    color: '#f59e0b'
  },
  {
    key: 'financial',
    title: 'Financial & Billing',
    icon: '💰',
    description: 'Fees, invoices, payments, taxes, labor rates',
    filename: 'financial.json',
    color: '#ef4444'
  },
  {
    key: 'services',
    title: 'Services & Components',
    icon: '⚙️',
    description: 'Components, systems, corrections, unit types',
    filename: 'services.json',
    color: '#6366f1'
  },
  {
    key: 'settings',
    title: 'Configuration & Settings',
    icon: '🔧',
    description: 'Settings, roles, QuickBooks, repair order options',
    filename: 'settings.json',
    color: '#6b7280'
  },
  {
    key: 'autocare',
    title: 'AutoCare Matching',
    icon: '🚗',
    description: 'ACES vehicle and PIES parts data matching statistics',
    filename: 'entity.json', // We'll get data from core entity.json
    color: '#059669'
  },
  {
    key: 'invoices',
    title: 'Invoices',
    icon: '📋',
    description: 'All invoices for this entity with search and filtering',
    filename: 'invoices.json',
    color: '#3b82f6'
  }
];

// formatValue function is now handled inside the ShadcnDataTable component

// DataTable component is now imported as ShadcnDataTable from ui/data-table.tsx

export function ImprovedEntityDetailPage() {
  const { entityId } = useParams<{ entityId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [coreData, setCoreData] = useState<any>(null);
  const [categoryData, setCategoryData] = useState<Record<string, EntityCategoryData>>({});
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState('overview');
  const [loadingCore, setLoadingCore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // load core data
  useEffect(() => {
    if (!entityId) {
      setError('Entity ID is required');
      setLoadingCore(false);
      return;
    }
    loadCoreData();
  }, [entityId]);

    // preload all category data when overview tab is active
  useEffect(() => {
    if (activeTab === 'overview' && coreData) {
      // preload all category data to show statistics
      ENTITY_CATEGORIES.forEach(category => {
        if (!categoryData[category.key] && !loadingStates[category.key]) {
          loadCategoryData(category.key);
        }
      });
    }
  }, [activeTab, coreData]);

  const loadCoreData = async () => {
    try {
      setLoadingCore(true);
      setError(null);
      
      const response = await fetch(`${API_BASE}/${entityId}/entity.json`);
      if (!response.ok) {
        throw new Error(`Failed to load entity data: ${response.status}`);
      }
      
      const data = await response.json();
      // NEW FORMAT: data should have entity, addresses, locations, employees, roles, history, metadata
      // Handle both old and new formats for backward compatibility
      let entityData;
      if (data.metadata && data.metadata.category === 'Core Business') {
        // New format: already structured correctly
        entityData = data;
      } else if (data.entity) {
        // Transition format: entity is nested
        entityData = { entity: data.entity };
      } else {
        // Old format: entity is flat
        entityData = { entity: data };
      }
      setCoreData(entityData);
    } catch (err) {
      console.error('Error loading core entity data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load entity data');
      toast({
        title: "Error",
        description: "Failed to load entity data",
        variant: "destructive",
      });
    } finally {
      setLoadingCore(false);
    }
  };

  // lazy load category data
  const loadCategoryData = useCallback(async (categoryKey: string) => {
    if (categoryData[categoryKey] || loadingStates[categoryKey]) {
      return; // already loaded or loading
    }

    const category = ENTITY_CATEGORIES.find(c => c.key === categoryKey);
    if (!category) return;

    setLoadingStates(prev => ({ ...prev, [categoryKey]: true }));

    try {
      const response = await fetch(`${API_BASE}/${entityId}/${category.filename}`);
      if (!response.ok) {
        throw new Error(`Failed to load ${category.title} data: ${response.status}`);
      }
      
      const data = await response.json();
      setCategoryData(prev => ({ ...prev, [categoryKey]: data }));
    } catch (err) {
      console.error(`Error loading ${category.title} data:`, err);
      toast({
        title: "Error",
        description: `Failed to load ${category.title} data`,
        variant: "destructive",
      });
    } finally {
      setLoadingStates(prev => ({ ...prev, [categoryKey]: false }));
    }
  }, [entityId, categoryData, loadingStates, toast]);

  if (loadingCore) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <div className="text-lg font-medium">Loading entity details...</div>
          <div className="text-sm text-muted-foreground mt-2">Please wait while we fetch the data</div>
        </div>
      </div>
    );
  }

  if (error || !coreData) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <div className="text-lg font-medium text-destructive mb-4">
            {error || `Entity ${entityId} not found`}
          </div>
          <div className="space-x-2">
            <Button onClick={loadCoreData} variant="default">
              Retry
            </Button>
            <Button onClick={() => navigate('/')} variant="outline">
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Entity Details</h1>
        <p className="dashboard-subtitle">
          {coreData.entity?.title || `Entity ${entityId}`} • Complete view of all 126 tables
        </p>
      </div>
      <div className="dashboard-content">
      
      <BreadcrumbNavigation
        pageType="entity-detail"
        entityData={coreData.entity}
        onBack={() => navigate('/')}
      />

      <Tabs value={activeTab} onValueChange={(value) => {
        setActiveTab(value);
        if (value !== 'overview' && ENTITY_CATEGORIES.find(c => c.key === value)) {
          loadCategoryData(value);
        }
      }} className="w-full">
        <TabsList className="grid w-full grid-cols-10 h-12">
          <TabsTrigger value="overview" className="text-sm font-medium">📊 Overview</TabsTrigger>
          {ENTITY_CATEGORIES.map(category => (
            <TabsTrigger 
              key={category.key} 
              value={category.key} 
              className="text-sm font-medium"
            >
              {category.icon} {category.title.split(' ')[0]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid-container">
            {/* Core Business Card */}
            <div 
              className="card" 
              style={{ borderLeft: '4px solid #3b82f6', cursor: 'pointer' }}
              onClick={() => setActiveTab('core')}
            >
              <div className="card-header">🏢 Core Business</div>
              <div className="card-meta">Entity info, addresses, locations, employees</div>
              <div className="card-stats">
                <div className="stat-item">
                  <div className="stat-value" style={{ color: '#3b82f6' }}>
                    {coreData.metadata?.totalRecords?.toLocaleString() || 'N/A'}
                  </div>
                  <div className="stat-label">Records</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">
                    {coreData.metadata?.tableCount || 6}
                  </div>
                  <div className="stat-label">Tables</div>
                </div>
              </div>
              {coreData.metadata?.totalRecords === 1 && (
                <div className="card-meta" style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                  📋 Basic data only - click to load full details
                </div>
              )}
            </div>

            {/* Other Categories */}
            {ENTITY_CATEGORIES.slice(1).map(category => {
              const data = categoryData[category.key];
              const isLoading = loadingStates[category.key];
              
              // Special display for invoices
              const isInvoicesCard = category.key === 'invoices';
              const invoicesSummary = isInvoicesCard && data?.summary;
              
              return (
                <div 
                  key={category.key} 
                  className="card"
                  style={{ 
                    borderLeft: `4px solid ${data ? '#10b981' : '#d1d5db'}`,
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    setActiveTab(category.key);
                    loadCategoryData(category.key);
                  }}
                >
                  <div className="card-header">{category.icon} {category.title}</div>
                  <div className="card-meta">{category.description}</div>
                  {isLoading ? (
                    <div style={{ textAlign: 'center', padding: '1rem', color: '#6b7280' }}>
                      Loading...
                    </div>
                  ) : data ? (
                    isInvoicesCard && invoicesSummary ? (
                      // Special invoice stats display
                      <div className="card-stats">
                        <div className="stat-item">
                          <div className="stat-value stat-value-green">
                            {invoicesSummary.totalInvoices?.toLocaleString() || '0'}
                          </div>
                          <div className="stat-label">Invoices</div>
                        </div>
                        <div className="stat-item">
                          <div className="stat-value" style={{ color: '#10b981' }}>
                            ${(invoicesSummary.totalRevenue / 1000).toFixed(0)}K
                          </div>
                          <div className="stat-label">Revenue</div>
                        </div>
                      </div>
                    ) : (
                      // Standard stats display
                      <div className="card-stats">
                        <div className="stat-item">
                          <div className="stat-value stat-value-green">
                            {data.metadata?.totalRecords?.toLocaleString() || 'N/A'}
                          </div>
                          <div className="stat-label">Records</div>
                        </div>
                        <div className="stat-item">
                          <div className="stat-value stat-value-green">
                            {data.metadata?.tableCount || 0}
                          </div>
                          <div className="stat-label">Tables</div>
                        </div>
                      </div>
                    )
                  ) : (
                    <div style={{ textAlign: 'center', padding: '1rem', color: '#6b7280', fontSize: '0.9rem' }}>
                      Click to load data
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Basic Information */}
          <div className="grid-container">
            <div className="card">
              <h3 className="card-header">Basic Information</h3>
              <div className="simple-details">
                <div className="detail-row">
                  <span className="detail-label">Entity ID:</span>
                  <span className="detail-value">{coreData.entity?.entityId || '-'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Legal Name:</span>
                  <span className="detail-value">{coreData.entity?.legalName || '-'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Status:</span>
                  <span className={`status-badge ${
                    coreData.entity?.status === 'Active' 
                      ? 'status-success' 
                      : 'status-error'
                  }`}>
                    {coreData.entity?.status || 'Unknown'}
                  </span>
                </div>
                {/* Active Locations */}
                {coreData.entity?.locationNames && Array.isArray(coreData.entity.locationNames) && coreData.entity.locationNames.length > 0 && (
                  <div className="detail-row">
                    <span className="detail-label">Active Locations:</span>
                    <Tooltip 
                      content={coreData.entity.locationNames.filter((name: any) => name && name.trim()).join(', ')}
                      side="top"
                    >
                      <span 
                        className="detail-value" 
                        style={{ 
                          maxWidth: '350px !important',
                          overflow: 'hidden !important',
                          textOverflow: 'ellipsis !important',
                          whiteSpace: 'nowrap !important',
                          display: 'inline-block !important',
                          cursor: 'help',
                          lineHeight: '1.5rem',
                          height: '1.5rem',
                          wordBreak: 'keep-all'
                        } as React.CSSProperties}
                      >
                        {coreData.entity.locationNames.filter((name: any) => name && name.trim()).join(', ')}
                      </span>
                    </Tooltip>
                  </div>
                )}
                {/* Active Employees */}
                {coreData.entity?.employeeNames && Array.isArray(coreData.entity.employeeNames) && coreData.entity.employeeNames.length > 0 && (
                  <div className="detail-row">
                    <span className="detail-label">Active Employees:</span>
                    <Tooltip 
                      content={coreData.entity.employeeNames.filter((name: any) => name && name.trim()).join(', ')}
                      side="top"
                    >
                      <span 
                        className="detail-value" 
                        style={{ 
                          maxWidth: '350px !important',
                          overflow: 'hidden !important',
                          textOverflow: 'ellipsis !important',
                          whiteSpace: 'nowrap !important',
                          display: 'inline-block !important',
                          cursor: 'help',
                          lineHeight: '1.5rem',
                          height: '1.5rem',
                          wordBreak: 'keep-all'
                        } as React.CSSProperties}
                      >
                        {coreData.entity.employeeNames.filter((name: any) => name && name.trim()).join(', ')}
                      </span>
                    </Tooltip>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <h3 className="card-header">Contact Information</h3>
              <div className="simple-details">
                <div className="detail-row">
                  <span className="detail-label">Phone:</span>
                  <span className="detail-value">{coreData.entity?.phone || '-'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Email:</span>
                  <span className="detail-value">{coreData.entity?.email || '-'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Website:</span>
                  <span className="detail-value">{coreData.entity?.website || '-'}</span>
                </div>
              </div>
            </div>
          </div>


        </TabsContent>

        {/* Category Detail Tabs */}
        {ENTITY_CATEGORIES.map(category => (
          <TabsContent key={category.key} value={category.key} className="space-y-6">
            {/* Special handling for AutoCare tab */}
            {category.key === 'autocare' ? (
              <AutoCareDetail autoCareData={coreData.autoCare} />
            ) : category.key === 'invoices' ? (
              <InvoicesTabContent 
                entityId={entityId!} 
                data={categoryData[category.key]} 
                loading={loadingStates[category.key]}
                navigate={navigate}
              />
            ) : (
              <>
                {loadingStates[category.key] ? (
                  <div className="loading-spinner">
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{category.icon}</div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                      Loading {category.title}...
                    </h3>
                    <p>Please wait while we fetch the data</p>
                  </div>
                ) : categoryData[category.key] ? (
                  <div className="space-y-6">
                    <div className="card" style={{ borderLeft: `4px solid ${category.color}` }}>
                      <div className="card-header">{category.icon} {category.title}</div>
                      <div className="card-meta">{category.description}</div>
                      <div className="card-stats">
                        <div className="stat-item">
                          <div className="stat-value" style={{ color: category.color }}>
                            {categoryData[category.key].metadata?.totalRecords?.toLocaleString() || '0'}
                          </div>
                          <div className="stat-label">Total Records</div>
                        </div>
                        <div className="stat-item">
                          <div className="stat-value" style={{ color: category.color }}>
                            {categoryData[category.key].metadata?.tableCount || 'N/A'}
                          </div>
                          <div className="stat-label">Tables</div>
                        </div>
                        {categoryData[category.key].metadata?.totalRecords === 0 && (
                          <div className="stat-item">
                            <div className="stat-value" style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                              📋 No data - basic processing only
                            </div>
                            <div className="stat-label">Status</div>
                          </div>
                        )}
                        <div className="stat-item">
                          <div className="stat-value" style={{ fontSize: '1rem' }}>
                            {categoryData[category.key].metadata?.exportTimestamp 
                              ? new Date(categoryData[category.key].metadata!.exportTimestamp).toLocaleDateString()
                              : 'N/A'
                            }
                          </div>
                          <div className="stat-label">Last Updated</div>
                        </div>
                      </div>
                    </div>

                    {/* Tables */}
                    <div style={{ display: 'grid', gap: '2rem' }}>
                      {Object.entries(categoryData[category.key])
                        .filter(([key]) => key !== 'metadata')
                        .map(([tableName, tableData]) => {
                          // special handling for Entity main table - convert object to array
                          let displayData = tableData;
                          if (tableName === 'entity' && !Array.isArray(tableData) && tableData) {
                            displayData = [tableData];
                          }
                          
                          return (
                            <div key={tableName} className="card">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h4 className="card-header" style={{ margin: 0 }}>
                                  {tableName === 'entity' ? 'Entity (Main Table)' : tableName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                                </h4>
                                <div className="card-meta" style={{ margin: 0 }}>
                                  {Array.isArray(displayData) ? `${displayData.length} records` : 'No data'}
                                </div>
                              </div>
                              <div className="table-container">
                                <ShadcnDataTable
                                  title={tableName === 'entity' ? 'Entity (Main Table)' : tableName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                                  data={Array.isArray(displayData) ? displayData : []}
                                  itemsPerPage={5}
                                  maxHeight="400px"
                                />
                              </div>
                            </div>
                          );
                        })
                      }
                    </div>
                  </div>
                ) : (
                  <div className="loading-spinner">
                    <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>{category.icon}</div>
                    <h3 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem' }}>
                      {category.title}
                    </h3>
                    <p style={{ marginBottom: '2rem' }}>{category.description}</p>
                    <button
                      onClick={() => loadCategoryData(category.key)}
                      className="btn-primary"
                      style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}
                    >
                      Load {category.title} Data
                    </button>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
      </div>
    </div>
  );
}


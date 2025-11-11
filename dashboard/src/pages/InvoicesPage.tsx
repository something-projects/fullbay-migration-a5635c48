import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import '../App.css';

interface AggregatedInvoice {
  repairOrderInvoiceId: number;
  invoiceNumber: number;
  invoiceDate?: string;
  customerId?: number;
  customerTitle?: string;
  repairOrderId: number;
  repairOrderNumber?: number;
  customerUnitId?: number;
  chargeTotal?: number;
  partsTotal?: number;
  laborHoursTotal?: number;
  laborTotal?: number;
  suppliesTotal?: number;
  taxTotal?: number;
  total?: number;
  balance?: number;
  status?: string;
  exported: boolean;
  sentToFleetNet: boolean;
  sentToIbs: boolean;
  quickBooksId?: string;
  created?: string;
  serviceOrderPath: string;
  paymentCount: number;
  totalPaid: number;
  chargesCount: number;
}

interface InvoiceSummary {
  totalInvoices: number;
  totalRevenue: number;
  totalBalance: number;
  totalPaid: number;
  averageInvoiceAmount: number;
  byStatus: Record<string, number>;
  exported: number;
  notExported: number;
  sentToQuickBooks: number;
  sentToFleetNet: number;
  sentToIbs: number;
  earliestDate?: string;
  latestDate?: string;
}

interface InvoiceData {
  entityId: number;
  summary: InvoiceSummary;
  invoices: AggregatedInvoice[];
  generatedAt: string;
}

export function InvoicesPage() {
  const { entityId } = useParams<{ entityId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'customer'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (!entityId) {
      navigate('/');
      return;
    }

    loadInvoices(entityId);
  }, [entityId, navigate]);

  async function loadInvoices(id: string) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/output/${id}/invoices.json`);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Invoice data not found. Run "npm run aggregate-invoices" in transformer directory first.');
        }
        throw new Error(`Failed to load invoices: ${response.statusText}`);
      }

      const invoiceData: InvoiceData = await response.json();
      setData(invoiceData);
    } catch (err) {
      console.error('Error loading invoices:', err);
      setError(err instanceof Error ? err.message : 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }

  // Filtered and sorted invoices
  const filteredInvoices = useMemo(() => {
    if (!data) return [];

    let filtered = data.invoices;

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(inv =>
        inv.invoiceNumber.toString().includes(term) ||
        inv.customerTitle?.toLowerCase().includes(term) ||
        inv.repairOrderNumber?.toString().includes(term)
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(inv => inv.status === statusFilter);
    }

    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
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

    return filtered;
  }, [data, searchTerm, statusFilter, sortBy, sortOrder]);

  function formatCurrency(amount?: number): string {
    if (amount === undefined || amount === null) return '$0.00';
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatDate(dateString?: string): string {
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
  }

  function handleInvoiceClick(invoice: AggregatedInvoice) {
    // Navigate to the service order detail
    navigate(`/${entityId}/${invoice.serviceOrderPath}`);
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading invoices...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{ background: '#fee2e2', border: '1px solid #ef4444', borderRadius: '0.5rem', padding: '1rem', color: '#991b1b' }}>
          <h3 style={{ margin: '0 0 0.5rem 0' }}>❌ Error Loading Invoices</h3>
          <p style={{ margin: 0 }}>{error}</p>
          {error.includes('not found') && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.5)', borderRadius: '0.25rem' }}>
              <strong>To generate invoice data:</strong>
              <pre style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#000', color: '#0f0', borderRadius: '0.25rem' }}>
                cd transformer{'\n'}
                npm run aggregate-invoices
              </pre>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const summary = data.summary;
  const statusOptions = Object.keys(summary.byStatus);

  return (
    <div style={{ padding: '2rem', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h1 style={{ margin: 0 }}>📋 Invoices</h1>
          <button 
            onClick={() => navigate(`/${entityId}`)}
            style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}
          >
            ← Back to Entity
          </button>
        </div>
        <p style={{ color: '#64748b', margin: 0 }}>
          Entity {entityId} • {summary.totalInvoices} invoices • Generated {formatDate(data.generatedAt)}
        </p>
      </div>

      {/* Summary Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '0.5rem', padding: '1rem' }}>
          <div style={{ fontSize: '0.875rem', color: '#166534', marginBottom: '0.5rem' }}>Total Revenue</div>
          <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#15803d' }}>
            {formatCurrency(summary.totalRevenue)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#166534', marginTop: '0.25rem' }}>
            Avg: {formatCurrency(summary.averageInvoiceAmount)}
          </div>
        </div>

        <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '0.5rem', padding: '1rem' }}>
          <div style={{ fontSize: '0.875rem', color: '#92400e', marginBottom: '0.5rem' }}>Outstanding Balance</div>
          <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#b45309' }}>
            {formatCurrency(summary.totalBalance)}
          </div>
        </div>

        <div style={{ background: '#e0e7ff', border: '1px solid #a5b4fc', borderRadius: '0.5rem', padding: '1rem' }}>
          <div style={{ fontSize: '0.875rem', color: '#3730a3', marginBottom: '0.5rem' }}>Total Paid</div>
          <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#4f46e5' }}>
            {formatCurrency(summary.totalPaid)}
          </div>
        </div>

        <div style={{ background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '0.5rem', padding: '1rem' }}>
          <div style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.5rem' }}>Exported</div>
          <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#1f2937' }}>
            {summary.exported} / {summary.totalInvoices}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
            {Math.round((summary.exported / summary.totalInvoices) * 100)}% exported
          </div>
        </div>
      </div>

      {/* Integration Status */}
      <div style={{ 
        background: '#fefce8', 
        border: '1px solid #fde047', 
        borderRadius: '0.5rem', 
        padding: '1rem',
        marginBottom: '2rem'
      }}>
        <strong style={{ display: 'block', marginBottom: '0.5rem', color: '#854d0e' }}>📊 Integration Status</strong>
        <div style={{ display: 'flex', gap: '2rem', fontSize: '0.875rem', color: '#a16207' }}>
          <span>QuickBooks: {summary.sentToQuickBooks}</span>
          <span>FleetNet: {summary.sentToFleetNet}</span>
          <span>IBS: {summary.sentToIbs}</span>
        </div>
      </div>

      {/* Filters */}
      <div style={{ 
        background: '#fff', 
        border: '1px solid #e5e7eb', 
        borderRadius: '0.5rem', 
        padding: '1rem',
        marginBottom: '1rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem'
      }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', color: '#374151' }}>
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
              borderRadius: '0.25rem',
              fontSize: '0.875rem'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', color: '#374151' }}>
            Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '0.5rem', 
              border: '1px solid #d1d5db', 
              borderRadius: '0.25rem',
              fontSize: '0.875rem'
            }}
          >
            <option value="all">All Statuses</option>
            {statusOptions.map(status => (
              <option key={status} value={status}>{status} ({summary.byStatus[status]})</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', color: '#374151' }}>
            Sort By
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            style={{ 
              width: '100%', 
              padding: '0.5rem', 
              border: '1px solid #d1d5db', 
              borderRadius: '0.25rem',
              fontSize: '0.875rem'
            }}
          >
            <option value="date">Date</option>
            <option value="amount">Amount</option>
            <option value="customer">Customer</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', color: '#374151' }}>
            Order
          </label>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
            style={{ 
              width: '100%', 
              padding: '0.5rem', 
              border: '1px solid #d1d5db', 
              borderRadius: '0.25rem',
              fontSize: '0.875rem'
            }}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
      </div>

      {/* Results Count */}
      <div style={{ marginBottom: '1rem', color: '#64748b', fontSize: '0.875rem' }}>
        Showing {filteredInvoices.length} of {data.invoices.length} invoices
      </div>

      {/* Invoices Table */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600 }}>Invoice #</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600 }}>Date</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600 }}>Customer</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600 }}>RO #</th>
              <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: 600 }}>Total</th>
              <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: 600 }}>Balance</th>
              <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: 600 }}>Payments</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.map((invoice, idx) => (
              <tr 
                key={invoice.repairOrderInvoiceId}
                onClick={() => handleInvoiceClick(invoice)}
                style={{ 
                  borderBottom: idx < filteredInvoices.length - 1 ? '1px solid #f3f4f6' : 'none',
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
                <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: 500, color: (invoice.balance || 0) > 0 ? '#b45309' : '#166534' }}>
                  {formatCurrency(invoice.balance)}
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.75rem' }}>
                  <span style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '0.25rem',
                    background: invoice.status === 'invoiced' ? '#dbeafe' : '#f3f4f6',
                    color: invoice.status === 'invoiced' ? '#1e40af' : '#374151'
                  }}>
                    {invoice.status || 'unknown'}
                  </span>
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.875rem' }}>
                  {invoice.paymentCount > 0 ? (
                    <span style={{ color: '#166534' }}>✓ {invoice.paymentCount}</span>
                  ) : (
                    <span style={{ color: '#9ca3af' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredInvoices.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
            No invoices found matching your filters.
          </div>
        )}
      </div>
    </div>
  );
}


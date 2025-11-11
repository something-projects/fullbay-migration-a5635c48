import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { EntityViewer } from '../App';
import { useToast } from '../hooks/use-toast';
import { BreadcrumbNavigation } from './BreadcrumbNavigation';

interface CustomerDetailPageProps {}

export function CustomerDetailPage({}: CustomerDetailPageProps) {
  const { entityId, customerId } = useParams<{ entityId: string; customerId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entityId || !customerId) {
      setError('Entity ID and Customer ID are required');
      setLoading(false);
      return;
    }

    // Check if customer data was passed via navigation state
    if (location.state?.customer) {
      setCustomer(location.state.customer);
      setLoading(false);
    } else {
      loadCustomerData();
    }
  }, [entityId, customerId, location.state]);

  const loadCustomerData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/output/${entityId}/customers/${customerId}/customer.json`);
      if (!response.ok) {
        throw new Error(`Failed to load customer data: ${response.status}`);
      }
      
      const data = await response.json();
      setCustomer(data);
    } catch (err) {
      console.error('Error loading customer data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load customer data');
      toast({
        title: "Error",
        description: "Failed to load customer data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate(`/entity/${entityId}/customers`);
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Customer Details</h1>
          <p className="dashboard-subtitle">Loading customer information...</p>
        </div>
        <div className="dashboard-content">
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <div className="loading-spinner">Loading customer details...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Customer Details</h1>
          <p className="dashboard-subtitle">Error loading customer</p>
        </div>
        <div className="dashboard-content">
          <div className="breadcrumb">
            <button onClick={handleBack} className="back-button">
              ← Back to Customers
            </button>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: '2rem', background: '#fef2f2', border: '1px solid #fecaca' }}>
            <div style={{ color: '#dc2626', fontSize: '1.1rem', fontWeight: '600' }}>Error: {error}</div>
            <button onClick={loadCustomerData} className="btn-primary" style={{ marginTop: '1rem' }}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Customer Details</h1>
          <p className="dashboard-subtitle">Customer not found</p>
        </div>
        <div className="dashboard-content">
          <div className="breadcrumb">
            <button onClick={handleBack} className="back-button">
              ← Back to Customers
            </button>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: '2rem', background: '#fefbf3', border: '1px solid #fed7aa' }}>
            <div style={{ color: '#ea580c', fontSize: '1.1rem', fontWeight: '600' }}>Customer {customerId} not found</div>
            <button onClick={handleBack} className="btn-primary" style={{ marginTop: '1rem' }}>
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Customer Details</h1>
        <p className="dashboard-subtitle">{customer.name || `Customer ${customerId}`}</p>
      </div>
      <div className="dashboard-content">
        <BreadcrumbNavigation
          pageType="customer-detail"
          entityData={customer}
          onBack={handleBack}
          breadcrumbItems={[
            { label: 'Entities', href: '/', icon: 'Building2' },
            { label: `Entity ${entityId}`, href: `/entity/${entityId}`, icon: 'Building' },
            { label: 'Customers', href: `/entity/${entityId}`, icon: 'Users' },
            { label: customer?.name || `Customer ${customerId}`, current: true, icon: 'User' }
          ]}
        />
        
        <EntityViewer 
          data={customer} 
          title={`Customer ${customerId} Details`} 
          type="customer" 
        />
      </div>
    </div>
  );
}
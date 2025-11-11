import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { EntityViewer } from '../App';
import { useToast } from '../hooks/use-toast';
import { BreadcrumbNavigation } from './BreadcrumbNavigation';

interface ServiceOrderDetailPageProps {}

export function ServiceOrderDetailPage({}: ServiceOrderDetailPageProps) {
  const { entityId, customerId, unitId, orderId } = useParams<{ entityId: string; customerId: string; unitId: string; orderId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [serviceOrder, setServiceOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entityId || !customerId || !unitId || !orderId) {
      setError('Entity ID, Customer ID, Unit ID and Order ID are required');
      setLoading(false);
      return;
    }

    // Check if service order data was passed via navigation state
    if (location.state?.serviceOrder) {
      setServiceOrder(location.state.serviceOrder);
      setLoading(false);
    } else {
      loadServiceOrderData();
    }
  }, [entityId, customerId, unitId, orderId, location.state]);

  const loadServiceOrderData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/output/${entityId}/customers/${customerId}/units/${unitId}/service-orders/${orderId}/service-order.json`);
      if (!response.ok) {
        throw new Error(`Failed to load service order data: ${response.status}`);
      }
      
      const data = await response.json();
      setServiceOrder(data);
    } catch (err) {
      console.error('Error loading service order data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load service order data');
      toast({
        title: "Error",
        description: "Failed to load service order data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate(`/entity/${entityId}/customer/${customerId}/unit/${unitId}`);
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Service Order Details</h1>
          <p className="dashboard-subtitle">Loading service order information...</p>
        </div>
        <div className="dashboard-content">
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <div className="loading-spinner">Loading service order details...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Service Order Details</h1>
          <p className="dashboard-subtitle">Error loading service order</p>
        </div>
        <div className="dashboard-content">
          <div className="breadcrumb">
            <button onClick={handleBack} className="back-button">
              ← Back to Service Orders
            </button>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: '2rem', background: '#fef2f2', border: '1px solid #fecaca' }}>
            <div style={{ color: '#dc2626', fontSize: '1.1rem', fontWeight: '600' }}>Error: {error}</div>
            <button onClick={loadServiceOrderData} className="btn-primary" style={{ marginTop: '1rem' }}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!serviceOrder) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Service Order Details</h1>
          <p className="dashboard-subtitle">Service order not found</p>
        </div>
        <div className="dashboard-content">
          <div className="breadcrumb">
            <button onClick={handleBack} className="back-button">
              ← Back to Service Orders
            </button>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: '2rem', background: '#fefbf3', border: '1px solid #fed7aa' }}>
            <div style={{ color: '#ea580c', fontSize: '1.1rem', fontWeight: '600' }}>Service Order {orderId} not found</div>
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
        <h1 className="dashboard-title">Service Order Details</h1>
        <p className="dashboard-subtitle">{serviceOrder.orderNumber || `Service Order ${orderId}`}</p>
      </div>
      <div className="dashboard-content">
        <BreadcrumbNavigation
          pageType="service-order-detail"
          entityData={serviceOrder}
          onBack={handleBack}
          breadcrumbItems={[
            { label: 'Entities', href: '/', icon: 'Building2' },
            { label: `Entity ${entityId}`, href: `/entity/${entityId}`, icon: 'Building' },
            { label: 'Customers', href: `/entity/${entityId}`, icon: 'Users' },
            { label: `Customer ${customerId}`, href: `/entity/${entityId}/customer/${customerId}`, icon: 'User' },
            { label: 'Units', href: `/entity/${entityId}/customer/${customerId}`, icon: 'Truck' },
            { label: `Unit ${unitId}`, href: `/entity/${entityId}/customer/${customerId}/unit/${unitId}`, icon: 'Truck' },
            { label: 'Service Orders', href: `/entity/${entityId}/customer/${customerId}/unit/${unitId}`, icon: 'Wrench' },
            { label: serviceOrder?.orderNumber || `Service Order ${orderId}`, current: true, icon: 'Wrench' }
          ]}
        />
        
        <EntityViewer 
          data={serviceOrder} 
          title={`Service Order ${orderId} Details`} 
          type="service-order" 
        />
      </div>
    </div>
  );
}
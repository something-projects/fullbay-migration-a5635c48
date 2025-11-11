import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { EntityViewer } from '../App';
import { useToast } from '../hooks/use-toast';
import { BreadcrumbNavigation } from './BreadcrumbNavigation';

interface UnitDetailPageProps {}

export function UnitDetailPage({}: UnitDetailPageProps) {
  const { entityId, customerId, unitId } = useParams<{ entityId: string; customerId: string; unitId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [unit, setUnit] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entityId || !customerId || !unitId) {
      setError('Entity ID, Customer ID and Unit ID are required');
      setLoading(false);
      return;
    }

    // Always load from file to ensure complete data including unitType
    // Don't use location.state.unit as it might be incomplete
    loadUnitData();
  }, [entityId, customerId, unitId, location.state]);

  const loadUnitData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/output/${entityId}/customers/${customerId}/units/${unitId}/entity.json`);
      if (!response.ok) {
        throw new Error(`Failed to load unit data: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('🔍 Unit data loaded:', data);
      console.log('🔍 Has unitType:', 'unitType' in data);
      console.log('🔍 unitType value:', data.unitType);
      setUnit(data);
    } catch (err) {
      console.error('Error loading unit data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load unit data');
      toast({
        title: "Error",
        description: "Failed to load unit data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate(`/entity/${entityId}/customer/${customerId}`);
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Unit Details</h1>
          <p className="dashboard-subtitle">Loading unit information...</p>
        </div>
        <div className="dashboard-content">
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <div className="loading-spinner">Loading unit details...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Unit Details</h1>
          <p className="dashboard-subtitle">Error loading unit</p>
        </div>
        <div className="dashboard-content">
          <div className="breadcrumb">
            <button onClick={handleBack} className="back-button">
              ← Back to Units
            </button>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: '2rem', background: '#fef2f2', border: '1px solid #fecaca' }}>
            <div style={{ color: '#dc2626', fontSize: '1.1rem', fontWeight: '600' }}>Error: {error}</div>
            <button onClick={loadUnitData} className="btn-primary" style={{ marginTop: '1rem' }}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!unit) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Unit Details</h1>
          <p className="dashboard-subtitle">Unit not found</p>
        </div>
        <div className="dashboard-content">
          <div className="breadcrumb">
            <button onClick={handleBack} className="back-button">
              ← Back to Units
            </button>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: '2rem', background: '#fefbf3', border: '1px solid #fed7aa' }}>
            <div style={{ color: '#ea580c', fontSize: '1.1rem', fontWeight: '600' }}>Unit {unitId} not found</div>
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
        <h1 className="dashboard-title">Unit Details</h1>
        <p className="dashboard-subtitle">{unit.name || `Unit ${unitId}`}</p>
      </div>
      <div className="dashboard-content">
        <BreadcrumbNavigation
          pageType="unit-detail"
          entityData={unit}
          onBack={handleBack}
          breadcrumbItems={[
            { label: 'Entities', href: '/', icon: 'Building2' },
            { label: `Entity ${entityId}`, href: `/entity/${entityId}`, icon: 'Building' },
            { label: 'Customers', href: `/entity/${entityId}`, icon: 'Users' },
            { label: `Customer ${customerId}`, href: `/entity/${entityId}/customer/${customerId}`, icon: 'User' },
            { label: 'Units', href: `/entity/${entityId}/customer/${customerId}`, icon: 'Truck' },
            { label: unit?.name || `Unit ${unitId}`, current: true, icon: 'Truck' }
          ]}
        />
        
        <EntityViewer 
          data={unit} 
          title={`Unit ${unitId} Details`} 
          type="unit" 
        />
      </div>
    </div>
  );
}
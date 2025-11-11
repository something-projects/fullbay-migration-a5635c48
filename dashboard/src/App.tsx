import { useState, useEffect, JSXElementConstructor, Key, ReactElement, ReactNode, ReactPortal } from 'react';
import { useParams, useNavigate, Routes, Route } from 'react-router-dom';
// import { EnhancedEntityViewer } from './components/EnhancedEntityViewer'; // Unused import
import { Toaster } from './components/ui/toaster';
import { useToast } from './hooks/use-toast';
import { EntityDetailPage } from './components/EntityDetailPage';
// import { EnhancedEntityDetailPage } from './components/EnhancedEntityDetailPage';
import { ImprovedEntityDetailPage } from './components/ImprovedEntityDetailPage';
import { CustomerDetailPage } from './components/CustomerDetailPage';
import { UnitDetailPage } from './components/UnitDetailPage';
import { ServiceOrderDetailPage } from './components/ServiceOrderDetailPage';
import { AnalyticsDashboard } from './components/analytics/AnalyticsDashboard';
import { AppStateProvider, useAppState, isCacheValid } from './contexts/AppStateContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import { BreadcrumbNavigation } from './components/BreadcrumbNavigation';
import { ListPagination } from './components/ui/list-pagination';
import { EntitySearch, SearchResultsInfo } from './components/EntitySearch';
import { HighlightedText } from './components/ui/highlighted-text';

import './App.css';

const API_BASE = '/output';

// Extend Window interface for temporary properties
declare global {
  interface Window {
    tempOrderIds?: any;
    tempTotalOrders?: number;
  }
}

// Types
interface ActionItem {
  repairOrderActionItemId: number;
  actionItemType: string;
  actionItemTypeMisc?: string;
  status: string;
  hours?: number;
  totalAmount?: number;
  created: string;
  modified: string;
}

interface EntityViewerProps {
  data: any;
  title: string;
  type?: 'entity' | 'customer' | 'unit' | 'service-order';
}

// Entity Data Viewer Component
function EntityViewer({ data, title, type = 'entity' }: EntityViewerProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'json'>('details');
  
  // Component Systems pagination state
  const [componentSystemsPage, setComponentSystemsPage] = useState(1);
  const componentSystemsPerPage = 20;
  
  // System Corrections pagination state
  const [systemCorrectionsPage, setSystemCorrectionsPage] = useState(1);
  const systemCorrectionsPerPage = 20;
  
  const handleTabChange = (value: string) => {
    if (value === 'details' || value === 'json') {
      setActiveTab(value);
    }
  };

  const renderPrettyView = () => {
    if (type === 'entity') {
      return (
        <div className="pretty-view">
          <div className="detail-group">
            <h4>Basic Information</h4>
            <div className="detail-row">
              <span className="detail-label">Legal Name:</span>
              <span className="detail-value">{data.legalName}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Title:</span>
              <span className="detail-value">{data.title}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Status:</span>
              <span className={`status-badge ${data.status === 'Active' ? 'status-success' : 'status-error'}`}>
                {data.status}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Entity ID:</span>
              <span className="detail-value">{data.entityId}</span>
            </div>
          </div>

          <div className="detail-group">
            <h4>Contact Information</h4>
            <div className="detail-row">
              <span className="detail-label">Phone:</span>
              <span className="detail-value">{data.phone}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Email:</span>
              <span className="detail-value">{data.email}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Website:</span>
              <span className="detail-value">
                {data.website ? (
                  <a 
                    href={data.website.startsWith('http') ? data.website : `https://${data.website}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    title={data.website}
                    style={{ 
                      maxWidth: '300px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'inline-block',
                      textDecoration: 'underline',
                      color: '#007bff'
                    }}
                  >
                    {data.website}
                  </a>
                ) : (
                  'N/A'
                )}
              </span>
            </div>
          </div>

          <div className="detail-group">
            <h4>Business Details</h4>
            <div className="detail-row">
              <span className="detail-label">Tax ID:</span>
              <span className="detail-value">{data.taxId}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Number:</span>
              <span className="detail-value">{data.number}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Created:</span>
              <span className="detail-value">{new Date(data.created).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Simple Shop Data Section */}
          {data.isSimpleShop && (
            <>
              {/* Simple Shop Data Separator */}
              <div style={{ width: '100%', margin: '2rem 0' }}>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', inset: '0', display: 'flex', alignItems: 'center' }}>
                    <div style={{ width: '100%', borderTop: '2px solid #d1d5db' }}></div>
                  </div>
                  <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                    <span style={{ 
                      backgroundColor: '#f8fafc', 
                      padding: '0 1rem', 
                      fontSize: '0.875rem', 
                      fontWeight: '500', 
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      🏪 Simple Shop Data
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="detail-group">
                <h4>🏪 Simple Shop</h4>
                {/* Hide the "Simple Shop: Yes" row since it's redundant */}
                <div className="detail-row">
                  <span className="detail-label">Locations:</span>
                  <span className="detail-value">{data.locationCount}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Employees:</span>
                  <span className="detail-value">{data.employeeCount}</span>
                </div>
                {data.locationNames && data.locationNames.length > 0 && (
                  <div className="detail-row">
                    <span className="detail-label">Location Names:</span>
                    <span className="detail-value">{data.locationNames.join(', ')}</span>
                  </div>
                )}
                {data.employeeNames && data.employeeNames.length > 0 && (
                  <div className="detail-row">
                    <span className="detail-label">Employee Names:</span>
                    <span className="detail-value">{data.employeeNames.join(', ')}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Accounting Information - only show for non-Simple Shop entities */}
          {!data.isSimpleShop && data.accounting && (
            <div className="detail-group">
              <h4>💰 Accounting Summary</h4>
              <div className="detail-row">
                <span className="detail-label">Total Revenue:</span>
                <span className="detail-value">${data.accounting.totalRevenue?.toLocaleString() || '0'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Total Invoices:</span>
                <span className="detail-value">{data.accounting.totalInvoices || 0}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Average Invoice:</span>
                <span className="detail-value">${data.accounting.averageInvoiceAmount?.toLocaleString() || '0'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Pending Payments:</span>
                <span className="detail-value">${data.accounting.pendingPayments?.toLocaleString() || '0'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Completed Orders:</span>
                <span className="detail-value">{data.accounting.completedOrders || 0}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Pending Orders:</span>
                <span className="detail-value">{data.accounting.pendingOrders || 0}</span>
              </div>
              {data.accounting.lastInvoiceDate && (
                <div className="detail-row">
                  <span className="detail-label">Last Invoice Date:</span>
                  <span className="detail-value">{new Date(data.accounting.lastInvoiceDate).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          )}

          {/* Units Information - only show for non-Simple Shop entities */}
          {!data.isSimpleShop && data.units && (
            <div className="detail-group">
              <h4>🚛 Units Summary</h4>
              <div className="detail-row">
                <span className="detail-label">Total Units:</span>
                <span className="detail-value">{data.units.totalUnits || 0}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Active Units:</span>
                <span className="detail-value">{data.units.activeUnits || 0}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Units Serviced This Year:</span>
                <span className="detail-value">{data.units.unitsServicedThisYear || 0}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Total Customers:</span>
                <span className="detail-value">{data.units.totalCustomers || 0}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Units w/ Active Orders:</span>
                <span className="detail-value">{data.units.unitsWithActiveServiceOrders || 0}</span>
              </div>
              {data.units.mostCommonUnitType && (
                <div className="detail-row">
                  <span className="detail-label">Most Common Unit Type:</span>
                  <span className="detail-value">{data.units.mostCommonUnitType}</span>
                </div>
              )}
              {data.units.unitTypes && data.units.unitTypes.length > 0 && (
                <div className="detail-row">
                  <span className="detail-label">Unit Types:</span>
                  <span className="detail-value">{data.units.unitTypes.join(', ')}</span>
                </div>
              )}
            </div>
          )}

        </div>
      );
    } else if (type === 'customer') {
      return (
        <div className="pretty-view">
          <div className="detail-group">
            <h4>Customer Information</h4>
            <div className="detail-row">
              <span className="detail-label">Legal Name:</span>
              <span className="detail-value">{data.legalName}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Title:</span>
              <span className="detail-value">{data.title}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Customer ID:</span>
              <span className="detail-value">{data.customerId}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Status:</span>
              <span className={`status-badge ${data.status === 'Confirmed' ? 'status-success' : 'status-error'}`}>
                {data.status}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Code:</span>
              <span className="detail-value">{data.code}</span>
            </div>
          </div>

          <div className="detail-group">
            <h4>Contact & Financial</h4>
            <div className="detail-row">
              <span className="detail-label">Phone:</span>
              <span className="detail-value">{data.phone}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Email:</span>
              <span className="detail-value">{data.email}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">DOT Number:</span>
              <span className="detail-value">{data.dotNumber}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Credit Limit:</span>
              <span className="detail-value">${data.creditLimit?.toLocaleString()}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Credit Terms:</span>
              <span className="detail-value">{data.creditTerms}</span>
            </div>
          </div>
        </div>
      );
    } else if (type === 'unit') {
      return (
        <div className="pretty-view">
          <div className="detail-group">
            <h4>Unit Information</h4>
            <div className="detail-row">
              <span className="detail-label">Title:</span>
              <span className="detail-value">{data.title}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Unit ID:</span>
              <span className="detail-value">{data.customerUnitId}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Fleet Number:</span>
              <span className="detail-value">{data.fleetNumber}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">License Plate:</span>
              <span className="detail-value">{data.licensePlate} ({data.licensePlateState})</span>
            </div>
          </div>

          <div className="detail-group">
            <h4>Vehicle Details</h4>
            <div className="detail-row">
              <span className="detail-label">Year/Make/Model:</span>
              <span className="detail-value">{data.year} {data.make} {data.model}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">VIN:</span>
              <span className="detail-value">{data.vin}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Engine:</span>
              <span className="detail-value">{data.engineMake} {data.engineModel}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Transmission:</span>
              <span className="detail-value">{data.transmissionMake} {data.transmissionModel}</span>
            </div>
          </div>

          {data.standardizedVehicle && (
            <div className="detail-group">
              <h4>🚗 AutoCare VCdb Standard Vehicle</h4>
              <div className="detail-row">
                <span className="detail-label">Standardized Make:</span>
                <span className="detail-value">
                  {data.standardizedVehicle.makeName} 
                  <span className="autocare-id">(ID: {data.standardizedVehicle.makeId})</span>
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Standardized Model:</span>
                <span className="detail-value">
                  {data.standardizedVehicle.modelName}
                  <span className="autocare-id">(ID: {data.standardizedVehicle.modelId})</span>
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Standard Year:</span>
                <span className="detail-value">{data.standardizedVehicle.year}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Base Vehicle ID:</span>
                <span className="detail-value">{data.standardizedVehicle.baseVehicleId}</span>
              </div>
              {data.standardizedVehicle.subModelName && (
                <div className="detail-row">
                  <span className="detail-label">Sub Model:</span>
                  <span className="detail-value">{data.standardizedVehicle.subModelName}</span>
                </div>
              )}
              <div className="detail-row">
                <span className="detail-label">Match Confidence:</span>
                <span className={`confidence-badge ${data.standardizedVehicle.confidence === 1 ? 'confidence-high' : 'confidence-medium'}`}>
                  {(data.standardizedVehicle.confidence * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          )}

          {data.vehicleAlternatives && data.vehicleAlternatives.length > 0 && (
            <div className="detail-group">
              <h4>🔄 Alternative Vehicle Matches ({data.vehicleAlternatives.length})</h4>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Make</th>
                      <th>Model</th>
                      <th>Year</th>
                      <th>Base Vehicle ID</th>
                      <th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.vehicleAlternatives.map((alternative: any, index: number) => (
                      <tr key={alternative.baseVehicleId || index}>
                        <td>
                          <strong>{alternative.makeName}</strong>
                          <span className="autocare-id">(ID: {alternative.makeId})</span>
                        </td>
                        <td>
                          <strong>{alternative.modelName}</strong>
                          <span className="autocare-id">(ID: {alternative.modelId})</span>
                        </td>
                        <td><strong>{alternative.year}</strong></td>
                        <td>{alternative.baseVehicleId}</td>
                        <td>
                          <span style={{
                            color: alternative.confidence >= 0.8 ? '#28a745' :
                                   alternative.confidence >= 0.6 ? '#ffc107' : '#dc3545',
                            fontWeight: 'bold'
                          }}>
                            {(alternative.confidence * 100).toFixed(1)}%
                          </span>
                          {alternative.isAlternative && (
                            <span className="status-badge status-info" style={{marginLeft: '8px', fontSize: '11px'}}>
                              Alt
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.unitType && (
            <div className="detail-group">
              <h4>🏷️ Unit Type Information</h4>
              <div className="detail-row">
                <span className="detail-label">Unit Type:</span>
                <span className="detail-value">
                  <strong>{data.unitType.title}</strong>
                  <span className="autocare-id">(ID: {data.unitType.entityUnitTypeId})</span>
                </span>
              </div>
              {data.unitType.preferredVehicleIdLabel && (
                <div className="detail-row">
                  <span className="detail-label">Vehicle ID Label:</span>
                  <span className="detail-value">{data.unitType.preferredVehicleIdLabel}</span>
                </div>
              )}
              {data.unitType.parentEntityUnitTypeId > 0 && (
                <div className="detail-row">
                  <span className="detail-label">Parent Type ID:</span>
                  <span className="detail-value">{data.unitType.parentEntityUnitTypeId}</span>
                </div>
              )}
              <div className="detail-row">
                <span className="detail-label">Configuration:</span>
                <span className="detail-value">
                  <span className={`status-badge ${data.unitType.isDefault ? 'status-info' : 'status-secondary'}`}>
                    {data.unitType.isDefault ? 'Default Type' : 'Custom Type'}
                  </span>
                  {data.unitType.disableVinValidation && (
                    <span className="status-badge status-warning" style={{marginLeft: '8px'}}>
                      VIN Validation Disabled
                    </span>
                  )}
                  {data.unitType.excludeFromCarCount && (
                    <span className="status-badge status-info" style={{marginLeft: '8px'}}>
                      Excluded from Count
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}

          {data.unitType && data.unitType.components && data.unitType.components.length > 0 && (
            <div className="detail-group">
              <h4>🔧 Unit Components ({data.unitType.components.length})</h4>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Component ID</th>
                      <th>Labor Rate ID</th>
                      <th>Track Usage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.unitType.components.map((component: any, index: number) => (
                      <tr key={component.entityUnitTypeEntityComponentEntryId || index}>
                        <td><strong>{component.entityComponentId}</strong></td>
                        <td>{component.entityLaborRateId || 'N/A'}</td>
                        <td>
                          {component.trackUsage ? (
                            <span className="status-badge status-info">{component.trackUsage}</span>
                          ) : (
                            <span style={{color: '#999'}}>No tracking</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.unitType && data.unitType.componentSystems && data.unitType.componentSystems.length > 0 && (() => {
            const totalSystems = data.unitType.componentSystems.length;
            const totalPages = Math.ceil(totalSystems / componentSystemsPerPage);
            const startIndex = (componentSystemsPage - 1) * componentSystemsPerPage;
            const endIndex = Math.min(startIndex + componentSystemsPerPage, totalSystems);
            const currentPageSystems = data.unitType.componentSystems.slice(startIndex, endIndex);
            
            return (
              <div className="detail-group">
                <h4>⚙️ Component Systems ({totalSystems})</h4>
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>System Entry ID</th>
                        <th>Component System ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentPageSystems.map((system: any, index: number) => (
                        <tr key={system.entityUnitTypeEntityComponentSystemEntryId || index}>
                          <td><strong>{system.entityUnitTypeEntityComponentSystemEntryId}</strong></td>
                          <td>{system.entityComponentSystemId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* Component Systems Pagination */}
                {totalPages > 1 && (
                  <ListPagination
                    currentPage={componentSystemsPage}
                    totalPages={totalPages}
                    onPageChange={setComponentSystemsPage}
                    itemsPerPage={componentSystemsPerPage}
                    totalItems={totalSystems}
                    itemName="systems"
                  />
                )}
              </div>
            );
          })()}

          {data.unitType && data.unitType.componentSystemCorrections && data.unitType.componentSystemCorrections.length > 0 && (() => {
            const totalCorrections = data.unitType.componentSystemCorrections.length;
            const totalPages = Math.ceil(totalCorrections / systemCorrectionsPerPage);
            const startIndex = (systemCorrectionsPage - 1) * systemCorrectionsPerPage;
            const endIndex = Math.min(startIndex + systemCorrectionsPerPage, totalCorrections);
            const currentPageCorrections = data.unitType.componentSystemCorrections.slice(startIndex, endIndex);
            
            return (
              <div className="detail-group">
                <h4>🔄 System Corrections ({totalCorrections})</h4>
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Correction Entry ID</th>
                        <th>System Correction ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentPageCorrections.map((correction: any, index: number) => (
                        <tr key={correction.entityUnitTypeEntityComponentSystemCorrectionEntryId || index}>
                          <td><strong>{correction.entityUnitTypeEntityComponentSystemCorrectionEntryId}</strong></td>
                          <td>{correction.entityComponentSystemCorrectionId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* System Corrections Pagination */}
                {totalPages > 1 && (
                  <ListPagination
                    currentPage={systemCorrectionsPage}
                    totalPages={totalPages}
                    onPageChange={setSystemCorrectionsPage}
                    itemsPerPage={systemCorrectionsPerPage}
                    totalItems={totalCorrections}
                    itemName="corrections"
                  />
                )}
              </div>
            );
          })()}

          {data.subUnitType && (
            <div className="detail-group">
              <h4>🏷️ Sub Unit Type Information</h4>
              <div className="detail-row">
                <span className="detail-label">Sub Unit Type:</span>
                <span className="detail-value">
                  <strong>{data.subUnitType.title}</strong>
                  <span className="autocare-id">(ID: {data.subUnitType.entityUnitTypeId})</span>
                </span>
              </div>
              {data.subUnitType.preferredVehicleIdLabel && (
                <div className="detail-row">
                  <span className="detail-label">Vehicle ID Label:</span>
                  <span className="detail-value">{data.subUnitType.preferredVehicleIdLabel}</span>
                </div>
              )}
              {data.subUnitType.parentEntityUnitTypeId > 0 && (
                <div className="detail-row">
                  <span className="detail-label">Parent Type ID:</span>
                  <span className="detail-value">
                    {data.subUnitType.parentEntityUnitTypeId}
                    {data.unitType && data.subUnitType.parentEntityUnitTypeId === data.unitType.entityUnitTypeId && (
                      <span style={{marginLeft: '8px', color: '#666', fontSize: '12px'}}>
                        (references main unit type)
                      </span>
                    )}
                  </span>
                </div>
              )}
              <div className="detail-row">
                <span className="detail-label">Configuration:</span>
                <span className="detail-value">
                  <span className={`status-badge ${data.subUnitType.isDefault ? 'status-info' : 'status-secondary'}`}>
                    {data.subUnitType.isDefault ? 'Default Type' : 'Custom Type'}
                  </span>
                  {data.subUnitType.disableVinValidation && (
                    <span className="status-badge status-warning" style={{marginLeft: '8px'}}>
                      VIN Validation Disabled
                    </span>
                  )}
                  {data.subUnitType.excludeFromCarCount && (
                    <span className="status-badge status-info" style={{marginLeft: '8px'}}>
                      Excluded from Count
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}

          {data.subUnitType && data.subUnitType.components && data.subUnitType.components.length > 0 && (
            <div className="detail-group">
              <h4>🔧 Sub Unit Components ({data.subUnitType.components.length})</h4>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Component ID</th>
                      <th>Labor Rate ID</th>
                      <th>Track Usage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.subUnitType.components.map((component: any, index: number) => (
                      <tr key={component.entityUnitTypeEntityComponentEntryId || index}>
                        <td><strong>{component.entityComponentId}</strong></td>
                        <td>{component.entityLaborRateId || 'N/A'}</td>
                        <td>
                          {component.trackUsage ? (
                            <span className="status-badge status-info">{component.trackUsage}</span>
                          ) : (
                            <span style={{color: '#999'}}>No tracking</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="detail-group">
            <h4>Service Information</h4>
            <div className="detail-row">
              <span className="detail-label">Mileage:</span>
              <span className="detail-value">{data.mileage?.toLocaleString()} miles</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Hours:</span>
              <span className="detail-value">{data.hoursOfOperation?.toLocaleString()} hours</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Last Updated:</span>
              <span className="detail-value">{new Date(data.mileageDate || data.modified).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      );
    } else if (type === 'service-order') {
      return (
        <div className="pretty-view">
          <div className="detail-group">
            <h4>Service Order Information</h4>
            <div className="detail-row">
              <span className="detail-label">Order ID:</span>
              <span className="detail-value">{data.repairOrderId}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Order Number:</span>
              <span className="detail-value">{data.repairOrderNumber}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Description:</span>
              <span className="detail-value">{data.description || 'No description'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Status:</span>
              <span className={`status-badge ${data.workFlowStatus === 'done' ? 'status-success' : 'status-warning'}`}>
                {data.workFlowStatus}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Type:</span>
              <span className="detail-value">{data.repairOrderType}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Priority:</span>
              <span className="detail-value">{data.priority}</span>
            </div>
          </div>

          <div className="detail-group">
            <h4>Financial Information</h4>
            {(() => {
              // Prioritize invoice data, fallback to totalAmount
              const actualTotal = data.invoice?.total ? parseFloat(data.invoice.total) : (data.totalAmount || 0);
              const actualBalance = data.invoice?.balance ? parseFloat(data.invoice.balance) : (data.balanceAmount || 0);
              const actualPaid = actualTotal - actualBalance;
              
              return (
                <>
                  <div className="detail-row">
                    <span className="detail-label">Total Amount:</span>
                    <span className="detail-value">${actualTotal.toLocaleString()}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Balance Amount:</span>
                    <span className="detail-value">${actualBalance.toLocaleString()}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Paid Amount:</span>
                    <span className="detail-value">${actualPaid.toLocaleString()}</span>
                  </div>
                </>
              );
            })()}
          </div>

          {data.invoice && (
            <div className="detail-group">
              <h4>Invoice Details</h4>
              <div className="detail-row">
                <span className="detail-label">Invoice Number:</span>
                <span className="detail-value">{data.invoice.invoiceNumber}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Invoice Status:</span>
                <span className="detail-value">
                  <span className={`status-badge ${data.invoice.status === 'paid' ? 'status-success' : 'status-warning'}`}>
                    {data.invoice.status}
                  </span>
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Invoice Date:</span>
                <span className="detail-value">{new Date(data.invoice.invoiceDate).toLocaleDateString()}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Parts Total:</span>
                <span className="detail-value">${parseFloat(data.invoice.partsTotal || '0').toLocaleString()}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Labor Total:</span>
                <span className="detail-value">${parseFloat(data.invoice.laborTotal || '0').toLocaleString()}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Labor Hours:</span>
                <span className="detail-value">{parseFloat(data.invoice.laborHoursTotal || '0').toFixed(2)} hours</span>
              </div>
              {data.invoice.suppliesTotal && parseFloat(data.invoice.suppliesTotal) > 0 && (
                <div className="detail-row">
                  <span className="detail-label">Supplies Total:</span>
                  <span className="detail-value">${parseFloat(data.invoice.suppliesTotal).toLocaleString()}</span>
                </div>
              )}
              {data.invoice.taxTotal && parseFloat(data.invoice.taxTotal) > 0 && (
                <div className="detail-row">
                  <span className="detail-label">Tax Total:</span>
                  <span className="detail-value">${parseFloat(data.invoice.taxTotal).toLocaleString()}</span>
                </div>
              )}
            </div>
          )}

          {data.invoicePayments && data.invoicePayments.length > 0 && (
            <div className="detail-group">
              <h4>Payment History ({data.invoicePayments.length})</h4>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Amount</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoicePayments.map((payment: any, index: number) => (
                      <tr key={payment.repairOrderInvoicePaymentId || index}>
                        <td>${parseFloat(payment.amount || '0').toLocaleString()}</td>
                        <td>{new Date(payment.created).toLocaleDateString()}</td>
                        <td>{payment.type || 'N/A'}</td>
                        <td>{payment.description || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.charges && data.charges.length > 0 && (
            <div className="detail-group">
              <h4>Additional Charges ({data.charges.length})</h4>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Amount</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.charges.map((charge: any, index: number) => (
                      <tr key={charge.repairOrderChargeId || index}>
                        <td>{charge.description || 'N/A'}</td>
                        <td>${parseFloat(charge.amount || '0').toLocaleString()}</td>
                        <td>{new Date(charge.created).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="detail-group">
            <h4>Dates & Timeline</h4>
            <div className="detail-row">
              <span className="detail-label">Created:</span>
              <span className="detail-value">{new Date(data.created).toLocaleString()}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Modified:</span>
              <span className="detail-value">{new Date(data.modified).toLocaleString()}</span>
            </div>
          </div>

          <div className="detail-group">
            <h4>Assignments</h4>
            <div className="detail-row">
              <span className="detail-label">Created By Employee:</span>
              <span className="detail-value">{data.createdByEntityEmployeeId}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Assigned Employee:</span>
              <span className="detail-value">{data.entityEmployeeId}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Service Writer:</span>
              <span className="detail-value">{data.serviceWriterEntityEmployeeId}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Parts Employee:</span>
              <span className="detail-value">{data.partsEntityEmployeeId || 'Not assigned'}</span>
            </div>
          </div>

          {data.actionItems && data.actionItems.length > 0 && (
            <div className="detail-group">
              <h4>Action Items ({data.actionItems.length})</h4>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Hours</th>
                      <th>Amount</th>
                      <th>Created</th>
                      <th>Modified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.actionItems.map((item: ActionItem, index: number) => (
                      <tr key={item.repairOrderActionItemId || index}>
                        <td>
                          {item.actionItemType}
                          {item.actionItemTypeMisc && <div style={{fontSize: '12px', color: '#666'}}>({item.actionItemTypeMisc})</div>}
                        </td>
                        <td>
                          <span className={`status-badge ${item.status === 'done' ? 'status-success' : 'status-warning'}`}>
                            {item.status}
                          </span>
                        </td>
                        <td>{parseFloat(item.hours?.toString() || '0').toFixed(2)}</td>
                        <td>${(item.totalAmount || 0).toLocaleString()}</td>
                        <td>{new Date(item.created).toLocaleDateString()}</td>
                        <td>{new Date(item.modified).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}


          {data.corrections && data.corrections.length > 0 && (
            <div className="detail-group">
              <h4>Repair Procedures ({data.corrections.length})</h4>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Description</th>
                      <th>Hours</th>
                      <th>Part Cost</th>
                      <th>Labor Cost</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.corrections.map((correction: any, index: number) => (
                      <tr key={correction.repairOrderActionItemCorrectionId || index}>
                        <td>{correction.title || 'N/A'}</td>
                        <td>
                          <div style={{maxWidth: '300px', fontSize: '14px'}}>
                            {correction.description || 'No description'}
                          </div>
                          {correction.actualCorrection && correction.actualCorrection !== correction.description && (
                            <div style={{fontSize: '12px', color: '#666', marginTop: '4px'}}>
                              <strong>Actual:</strong> {correction.actualCorrection}
                            </div>
                          )}
                        </td>
                        <td>{parseFloat(correction.hours || '0').toFixed(2)}</td>
                        <td>${parseFloat(correction.partCost || '0').toLocaleString()}</td>
                        <td>${parseFloat(correction.hoursCost || '0').toLocaleString()}</td>
                        <td>
                          <span className={`status-badge ${correction.correctionPerformed === 'Performed' ? 'status-success' : 'status-warning'}`}>
                            {correction.correctionPerformed || 'Pending'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.correctionParts && data.correctionParts.length > 0 && (
            <div className="detail-group">
              <h4>Required Parts ({data.correctionParts.length})</h4>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th>Description</th>
                      <th>Quantity</th>
                      <th>Shop Number</th>
                      <th>Vendor Number</th>
                      <th>Unit Cost</th>
                      <th>Total Cost</th>
                      <th>Installed</th>
                      <th>AutoCare Match</th>
                      <th>Match Type</th>
                      <th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.correctionParts.map((part: any, index: number) => (
                      <tr key={part.repairOrderActionItemCorrectionPartId || index}>
                        <td><strong>{part.title}</strong></td>
                        <td>{part.description || 'N/A'}</td>
                        <td>{parseFloat(part.quantity || '0').toFixed(2)}</td>
                        <td>{part.shopNumber || 'N/A'}</td>
                        <td>{part.vendorNumber || 'N/A'}</td>
                        <td>${parseFloat(part.partCost || '0').toLocaleString()}</td>
                        <td><strong>${parseFloat(part.partTotal || '0').toLocaleString()}</strong></td>
                        <td>
                          <span className={`status-badge ${part.installed ? 'status-success' : 'status-warning'}`}>
                            {part.installed ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td>
                          {part.standardizedPart ? (
                            <div>
                              <div><strong>ID: {part.standardizedPart.partTerminologyId}</strong></div>
                              <div style={{fontSize: '0.9em', fontWeight: '500'}}>
                                {part.standardizedPart.partTerminologyName}
                              </div>
                              {part.standardizedPart.descriptions && part.standardizedPart.descriptions.length > 0 && (
                                <div style={{fontSize: '0.8em', color: '#666', marginTop: '4px'}}>
                                  {part.standardizedPart.descriptions.slice(0, 2).map((desc: string | number | boolean | ReactElement<any, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | null | undefined, idx: Key | null | undefined) => (
                                    <div key={idx}>{desc}</div>
                                  ))}
                                  {part.standardizedPart.descriptions.length > 2 && (
                                    <div style={{fontStyle: 'italic'}}>+{part.standardizedPart.descriptions.length - 2} more...</div>
                                  )}
                                </div>
                              )}
                              {/* Show related parts if available */}
                              {part.standardizedPart.relatedParts && part.standardizedPart.relatedParts.length > 0 && (
                                <div style={{fontSize: '0.7em', color: '#007bff', marginTop: '2px'}}>
                                  🔗 {part.standardizedPart.relatedParts.length} related part{part.standardizedPart.relatedParts.length > 1 ? 's' : ''}
                                </div>
                              )}
                              {/* Show supersessions if available */}
                              {part.standardizedPart.supersessions && part.standardizedPart.supersessions.length > 0 && (
                                <div style={{fontSize: '0.7em', color: '#28a745', marginTop: '2px'}}>
                                  ↔️ {part.standardizedPart.supersessions.length} replacement{part.standardizedPart.supersessions.length > 1 ? 's' : ''}
                                </div>
                              )}
                              {/* Show aliases if available */}
                              {part.standardizedPart.aliases && part.standardizedPart.aliases.length > 0 && (
                                <div style={{fontSize: '0.7em', color: '#6c757d', marginTop: '2px'}}>
                                  📝 {part.standardizedPart.aliases.length} alias{part.standardizedPart.aliases.length > 1 ? 'es' : ''}: {part.standardizedPart.aliases.slice(0, 2).join(', ')}
                                  {part.standardizedPart.aliases.length > 2 && '...'}
                                </div>
                              )}
                              {/* Show category if available */}
                              {part.standardizedPart.category && (
                                <div style={{fontSize: '0.7em', color: '#6f42c1', marginTop: '2px'}}>
                                  🏷️ {part.standardizedPart.category.primaryCategory}
                                  {part.standardizedPart.category.subCategory && ` > ${part.standardizedPart.category.subCategory}`}
                                  {part.standardizedPart.category.confidence && ` (${(part.standardizedPart.category.confidence * 100).toFixed(0)}%)`}
                                </div>
                              )}
                              {/* Show technical specifications if available */}
                              {part.standardizedPart.technicalSpecifications && part.standardizedPart.technicalSpecifications.length > 0 && (
                                <div style={{fontSize: '0.7em', color: '#17a2b8', marginTop: '2px'}}>
                                  🔧 {part.standardizedPart.technicalSpecifications.length} spec{part.standardizedPart.technicalSpecifications.length > 1 ? 's' : ''}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{color: '#999'}}>No match</span>
                          )}
                        </td>
                        <td>
                          {part.standardizedPart ? (
                            <span className={`status-badge ${
                              part.standardizedPart.matchingMethod === 'exact' ? 'status-success' :
                              part.standardizedPart.matchingMethod === 'fuzzy' ? 'status-warning' : 'status-info'
                            }`}>
                              {part.standardizedPart.matchingMethod}
                            </span>
                          ) : (
                            <span style={{color: '#999'}}>-</span>
                          )}
                        </td>
                        <td>
                          {part.standardizedPart ? (
                            <span style={{
                              color: part.standardizedPart.confidence >= 0.8 ? '#28a745' :
                                     part.standardizedPart.confidence >= 0.6 ? '#ffc107' : '#dc3545'
                            }}>
                              {(part.standardizedPart.confidence * 100).toFixed(1)}%
                            </span>
                          ) : (
                            <span style={{color: '#999'}}>-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.correctionChecklists && data.correctionChecklists.length > 0 && (
            <div className="detail-group">
              <h4>Inspection Checklist ({data.correctionChecklists.length})</h4>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Description</th>
                      <th>Status</th>
                      <th>Value</th>
                      <th>Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.correctionChecklists.map((item: any, index: number) => (
                      <tr key={item.repairOrderActionItemCorrectionChecklistId || index}>
                        <td><strong>{item.title}</strong></td>
                        <td>
                          <div style={{maxWidth: '300px', fontSize: '14px'}}>
                            {item.description || 'No description'}
                          </div>
                        </td>
                        <td>
                          <span className={`status-badge ${item.status === 'completed' ? 'status-success' : 'status-warning'}`}>
                            {item.status || 'Pending'}
                          </span>
                        </td>
                        <td>{item.value || 'N/A'}</td>
                        <td>{item.position || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      );
    }
    
    return null;
  };

  return (
    <div className="json-section">
      <div className="json-header">
        <h3 className="json-title">{title}</h3>
      </div>
      
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="details">📋 Details</TabsTrigger>
          <TabsTrigger value="json">📄 JSON View</TabsTrigger>
        </TabsList>
        
        <TabsContent value="details" className="mt-4">
          {renderPrettyView()}
        </TabsContent>
        
        <TabsContent value="json" className="mt-4">
          <div className="json-viewer">
            {JSON.stringify(data, null, 2)}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}



// Entity Selection Page
function EntitySelectionPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { state, dispatch } = useAppState();
  const [allEntityIds, setAllEntityIds] = useState<string[]>([]);
  const [fetchingData, setFetchingData] = useState<{[key: string]: boolean}>({});
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const entitiesPerPage = 100;
  
  // Get state from global context
  const { data: entities, loading, currentPage, totalItems: totalEntities } = state.entities;
  const { data: searchEntities, loading: searchLoading, currentPage: searchCurrentPage, totalItems: searchTotalItems, searchQuery, selectedStatus: searchSelectedStatus, isSearchActive } = state.entitiesSearch;
  const [initialLoading, setInitialLoading] = useState(!isCacheValid(state.entities.lastUpdated));
  
  // Use search results when search is active, otherwise use regular entities
  const displayEntities = isSearchActive ? searchEntities : entities;
  const displayLoading = isSearchActive ? searchLoading : loading;
  const displayCurrentPage = isSearchActive ? searchCurrentPage : currentPage;
  const displayTotalItems = isSearchActive ? searchTotalItems : totalEntities;

  useEffect(() => {
    // Check if we have valid cached data
    if (isCacheValid(state.entities.lastUpdated) && entities.length > 0) {
      console.log('📋 Using cached entities data');
      setInitialLoading(false);
      return;
    }
    
    // Load fresh data if no valid cache
    loadAllEntityIds();
  }, []);

  useEffect(() => {
    if (allEntityIds.length > 0 && !isCacheValid(state.entities.lastUpdated)) {
      loadEntitiesForPage(currentPage);
    }
  }, [currentPage, allEntityIds]);



  const loadAllEntityIds = async () => {
    try {
      console.log(`🔍 Loading entity count quickly...`);
      
      // First, get a quick count without sorting to show UI immediately
      const structureResponse = await fetch(`/api/shop-structure`);
      
      if (structureResponse.ok) {
        const data = await structureResponse.json();
        console.log(`📊 Found ${data.totalEntities} total entities`);
        
        // Use the pre-sorted entity IDs from the fast API
        const entityIds = data.directories;
        
        // Set basic data immediately to show UI
        console.log(`📋 Found ${entityIds.length} entity directories, UI ready!`);
        setAllEntityIds(entityIds);
        // Update total entities in global state
        dispatch({ 
          type: 'SET_ENTITIES', 
          payload: { 
            data: entities, 
            currentPage: currentPage, 
            totalItems: data.totalEntities 
          } 
        });
        setInitialLoading(false);
        
        // Then load sorted data in background for better ordering
        try {
          console.log(`🔄 Loading sorted entity list in background...`);
          const sortedResponse = await fetch(`/api/entities-sorted`);
          if (sortedResponse.ok) {
            const sortedData = await sortedResponse.json();
            console.log(`📊 Updated with sorted data: ${sortedData.stats.withData} with data, ${sortedData.stats.withoutData} without data`);
            setAllEntityIds(sortedData.entityIds);
            // Trigger a refresh of current page with sorted data
            if (currentPage === 1) {
              loadEntitiesForPage(1);
            }
          }
        } catch (sortError) {
          console.warn('⚠️ Sorted loading failed, keeping simple order:', sortError);
        }
      } else {
        console.error('❌ Structure API failed');
        setAllEntityIds([]);
        dispatch({ 
          type: 'SET_ENTITIES', 
          payload: { 
            data: [], 
            currentPage: 1, 
            totalItems: 0 
          } 
        });
        setInitialLoading(false);
      }
    } catch (error) {
      console.error('💥 Failed to load entity IDs:', error);
      setAllEntityIds([]);
      dispatch({ 
        type: 'SET_ENTITIES', 
        payload: { 
          data: [], 
          currentPage: 1, 
          totalItems: 0 
        } 
      });
      setInitialLoading(false);
    }
  };

  const loadEntitiesForPage = async (page: number) => {
    dispatch({ type: 'SET_ENTITIES_LOADING', payload: true });
    try {
      console.log(`📄 Loading page ${page} using /api/entities`);
      
      // Use the API endpoint instead of direct file access
      const response = await fetch(`/api/entities?page=${page}&limit=${entitiesPerPage}`);
      if (response.ok) {
        const data = await response.json();
        dispatch({ 
          type: 'SET_ENTITIES', 
          payload: { 
            data: data.entities, 
            currentPage: page, 
            totalItems: totalEntities || data.pagination?.total || data.entities.length 
          } 
        });
        console.log(`✅ Successfully loaded ${data.entities.length} entities for page ${page}`);
      } else {
        console.error('❌ Failed to load entities from API');
        dispatch({ 
          type: 'SET_ENTITIES', 
          payload: { 
            data: [], 
            currentPage: page, 
            totalItems: totalEntities 
          } 
        });
      }
    } catch (error) {
      console.error('💥 Failed to load entities for page:', error);
      dispatch({ 
        type: 'SET_ENTITIES', 
        payload: { 
          data: [], 
          currentPage: page, 
          totalItems: totalEntities 
        } 
      });
    }
  };

  const showEntityDetails = (entity: any) => {
    navigate(`/entity/${entity.entityId}`, { state: { entity } });
  };



  const goToCustomers = (entity: any) => {
    navigate(`/entity/${entity.entityId}/customers`);
  };

  // Search functionality
  const handleSearch = async (query: string, status?: string) => {
    dispatch({ type: 'SET_ENTITIES_SEARCH_LOADING', payload: true });
    
    try {
      const hasQuery = query.trim().length > 0;
      const hasStatus = status && status.length > 0;
      
      // If neither query nor status, don't search
      if (!hasQuery && !hasStatus) {
        dispatch({ type: 'CLEAR_ENTITIES_SEARCH' });
        return;
      }
      
      console.log(`🔍 Searching entities for: "${query}"${status ? ` with status: "${status}"` : ''}`);
      
      const searchParams = new URLSearchParams({
        page: '1',
        limit: entitiesPerPage.toString()
      });
      
      if (hasQuery) {
        searchParams.append('query', query);
      }
      
      if (status) {
        searchParams.append('status', status);
      }
      
      const response = await fetch(`/api/entities/search?${searchParams.toString()}`);
      if (response.ok) {
        const data = await response.json();
        
        console.log(`✅ Found ${data.entities.length} search results`);
        console.log('🔍 First entity data structure:', data.entities[0]);
        
        dispatch({
          type: 'SET_ENTITIES_SEARCH',
          payload: {
            data: data.entities,
            currentPage: 1,
            totalItems: data.pagination.total,
            searchQuery: query,
            selectedStatus: status || ''
          }
        });
      } else {
        console.error('❌ Search failed:', response.statusText);
        toast({
          title: "Search Failed",
          description: "Failed to search entities. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('💥 Search error:', error);
      toast({
        title: "Search Error",
        description: "An error occurred while searching. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleClearSearch = () => {
    dispatch({ type: 'CLEAR_ENTITIES_SEARCH' });
    setSelectedStatus('');
  };

  const handleStatusChange = (status: string) => {
    setSelectedStatus(status);
    // Always trigger search when status changes, either with current query or empty query
    handleSearch(searchQuery || '', status);
  };

  const handleSearchPageChange = async (page: number) => {
    // Check if we have either a search query or selected status
    if (!searchQuery && !searchSelectedStatus) return;
    
    dispatch({ type: 'SET_ENTITIES_SEARCH_LOADING', payload: true });
    
    try {
      const searchParams = new URLSearchParams({
        page: page.toString(),
        limit: entitiesPerPage.toString()
      });

      if (searchQuery) {
        searchParams.append('query', searchQuery);
      }

      if (searchSelectedStatus) {
        searchParams.append('status', searchSelectedStatus);
      }

      const response = await fetch(`/api/entities/search?${searchParams.toString()}`);
      if (response.ok) {
        const data = await response.json();
        
        dispatch({
          type: 'SET_ENTITIES_SEARCH',
          payload: {
            data: data.entities,
            currentPage: page,
            totalItems: data.pagination.total,
            searchQuery: searchQuery,
            selectedStatus: searchSelectedStatus
          }
        });
      }
    } catch (error) {
      console.error('💥 Search page change error:', error);
    }
  };

  const fetchEntityData = async (entityId: string) => {
    setFetchingData(prev => ({ ...prev, [entityId]: true }));
    
    // Create AbortController for 20-minute timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 20 * 60 * 1000); // 20-minute timeout
    
    try {
      console.log(`🔄 Triggering data fetch for entity ${entityId}`);
      
      const response = await fetch('/api/fetch-entity-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ entityId }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Data fetch started for entity ${entityId}:`, result);
        
        // Show success message
        toast({
          title: "Data Fetch Successful",
          description: `Data fetch for Entity ${entityId} completed, please refresh the page to view results`,
          variant: "success",
          duration: 3000,
        });
      } else {
        const error = await response.json();
        console.error(`❌ Failed to start data fetch for entity ${entityId}:`, error);
        toast({
          title: "Data Fetch Failed",
          description: error.error || 'Unknown error',
          variant: "destructive",
        });
      }
    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`💥 Error triggering data fetch for entity ${entityId}:`, error);
      
      if (error instanceof Error && error.name === 'AbortError') {
        toast({
          title: "Data Fetch Timeout",
          description: "Operation timed out (20 minutes), please try again later",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error Occurred During Data Fetch",
          description: (error as Error).message,
          variant: "destructive",
        });
      }
    } finally {
      setFetchingData(prev => ({ ...prev, [entityId]: false }));
    }
  };

  const totalPages = Math.ceil(displayTotalItems / entitiesPerPage);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      // Use search pagination if we have active search (query or status filter)
      if (isSearchActive || searchQuery || searchSelectedStatus) {
        // Handle search pagination
        handleSearchPageChange(page);
      } else {
        // Handle regular pagination
        if (isCacheValid(state.entities.lastUpdated) && currentPage === page) {
          // Data is already loaded and valid
          return;
        }
        
        // Load new page data
        loadEntitiesForPage(page);
      }
    }
  };

  // Only show full-screen loading during initial load
  if (initialLoading) {
    return (
      <div className="dashboard-container">
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <div className="loading-spinner">Loading entities...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="dashboard-title">Repair Shop Entities</h1>
            <p className="dashboard-subtitle">Select Repair Shop</p>
          </div>
          <button
            onClick={() => navigate('/analytics')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center space-x-2 shadow-sm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
                  <span>AutoCare Data Analytics</span>
          </button>
        </div>

      </div>
      <div className="dashboard-content">
        <div className="main-content">
          {/* Search Component */}
          <EntitySearch
            onSearch={handleSearch}
            onClear={handleClearSearch}
            loading={displayLoading}
            initialQuery={searchQuery}
            onStatusChange={handleStatusChange}
            selectedStatus={selectedStatus}
          />

          {/* Search Results Info */}
          {isSearchActive && (
            <SearchResultsInfo
              searchQuery={searchQuery}
              totalResults={displayTotalItems}
              currentPage={displayCurrentPage}
              totalPages={totalPages}
              onClearSearch={handleClearSearch}
            />
          )}

          <div className="section-header-container">
            <h2 className="section-header">
              {isSearchActive 
                ? `🔍 SEARCH RESULTS: Showing ${displayEntities.length} of ${displayTotalItems} matching entities (100 per page)`
                : `🚀 TABLE VIEW: Showing ${displayEntities.length} of ${displayTotalItems} Repair Shop Entities (100 per page)`
              }
            </h2>
            <div className="pagination-info">
              Page {displayCurrentPage} of {totalPages}
            </div>
          </div>
          
          <div className="table-container" style={{ position: 'relative' }}>
            {displayLoading && (
              <div style={{ 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                right: 0, 
                bottom: 0, 
                background: 'rgba(255, 255, 255, 0.8)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                zIndex: 10
              }}>
                <div className="loading-spinner">
                  {isSearchActive ? 'Searching...' : 'Loading page data...'}
                </div>
              </div>
            )}
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Entity Name</th>
                  <th>Legal Name</th>
                  <th>Status</th>
                  <th>Simple Shop</th>
                  <th>Contact</th>
                  <th>Customers</th>
                  <th>Units</th>
                  <th>Orders</th>
                  <th style={{ width: '150px' }}>Last Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayEntities.map(entity => (
                  <tr
                    key={entity.entityId}
                    className="table-row-hover"
                  >
                    <td>
                      <strong>
                        {isSearchActive && searchQuery ? (
                          <HighlightedText text={entity.entityId?.toString() || ''} searchQuery={searchQuery} />
                        ) : (
                          entity.entityId
                        )}
                      </strong>
                    </td>
                    <td>
                      {isSearchActive && searchQuery ? (
                        <HighlightedText text={entity.title || ''} searchQuery={searchQuery} />
                      ) : (
                        entity.title
                      )}
                    </td>
                    <td>
                      {isSearchActive && searchQuery ? (
                        <HighlightedText text={entity.legalName || ''} searchQuery={searchQuery} />
                      ) : (
                        entity.legalName
                      )}
                    </td>
                    <td>
                      <span className={`status-badge ${entity.status === 'Active' ? 'status-success' : 'status-error'}`}>
                        {isSearchActive && searchQuery ? (
                          <HighlightedText text={entity.status || 'Unknown'} searchQuery={searchQuery} />
                        ) : (
                          entity.status || 'Unknown'
                        )}
                      </span>
                    </td>
                    <td>
                      {entity.isSimpleShop ? (
                        <div style={{ fontSize: '12px' }}>
                          <span className="status-badge status-success">🏪 Yes</span>
                          <div>📍 {entity.locationCount} locations</div>
                          <div>👥 {entity.employeeCount} employees</div>
                        </div>
                      ) : (
                        <span className="status-badge" style={{ backgroundColor: '#f3f4f6', color: '#6b7280' }}>No</span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: '12px' }}>
                        {entity.phone && <div>📞 {entity.phone}</div>}
                        {entity.email && <div>📧 {entity.email}</div>}
                        {entity.website && <div>🌐 <a href={entity.website} target="_blank" rel="noopener noreferrer">Website</a></div>}
                      </div>
                    </td>
                    <td><span className="stat-value-green">{entity.customers}</span></td>
                    <td><span className="stat-value-blue">{entity.units}</span></td>
                    <td><span className="stat-value-purple">{entity.serviceOrders}</span></td>
                    <td>
                      <div className="timestamp-info">
                        {entity.processingStatus?.completedAt ? (
                          <div>
                            <span className="timestamp-value">
                              {new Date(entity.processingStatus.completedAt).toLocaleString()}
                            </span>
                          </div>
                        ) : entity.lastUpdated ? (
                          <div>
                            <span className="timestamp-value">
                              {new Date(entity.lastUpdated).toLocaleString()}
                            </span>
                          </div>
                        ) : (
                          <span className="timestamp-empty">-</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          onClick={() => showEntityDetails(entity)}
                          className="btn-secondary"
                          title="View entity details"
                        >
                          📋 Details
                        </button>
                        {entity.hasCustomersDir ? (
                          <button
                            onClick={() => goToCustomers(entity)}
                            className="btn-primary"
                            title="Browse customers"
                          >
                            👥 Customers →
                          </button>
                        ) : (
                          <button
                            onClick={() => fetchEntityData(entity.entityId.toString())}
                            className="btn-warning"
                            disabled={fetchingData[entity.entityId.toString()]}
                            title="Fetch Complete Data"
                          >
                            {fetchingData[entity.entityId.toString()] ? '🔄 Fetching...' : '📥 Fetch Data'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <ListPagination
            currentPage={displayCurrentPage}
            totalPages={totalPages}
            onPageChange={goToPage}
            itemsPerPage={entitiesPerPage}
            totalItems={displayTotalItems}
            itemName={isSearchActive ? "search results" : "entities"}
            loading={displayLoading}
          />
        </div>


      </div>
    </div>
  );
}

// Entity Customers Page Component (customers for specific entity)
function EntityCustomersPage() {
  const { entityId } = useParams<{ entityId: string }>();
  const navigate = useNavigate();
  const { state, dispatch } = useAppState();
  const [entityData, setEntityData] = useState<any>(null);
  const customersPerPage = 100;
  
  // Get state from global context
  const customerState = state.customers[entityId!] || { data: [], loading: false, currentPage: 1, totalItems: 0 };
  const { data: customers, loading, currentPage, totalItems: totalCustomers } = customerState;
  const totalPages = Math.ceil(totalCustomers / customersPerPage);
  const [initialLoading, setInitialLoading] = useState(!isCacheValid(customerState.lastUpdated));

  useEffect(() => {
    loadEntityData();
    
    // Check if we have valid cached data
    if (isCacheValid(customerState.lastUpdated) && customers.length > 0) {
      console.log('📋 Using cached customers data');
      setInitialLoading(false);
      return;
    }
    
    // Load fresh data if no valid cache
    loadCustomersForPage(1);
  }, [entityId]);

  useEffect(() => {
    if (!isCacheValid(customerState.lastUpdated)) {
      loadCustomersForPage(currentPage);
    }
  }, [currentPage]);



  const loadEntityData = async () => {
    try {
      const entityResponse = await fetch(`${API_BASE}/${entityId}/entity.json`);
      if (entityResponse.ok) {
        const entityDetails = await entityResponse.json();
        setEntityData(entityDetails);
      }
    } catch (error) {
      console.error('Failed to load entity data:', error);
    }
  };

  const loadCustomersForPage = async (page: number) => {
    dispatch({ type: 'SET_CUSTOMERS_LOADING', payload: { entityId: entityId!, loading: true } });
    
    try {
      console.log(`📄 Loading customers page ${page} for entity ${entityId}`);
      
      const response = await fetch(`/api/customers?entityId=${entityId}&page=${page}&limit=${customersPerPage}`);
      if (response.ok) {
        const data = await response.json();
        
        console.log(`✅ Loaded ${data.customers.length} customers (page ${page}/${data.pagination.totalPages})`);
        
        dispatch({ 
          type: 'SET_CUSTOMERS', 
          payload: { 
            entityId: entityId!, 
            data: data.customers, 
            currentPage: page, 
            totalItems: data.pagination.total 
          } 
        });
        
      } else {
        console.error('❌ Failed to load customers:', response.statusText);
        dispatch({ 
          type: 'SET_CUSTOMERS', 
          payload: { 
            entityId: entityId!, 
            data: [], 
            currentPage: page, 
            totalItems: 0 
          } 
        });
      }
    } catch (error) {
      console.error('💥 Failed to load customers:', error);
      dispatch({ 
        type: 'SET_CUSTOMERS', 
        payload: { 
          entityId: entityId!, 
          data: [], 
          currentPage: page, 
          totalItems: 0 
        } 
      });
    } finally {
      if (page === 1) {
        setInitialLoading(false);
      }
    }
  };

  const showCustomerDetails = (customer: any) => {
    navigate(`/entity/${entityId}/customer/${customer.customerId}/details`, { state: { customer } });
  };



  const goToUnits = (customer: any) => {
    navigate(`/entity/${entityId}/customer/${customer.customerId}`);
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      // Always load the new page data to ensure we get the correct page content
      loadCustomersForPage(page);
    }
  };

  // Only show full-screen loading during initial load
  if (initialLoading) {
    return (
      <div className="dashboard-container">
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <div className="loading-spinner">Loading customers...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Fleet Customers</h1>
        <p className="dashboard-subtitle">{entityData?.title} - Customer Management</p>

      </div>
      <div className="dashboard-content">
        <BreadcrumbNavigation
          pageType="customers"
          entityData={entityData}
          onBack={() => navigate('/')}
          breadcrumbItems={[
            { label: 'Entities', href: '/', icon: 'Building2' },
            { label: 'Customers', current: true, icon: 'Users' }
          ]}
        />
        
        <div className="main-content">
          <div className="section-header-container">
            <h2 className="section-header">🚀 CUSTOMERS VIEW: Showing {customers.length} of {totalCustomers} Fleet Customers (100 per page)</h2>
            <div className="pagination-info">
              Page {currentPage} of {totalPages}
            </div>
          </div>
          
          <div className="table-container" style={{ position: 'relative' }}>
            {loading && (
              <div style={{ 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                right: 0, 
                bottom: 0, 
                background: 'rgba(255, 255, 255, 0.8)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                zIndex: 10
              }}>
                <div className="loading-spinner">Loading page data...</div>
              </div>
            )}
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Customer Name</th>
                  <th>Legal Name</th>
                  <th>Status</th>
                  <th>Contact</th>
                  <th>DOT #</th>
                  <th>Units</th>
                  <th>Orders</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map(customer => (
                  <tr
                    key={customer.customerId}
                    className="table-row-hover"
                  >
                    <td><strong>{customer.customerId}</strong></td>
                    <td>{customer.title}</td>
                    <td>{customer.legalName}</td>
                    <td>
                      <span className={`status-badge ${customer.status === 'Confirmed' ? 'status-success' : 'status-error'}`}>
                        {customer.status || 'Unknown'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '12px' }}>
                        {customer.phone && <div>📞 {customer.phone}</div>}
                        {customer.email && <div>📧 {customer.email}</div>}
                      </div>
                    </td>
                    <td>{customer.dotNumber}</td>
                    <td><span className="stat-value-blue">{customer.units}</span></td>
                    <td><span className="stat-value-purple">{customer.serviceOrders}</span></td>
                    <td>
                      <div className="action-buttons">
                        <button
                          onClick={() => showCustomerDetails(customer)}
                          className="btn-secondary"
                          title="View customer details"
                        >
                          📋 Details
                        </button>
                        <button
                          onClick={() => goToUnits(customer)}
                          className="btn-primary"
                          title="Browse units"
                        >
                          🚛 Units →
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <ListPagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={goToPage}
            itemsPerPage={customersPerPage}
            totalItems={totalCustomers}
            itemName="customers"
            loading={loading}
          />
        </div>

        {/* Modal for Customer Details */}

      </div>
    </div>
  );
}

// Units Page Component  
function UnitsPage() {
  const { entityId, customerId } = useParams<{ entityId: string; customerId: string }>();
  const navigate = useNavigate();
  const { state, dispatch } = useAppState();
  const [customerData, setCustomerData] = useState<any>(null);
  const unitsPerPage = 100;
  
  // Get state from global context
  const unitsKey = `${entityId}-${customerId}`;
  const unitState = state.units[unitsKey] || { data: [], loading: false, currentPage: 1, totalItems: 0 };
  const { data: units, currentPage, totalItems: totalUnits, loading } = unitState;
  const [initialLoading, setInitialLoading] = useState(!isCacheValid(unitState.lastUpdated));

  useEffect(() => {
    loadCustomerData();
    
    // Check if we have valid cached data
    if (isCacheValid(unitState.lastUpdated) && units.length > 0) {
      console.log('📋 Using cached units data');
      setInitialLoading(false);
      return;
    }
    
    // Load fresh data if no valid cache
    loadAllUnitIds();
  }, [entityId, customerId]);

  useEffect(() => {
    if (!isCacheValid(unitState.lastUpdated)) {
      loadUnitsForPage(currentPage);
    }
  }, [currentPage]);



  const loadCustomerData = async () => {
    try {
      const customerResponse = await fetch(`${API_BASE}/${entityId}/customers/${customerId}/entity.json`);
      if (customerResponse.ok) {
        const customerDetails = await customerResponse.json();
        setCustomerData(customerDetails);
      }
    } catch (error) {
      console.error('Failed to load customer data:', error);
    }
  };

  const loadAllUnitIds = async () => {
    try {
      console.log(`🔍 Loading sorted unit list for customer ${customerId}: /api/units-sorted`);
      
      const sortedResponse = await fetch(`/api/units-sorted?entityId=${entityId}&customerId=${customerId}`);
      if (sortedResponse.ok) {
        const data = await sortedResponse.json();
        console.log(`📊 Found ${data.stats.total} units: ${data.stats.withData} with data, ${data.stats.withoutData} without data`);
        
        // Load first page of units
        loadUnitsForPage(1);
      } else {
        console.error('❌ Sorted units API failed, falling back to index.json');
        
        // Fallback to original method
        const response = await fetch(`${API_BASE}/${entityId}/customers/${customerId}/units/index.json`);
        if (response.ok) {
          const data = await response.json();
          const unitIds = (data.units || []).map((unit: any) => unit.customerUnitId).sort((a: string, b: string) => parseInt(a) - parseInt(b));
          
          console.log(`📋 Found ${unitIds.length} unit IDs (fallback)`);
          // Load first page of units
          loadUnitsForPage(1);
        } else {
          dispatch({ 
          type: 'SET_UNITS', 
          payload: { 
            entityId: entityId!, 
            customerId: customerId!, 
            data: [], 
            currentPage: 1, 
            totalItems: 0 
          } 
        });
        }
      }
    } catch (error) {
      console.error('💥 Failed to load unit IDs:', error);
      dispatch({ 
        type: 'SET_UNITS', 
        payload: { 
          entityId: entityId!, 
          customerId: customerId!, 
          data: [], 
          currentPage: 1, 
          totalItems: 0 
        } 
      });
    }
  };

  const loadUnitsForPage = async (page: number) => {
    dispatch({ type: 'SET_UNITS_LOADING', payload: { entityId: entityId!, customerId: customerId!, loading: true } });
    
    try {
      console.log(`📄 Loading units page ${page} for customer ${customerId}`);
      
      const response = await fetch(`/api/units?entityId=${entityId}&customerId=${customerId}&page=${page}&limit=${unitsPerPage}`);
      if (response.ok) {
        const data = await response.json();
        
        console.log(`✅ Loaded ${data.units.length} units (page ${page}/${data.pagination.totalPages})`);
        
        dispatch({ 
          type: 'SET_UNITS', 
          payload: { 
            entityId: entityId!, 
            customerId: customerId!, 
            data: data.units, 
            currentPage: page, 
            totalItems: data.pagination.total 
          } 
        });
        
      } else {
        console.error('❌ Failed to load units:', response.statusText);
        dispatch({ 
          type: 'SET_UNITS', 
          payload: { 
            entityId: entityId!, 
            customerId: customerId!, 
            data: [], 
            currentPage: page, 
            totalItems: 0 
          } 
        });
      }
    } catch (error) {
      console.error('💥 Failed to load units:', error);
      dispatch({ 
        type: 'SET_UNITS', 
        payload: { 
          entityId: entityId!, 
          customerId: customerId!, 
          data: [], 
          currentPage: page, 
          totalItems: 0 
        } 
      });
    } finally {
      if (page === 1) {
        setInitialLoading(false);
      }
    }
  };

  const showUnitDetails = (unit: any) => {
    // Use fullData if available, otherwise use the unit object itself
    const unitData = unit.fullData || unit;
    navigate(`/entity/${entityId}/customer/${customerId}/unit/${unit.customerUnitId}/details`, { state: { unit: unitData } });
  };



  const goToServiceOrders = (unit: any) => {
    navigate(`/entity/${entityId}/customer/${customerId}/unit/${unit.customerUnitId}`);
  };

  const totalPages = Math.ceil(totalUnits / unitsPerPage);

  const goToPage = (page: number) => {
    const totalPages = Math.ceil(totalUnits / unitsPerPage);
    if (page >= 1 && page <= totalPages) {
      // Always load the new page data to ensure we get the correct page content
      loadUnitsForPage(page);
    }
  };

  // Only show full-screen loading during initial load
  if (initialLoading) {
    return (
      <div className="dashboard-container">
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <div className="loading-spinner">Loading units...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Fleet Units</h1>
        <p className="dashboard-subtitle">{customerData?.title} - Vehicle Management</p>
      </div>
      <div className="dashboard-content">
        <BreadcrumbNavigation
          pageType="units"
          entityData={customerData}
          onBack={() => navigate(`/entity/${entityId}/customers`)}
          breadcrumbItems={[
            { label: 'Entities', href: '/', icon: 'Building2' },
            { label: 'Customers', href: `/entity/${entityId}/customers`, icon: 'Users' },
            { label: 'Units', current: true, icon: 'Truck' }
          ]}
        />
        
        <div className="main-content">
          <div className="section-header-container">
            <h2 className="section-header">🚀 UNITS VIEW: Showing {units.length} of {totalUnits} Fleet Units (100 per page)</h2>
            <div className="pagination-info">
              Page {currentPage} of {totalPages}
            </div>
          </div>
          
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Unit Name</th>
                  <th>Vehicle Info</th>
                  <th>License Plate</th>
                  <th>VIN</th>
                  <th>Fleet #</th>
                  <th>Mileage</th>
                  <th>Orders</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {units.map(unit => (
                  <tr
                    key={unit.customerUnitId}
                    className="table-row-hover"
                  >
                    <td><strong>{unit.customerUnitId}</strong></td>
                    <td>{unit.title}</td>
                    <td>
                      {unit.year} {unit.make} {unit.model}
                      {unit.standardizedVehicle && (
                        <span className="autocare-badge" title="AutoCare VCdb Standardized Vehicle">🚗</span>
                      )}
                    </td>
                    <td>{unit.licensePlate} ({unit.licensePlateState})</td>
                    <td>{unit.vin?.substring(0, 10)}...</td>
                    <td>{unit.fleetNumber}</td>
                    <td>{unit.mileage?.toLocaleString()} mi</td>
                    <td><span className="stat-value-purple">{unit.serviceOrders}</span></td>
                    <td>
                      <div className="action-buttons">
                        <button
                          onClick={() => showUnitDetails(unit)}
                          className="btn-secondary"
                          title="View unit details"
                        >
                          📋 Details
                        </button>
                        <button
                          onClick={() => goToServiceOrders(unit)}
                          className="btn-primary"
                          title="Browse service orders"
                        >
                          🔧 Orders →
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <ListPagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={goToPage}
            itemsPerPage={unitsPerPage}
            totalItems={totalUnits}
            itemName="units"
            loading={loading}
          />
        </div>


      </div>
    </div>
  );
}

// Service Orders Page Component
function ServiceOrdersPage() {
  const { entityId, customerId, unitId } = useParams<{ entityId: string; customerId: string; unitId: string }>();
  const navigate = useNavigate();
  const { state, dispatch } = useAppState();
  
  // Create a unique key for this service orders page
  const ordersKey = `${entityId}-${customerId}-${unitId}`;
  const orderState = state.serviceOrders[ordersKey] || { data: [], currentPage: 1, totalItems: 0, loading: false, lastUpdated: null };
  
  // Extract state from global context
  const { data: serviceOrders, currentPage, totalItems: totalOrders, loading } = orderState;
  const initialLoading = loading && serviceOrders.length === 0;
  
  const [unitData, setUnitData] = useState<any>(null);
  const ordersPerPage = 100;

  useEffect(() => {
    loadUnitData();
    
    // Check if we have valid cache
    if (isCacheValid(orderState.lastUpdated) && serviceOrders.length > 0) {
      // Use cached data
      console.log('📋 Using cached service orders data');
    } else {
      // Load fresh data
      loadAllOrderIds();
    }
  }, [entityId, customerId, unitId]);

  useEffect(() => {
    if (currentPage !== orderState.currentPage && serviceOrders.length > 0) {
      loadOrdersForPage(currentPage);
    }
  }, [currentPage]);



  const loadUnitData = async () => {
    try {
      const unitResponse = await fetch(`${API_BASE}/${entityId}/customers/${customerId}/units/${unitId}/entity.json`);
      if (unitResponse.ok) {
        const unitDetails = await unitResponse.json();
        setUnitData(unitDetails);
      }
    } catch (error) {
      console.error('Failed to load unit data:', error);
    }
  };

  const loadAllOrderIds = async () => {
    try {
      console.log(`🔍 Loading service order IDs for unit ${unitId}`);
      
      const response = await fetch(`${API_BASE}/${entityId}/customers/${customerId}/units/${unitId}/service-orders/index.json`);
      if (response.ok) {
        const data = await response.json();
        const orderIds = (data.serviceOrders || []).map((order: any) => order.repairOrderId).sort((a: string, b: string) => parseInt(b) - parseInt(a)); // Most recent first
        
        console.log(`📋 Found ${orderIds.length} service order IDs`);
        // Store order IDs in a temporary variable and load first page
        window.tempOrderIds = orderIds;
        window.tempTotalOrders = orderIds.length;
        loadOrdersForPage(1);
      } else {
        // Reset state on API failure
        dispatch({ 
          type: 'SET_SERVICE_ORDERS', 
          payload: { 
            entityId: entityId!, 
            customerId: customerId!, 
            unitId: unitId!, 
            data: [], 
            currentPage: 1, 
            totalItems: 0 
          } 
        });
      }
    } catch (error) {
      console.error('💥 Failed to load service order IDs:', error);
      // Reset state on error
      dispatch({ 
        type: 'SET_SERVICE_ORDERS', 
        payload: { 
          entityId: entityId!, 
          customerId: customerId!, 
          unitId: unitId!, 
          data: [], 
          currentPage: 1, 
          totalItems: 0 
        } 
      });
    }
  };

  const loadOrdersForPage = async (page: number) => {
    // Set loading state
    dispatch({ 
      type: 'SET_SERVICE_ORDERS_LOADING', 
      payload: { entityId: entityId!, customerId: customerId!, unitId: unitId!, loading: true } 
    });
    
    try {
      // Get order IDs from temporary storage or use new API
      const allOrderIds = (window as any).tempOrderIds || [];
      const totalOrdersCount = (window as any).tempTotalOrders || 0;
      
      // Use new API endpoint for service orders
      const response = await fetch(`${API_BASE}/api/service-orders?entityId=${entityId}&customerId=${customerId}&unitId=${unitId}&page=${page}&limit=${ordersPerPage}`);
      
      if (response.ok) {
        const data = await response.json();
        const orders = data.serviceOrders || [];
        
        console.log(`✅ Successfully loaded ${orders.length} service orders for page ${page}`);
        
        // Update global state
        dispatch({ 
          type: 'SET_SERVICE_ORDERS', 
          payload: { 
            entityId: entityId!, 
            customerId: customerId!, 
            unitId: unitId!, 
            data: orders, 
            currentPage: page, 
            totalItems: totalOrdersCount 
          } 
        });
      } else {
        // Fallback to old method if new API fails
        const startIndex = (page - 1) * ordersPerPage;
        const endIndex = Math.min(startIndex + ordersPerPage, allOrderIds.length);
        const pageOrderIds = allOrderIds.slice(startIndex, endIndex);
        
        console.log(`📄 Loading page ${page} service orders (${pageOrderIds.length} orders)`);
        
        const orders = [];
        
        for (const orderId of pageOrderIds) {
          try {
            const orderResponse = await fetch(`${API_BASE}/${entityId}/customers/${customerId}/units/${unitId}/service-orders/${orderId}/entity.json`);
            if (orderResponse.ok) {
              const orderData = await orderResponse.json();
              
              orders.push({
                repairOrderId: orderData.repairOrderId,
                repairOrderNumber: orderData.repairOrderNumber,
                description: orderData.description,
                workFlowStatus: orderData.workFlowStatus,
                scheduledDate: orderData.scheduledDate,
                completedDate: orderData.completedDate,
                totalAmount: orderData.totalAmount,
                laborAmount: orderData.laborAmount,
                partsAmount: orderData.partsAmount,
                actionItemCount: (orderData.actionItems || []).length,
                fullData: orderData
              });
            }
          } catch (error) {
            console.warn(`⚠️ Failed to load service order ${orderId}:`, error);
          }
        }
        
        console.log(`✅ Successfully loaded ${orders.length} service orders for page ${page}`);
        
        // Update global state
        dispatch({ 
          type: 'SET_SERVICE_ORDERS', 
          payload: { 
            entityId: entityId!, 
            customerId: customerId!, 
            unitId: unitId!, 
            data: orders, 
            currentPage: page, 
            totalItems: totalOrdersCount 
          } 
        });
      }
    } catch (error) {
      console.error('💥 Failed to load service orders for page:', error);
      // Update global state with empty data
      dispatch({ 
        type: 'SET_SERVICE_ORDERS', 
        payload: { 
          entityId: entityId!, 
          customerId: customerId!, 
          unitId: unitId!, 
          data: [], 
          currentPage: page, 
          totalItems: 0 
        } 
      });
    }
  };

  const showOrderDetails = (order: any) => {
    navigate(`/entity/${entityId}/customer/${customerId}/unit/${unitId}/service-order/${order.repairOrderId}/details`, { state: { serviceOrder: order } });
  };



  const totalPages = Math.ceil(totalOrders / ordersPerPage);

  const goToPage = (page: number) => {
    const totalPages = Math.ceil(totalOrders / ordersPerPage);
    if (page >= 1 && page <= totalPages) {
      // Always load the new page data to ensure we get the correct page content
      loadOrdersForPage(page);
    }
  };

  // Only show full-screen loading during initial load
  if (initialLoading) {
    return (
      <div className="dashboard-container">
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <div className="loading-spinner">Loading service orders...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Service Orders</h1>
        <p className="dashboard-subtitle">{unitData?.title || `Unit ${unitData?.customerUnitId}`} - Service History</p>
      </div>
      <div className="dashboard-content">
        <BreadcrumbNavigation
          pageType="service-orders"
          entityData={unitData}
          onBack={() => navigate(`/entity/${entityId}/customer/${customerId}`)}
          breadcrumbItems={[
            { label: 'Entities', href: '/', icon: 'Building2' },
            { label: 'Customers', href: `/entity/${entityId}/customers`, icon: 'Users' },
            { label: 'Units', href: `/entity/${entityId}/customer/${customerId}`, icon: 'Truck' },
            { label: 'Service Orders', current: true, icon: 'Wrench' }
          ]}
        />
        
        <div className="main-content">
          <div className="section-header-container">
            <h2 className="section-header">🚀 SERVICE ORDERS VIEW: Showing {serviceOrders.length} of {totalOrders} Service Orders (100 per page)</h2>
            <div className="pagination-info">
              Page {currentPage} of {totalPages}
            </div>
          </div>
          
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Scheduled</th>
                  <th>Completed</th>
                  <th>Total Amount</th>
                  <th>Action Items</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {serviceOrders.map(order => (
                  <tr
                    key={order.repairOrderId}
                    className="table-row-hover"
                  >
                    <td><strong>{order.repairOrderNumber}</strong></td>
                    <td>{order.description || 'No description'}</td>
                    <td>
                      <span className={`status-badge ${order.workFlowStatus === 'Completed' ? 'status-success' : 'status-warning'}`}>
                        {order.workFlowStatus || 'Unknown'}
                      </span>
                    </td>
                    <td>{order.scheduledDate ? new Date(order.scheduledDate).toLocaleDateString() : '-'}</td>
                    <td>{order.completedDate ? new Date(order.completedDate).toLocaleDateString() : '-'}</td>
                    <td>
                      <div style={{ fontSize: '12px' }}>
                        <div><strong>${(order.totalAmount || 0).toLocaleString()}</strong></div>
                        <div>L: ${(order.laborAmount || 0).toLocaleString()}</div>
                        <div>P: ${(order.partsAmount || 0).toLocaleString()}</div>
                      </div>
                    </td>
                    <td><span className="stat-value-blue">{order.actionItemCount}</span></td>
                    <td>
                      <div className="action-buttons">
                        <button
                          onClick={() => showOrderDetails(order)}
                          className="btn-secondary"
                          title="View service order details"
                        >
                          📋 Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <ListPagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={goToPage}
            itemsPerPage={ordersPerPage}
            totalItems={totalOrders}
            itemName="service orders"
            loading={loading}
          />
        </div>


      </div>
    </div>
  );
}

function App() {
  return (
    <AppStateProvider>
      <Routes>
        {/* Main Navigation Routes */}
        <Route path="/" element={<EntitySelectionPage />} />
        <Route path="/entity/:entityId" element={<ImprovedEntityDetailPage />} />
        <Route path="/entity/:entityId/legacy" element={<EntityDetailPage />} />
        <Route path="/entity/:entityId/customers" element={<EntityCustomersPage />} />
        <Route path="/entity/:entityId/customer/:customerId" element={<UnitsPage />} />
        <Route path="/entity/:entityId/customer/:customerId/unit/:unitId" element={<ServiceOrdersPage />} />
        
        {/* Detail Pages Routes */}
        <Route path="/entity/:entityId/customer/:customerId/details" element={<CustomerDetailPage />} />
        <Route path="/entity/:entityId/customer/:customerId/unit/:unitId/details" element={<UnitDetailPage />} />
        <Route path="/entity/:entityId/customer/:customerId/unit/:unitId/service-order/:orderId/details" element={<ServiceOrderDetailPage />} />
        
        {/* Analytics Dashboard Route */}
        <Route path="/analytics" element={<AnalyticsDashboard />} />

      </Routes>
      <Toaster />
    </AppStateProvider>
  );
}

export default App;
export { EntityViewer };

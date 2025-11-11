import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { DataTable } from './ui/data-table';

interface EnhancedEntityViewerProps {
  data: any;
  title: string;
  type: 'entity' | 'customer';
}

// DataTable component is now imported from ui/data-table.tsx

interface StatsCardProps {
  title: string;
  value: number;
  icon: string;
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'red';
}

function StatsCard({ title, value, icon, color = 'blue' }: StatsCardProps) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <div className={`p-4 rounded-lg border-2 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-75">{title}</p>
          <p className="text-2xl font-bold">{value.toLocaleString()}</p>
        </div>
        <div className="text-2xl">{icon}</div>
      </div>
    </div>
  );
}

export function EnhancedEntityViewer({ data, type }: EnhancedEntityViewerProps) {
  const [activeTab, setActiveTab] = useState('overview');

  if (!data) {
    return <div className="text-center py-8">No data available</div>;
  }

  // Calculate statistics for Entity
  const getEntityStats = () => {
    if (type !== 'entity') return [];
    
    return [
      { title: 'History', value: data.history?.length || 0, icon: '📚', color: 'blue' as const },
      { title: 'Information', value: data.information?.length || 0, icon: 'ℹ️', color: 'green' as const },
      { title: 'Roles', value: data.roles?.length || 0, icon: '👑', color: 'purple' as const },
      { title: 'Notes', value: data.notes?.length || 0, icon: '📝', color: 'orange' as const },
      { title: 'Fees', value: data.fees?.length || 0, icon: '💰', color: 'red' as const },
      { title: 'Addresses', value: data.addresses?.length || 0, icon: '🏠', color: 'blue' as const },
      { title: 'Components', value: data.components?.length || 0, icon: '🔧', color: 'green' as const },
      { title: 'Departments', value: data.departments?.length || 0, icon: '🏢', color: 'purple' as const },
      { title: 'Parts', value: data.parts?.length || 0, icon: '⚙️', color: 'orange' as const },
      { title: 'Employees', value: data.employees?.length || 0, icon: '👥', color: 'red' as const },
      { title: 'Locations', value: data.locations?.length || 0, icon: '📍', color: 'blue' as const },
      { title: 'Invoices', value: data.invoices?.length || 0, icon: '🧾', color: 'green' as const },
    ];
  };

  // Calculate statistics for Customer
  const getCustomerStats = () => {
    if (type !== 'customer') return [];
    
    return [
      { title: 'History', value: data.history?.length || 0, icon: '📚', color: 'blue' as const },
      { title: 'Notes', value: data.notes?.length || 0, icon: '📝', color: 'green' as const },
      { title: 'Addresses', value: data.addresses?.length || 0, icon: '🏠', color: 'purple' as const },
      { title: 'Credits', value: data.credits?.length || 0, icon: '💳', color: 'orange' as const },
      { title: 'Locations', value: data.locations?.length || 0, icon: '📍', color: 'red' as const },
      { title: 'Employees', value: data.employees?.length || 0, icon: '👥', color: 'blue' as const },
      { title: 'Payments', value: data.payments?.length || 0, icon: '💰', color: 'green' as const },
      { title: 'Units', value: data.units?.length || 0, icon: '🚚', color: 'purple' as const },
    ];
  };

  const stats = type === 'entity' ? getEntityStats() : getCustomerStats();

  // Basic information for Entity
  const renderEntityBasicInfo = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="bg-white p-6 rounded-lg border">
          <h4 className="font-semibold text-gray-900 mb-4">Basic Information</h4>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Entity ID:</span>
              <span className="font-medium">{data.entityId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Legal Name:</span>
              <span className="font-medium">{data.legalName || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Title:</span>
              <span className="font-medium">{data.title || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Status:</span>
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                data.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {data.status || 'Unknown'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Number:</span>
              <span className="font-medium">{data.number || '-'}</span>
            </div>
          </div>
        </div>

        {/* Simple Shop Data Section */}
        {data.isSimpleShop && (
          <>
            {/* Simple Shop Data Separator */}
            <div className="w-full my-8">
              <div className="relative">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t-2 border-gray-300"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-white px-4 text-sm font-medium text-gray-500 uppercase tracking-wider">
                    🏪 Simple Shop Data
                  </span>
                </div>
              </div>
            </div>
            
            {/* Simple Shop Information */}
            <div className="bg-orange-50 p-6 rounded-lg border border-orange-200">
              <h4 className="font-semibold text-orange-900 mb-4 flex items-center">
                🏪 Simple Shop
              </h4>
              <div className="space-y-3">
                {/* Hide the "Simple Shop: Yes" row since it's redundant */}
                <div className="flex justify-between">
                  <span className="text-orange-600">Locations:</span>
                  <span className="font-medium text-orange-900">{data.locationCount || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-orange-600">Employees:</span>
                  <span className="font-medium text-orange-900">{data.employeeCount || 0}</span>
                </div>
              {data.locationNames && data.locationNames.length > 0 && (
                <div className="space-y-1">
                  <span className="text-orange-600 text-sm">Location Names:</span>
                  <div className="text-sm font-medium text-orange-900">
                    {data.locationNames.join(', ')}
                  </div>
                </div>
              )}
              {data.employeeNames && data.employeeNames.length > 0 && (
                <div className="space-y-1">
                  <span className="text-orange-600 text-sm">Employee Names:</span>
                  <div className="text-sm font-medium text-orange-900">
                    {data.employeeNames.join(', ')}
                  </div>
                </div>
              )}
              </div>
            </div>
            
            {/* Accounting Information */}
            {data.accounting && (
              <div className="bg-green-50 p-6 rounded-lg border border-green-200 mt-4">
                <h4 className="font-semibold text-green-900 mb-4 flex items-center">
                  💰 Accounting Summary
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-green-600">Total Revenue:</span>
                    <span className="font-medium text-green-900">${(data.accounting.totalRevenue || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-600">Total Invoices:</span>
                    <span className="font-medium text-green-900">{data.accounting.totalInvoices || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-600">Average Invoice:</span>
                    <span className="font-medium text-green-900">${(data.accounting.averageInvoiceAmount || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-600">Pending Payments:</span>
                    <span className="font-medium text-green-900">${(data.accounting.pendingPayments || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-600">Completed Orders:</span>
                    <span className="font-medium text-green-900">{data.accounting.completedOrders || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-600">Pending Orders:</span>
                    <span className="font-medium text-green-900">{data.accounting.pendingOrders || 0}</span>
                  </div>
                  {data.accounting.lastInvoiceDate && (
                    <div className="flex justify-between">
                      <span className="text-green-600">Last Invoice:</span>
                      <span className="font-medium text-green-900">{new Date(data.accounting.lastInvoiceDate).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Units Information */}
            {data.units && (
              <div className="bg-blue-50 p-6 rounded-lg border border-blue-200 mt-4">
                <h4 className="font-semibold text-blue-900 mb-4 flex items-center">
                  🚛 Units Summary
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-blue-600">Total Units:</span>
                    <span className="font-medium text-blue-900">{data.units.totalUnits || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">Active Units:</span>
                    <span className="font-medium text-blue-900">{data.units.activeUnits || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">Serviced This Year:</span>
                    <span className="font-medium text-blue-900">{data.units.unitsServicedThisYear || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">Total Customers:</span>
                    <span className="font-medium text-blue-900">{data.units.totalCustomers || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">Active Service Orders:</span>
                    <span className="font-medium text-blue-900">{data.units.unitsWithActiveServiceOrders || 0}</span>
                  </div>
                  {data.units.mostCommonUnitType && (
                    <div className="flex justify-between">
                      <span className="text-blue-600">Most Common Unit Type:</span>
                      <span className="font-medium text-blue-900">{data.units.mostCommonUnitType}</span>
                    </div>
                  )}
                  {data.units.unitTypes && data.units.unitTypes.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-blue-600 text-sm">Unit Types:</span>
                      <div className="text-sm font-medium text-blue-900">
                        {data.units.unitTypes.join(', ')}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="space-y-4">
        <div className="bg-white p-6 rounded-lg border">
          <h4 className="font-semibold text-gray-900 mb-4">Contact Information</h4>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Phone:</span>
              <span className="font-medium">{data.phone || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Email:</span>
              <span className="font-medium">{data.email || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Website:</span>
              <span className="font-medium">{data.website || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Tax ID:</span>
              <span className="font-medium">{data.taxId || '-'}</span>
            </div>
          </div>
        </div>

        {/* Remove the old Accounting section since it's now inside Simple Shop */}
        {!data.isSimpleShop && data.accounting && (
          <div className="bg-green-50 p-6 rounded-lg border border-green-200">
            <h4 className="font-semibold text-green-900 mb-4 flex items-center">
              💰 Accounting Summary
            </h4>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-green-600">Total Revenue:</span>
                <span className="font-medium text-green-900">${(data.accounting.totalRevenue || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-600">Total Invoices:</span>
                <span className="font-medium text-green-900">{data.accounting.totalInvoices || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-600">Average Invoice:</span>
                <span className="font-medium text-green-900">${(data.accounting.averageInvoiceAmount || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-600">Pending Payments:</span>
                <span className="font-medium text-green-900">${(data.accounting.pendingPayments || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-600">Completed Orders:</span>
                <span className="font-medium text-green-900">{data.accounting.completedOrders || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-600">Pending Orders:</span>
                <span className="font-medium text-green-900">{data.accounting.pendingOrders || 0}</span>
              </div>
              {data.accounting.lastInvoiceDate && (
                <div className="flex justify-between">
                  <span className="text-green-600">Last Invoice:</span>
                  <span className="font-medium text-green-900">{new Date(data.accounting.lastInvoiceDate).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Units Information - only show for non-Simple Shop entities */}
        {!data.isSimpleShop && data.units && (
          <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
            <h4 className="font-semibold text-blue-900 mb-4 flex items-center">
              🚛 Units Summary
            </h4>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-blue-600">Total Units:</span>
                <span className="font-medium text-blue-900">{data.units.totalUnits || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-600">Active Units:</span>
                <span className="font-medium text-blue-900">{data.units.activeUnits || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-600">Serviced This Year:</span>
                <span className="font-medium text-blue-900">{data.units.unitsServicedThisYear || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-600">Total Customers:</span>
                <span className="font-medium text-blue-900">{data.units.totalCustomers || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-600">Active Service Orders:</span>
                <span className="font-medium text-blue-900">{data.units.unitsWithActiveServiceOrders || 0}</span>
              </div>
              {data.units.mostCommonUnitType && (
                <div className="flex justify-between">
                  <span className="text-blue-600">Common Unit Type:</span>
                  <span className="font-medium text-blue-900">{data.units.mostCommonUnitType}</span>
                </div>
              )}
              {data.units.unitTypes && data.units.unitTypes.length > 0 && (
                <div className="space-y-1">
                  <span className="text-blue-600 text-sm">Unit Types:</span>
                  <div className="text-sm font-medium text-blue-900">
                    {data.units.unitTypes.join(', ')}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Basic information for Customer
  const renderCustomerBasicInfo = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="bg-white p-6 rounded-lg border">
          <h4 className="font-semibold text-gray-900 mb-4">Customer Information</h4>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Customer ID:</span>
              <span className="font-medium">{data.customerId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Legal Name:</span>
              <span className="font-medium">{data.legalName || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Title:</span>
              <span className="font-medium">{data.title || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Status:</span>
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                data.status === 'Confirmed' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {data.status || 'Unknown'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Code:</span>
              <span className="font-medium">{data.code || '-'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-white p-6 rounded-lg border">
          <h4 className="font-semibold text-gray-900 mb-4">Business Details</h4>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Phone:</span>
              <span className="font-medium">{data.phone || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">DOT Number:</span>
              <span className="font-medium">{data.dotNumber || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Credit Limit:</span>
              <span className="font-medium">${(data.creditLimit || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Credit Terms:</span>
              <span className="font-medium">{data.creditTerms || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Payment Method:</span>
              <span className="font-medium">{data.paymentMethod || '-'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Render data tables for Entity
  const renderEntityDataTables = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <DataTable data={data.history || []} title="History Records" itemsPerPage={5} />
      <DataTable data={data.information || []} title="Information" itemsPerPage={5} />
      <DataTable data={data.roles || []} title="Roles" itemsPerPage={5} />
      <DataTable data={data.notes || []} title="Notes" itemsPerPage={5} />
      <DataTable data={data.fees || []} title="Fees" itemsPerPage={5} />
      <DataTable data={data.addresses || []} title="Addresses" itemsPerPage={5} />
      <DataTable data={data.components || []} title="Components" itemsPerPage={5} />
      <DataTable data={data.departments || []} title="Departments" itemsPerPage={5} />
      <DataTable data={data.parts || []} title="Parts" itemsPerPage={5} />
      <DataTable data={data.employees || []} title="Employees" itemsPerPage={5} />
      <DataTable data={data.locations || []} title="Locations" itemsPerPage={5} />
      <DataTable data={data.invoices || []} title="Invoices" itemsPerPage={5} />
    </div>
  );

  // Render data tables for Customer
  const renderCustomerDataTables = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <DataTable data={data.history || []} title="History Records" itemsPerPage={5} />
      <DataTable data={data.notes || []} title="Notes" itemsPerPage={5} />
      <DataTable data={data.addresses || []} title="Addresses" itemsPerPage={5} />
      <DataTable data={data.credits || []} title="Credits" itemsPerPage={5} />
      <DataTable data={data.locations || []} title="Locations" itemsPerPage={5} />
      <DataTable data={data.employees || []} title="Employees" itemsPerPage={5} />
      <DataTable data={data.payments || []} title="Payments" itemsPerPage={5} />
      <DataTable data={data.units || []} title="Units" itemsPerPage={5} />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Statistics Overview */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Overview</h3>
        <div className={`grid gap-4 ${
          type === 'entity' 
            ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6' 
            : 'grid-cols-2 md:grid-cols-4 lg:grid-cols-8'
        }`}>
          {stats.map((stat, index) => (
            <StatsCard
              key={index}
              title={stat.title}
              value={stat.value}
              icon={stat.icon}
              color={stat.color}
            />
          ))}
        </div>
      </div>

      {/* Tabbed Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="overview">Basic Information</TabsTrigger>
          <TabsTrigger value="data">Detailed Data</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-6">
          {type === 'entity' ? renderEntityBasicInfo() : renderCustomerBasicInfo()}
        </TabsContent>
        
        <TabsContent value="data" className="space-y-6">
          {type === 'entity' ? renderEntityDataTables() : renderCustomerDataTables()}
        </TabsContent>
      </Tabs>
    </div>
  );
}

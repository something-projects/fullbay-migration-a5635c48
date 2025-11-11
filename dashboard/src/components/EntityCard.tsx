
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Users, Truck, Wrench } from 'lucide-react';

interface EntityCardProps {
  entity: {
    entityId: string | number;
    title: string;
    legalName?: string;
    customers?: number;
    units?: number;
    serviceOrders?: number;
  };
  onClick: () => void;
}

export function EntityCard({ entity, onClick }: EntityCardProps) {
  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow duration-200 hover:border-blue-300"
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-600" />
          <CardTitle className="text-lg">{entity.title}</CardTitle>
        </div>
        {entity.legalName && entity.legalName !== entity.title && (
          <CardDescription className="text-sm text-gray-600">
            {entity.legalName}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Users className="w-4 h-4 text-green-600" />
              <span className="text-2xl font-semibold text-green-600">
                {entity.customers || 0}
              </span>
            </div>
            <p className="text-xs text-gray-500">Customers</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Truck className="w-4 h-4 text-blue-600" />
              <span className="text-2xl font-semibold text-blue-600">
                {entity.units || 0}
              </span>
            </div>
            <p className="text-xs text-gray-500">Units</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Wrench className="w-4 h-4 text-purple-600" />
              <span className="text-2xl font-semibold text-purple-600">
                {entity.serviceOrders || 0}
              </span>
            </div>
            <p className="text-xs text-gray-500">Orders</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
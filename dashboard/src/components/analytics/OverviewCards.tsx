import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, TrendingUp, Car, Wrench, Activity, Target } from 'lucide-react';
import type { OverviewData } from '@/types/analytics';

interface OverviewCardsProps {
  data: OverviewData | null;
  loading: boolean;
}

export function OverviewCards({ data, loading }: OverviewCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-3">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
            </CardHeader>
            <CardContent>
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-gray-500 dark:text-gray-400">
            <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const cards = [
    {
      title: 'Total Entities',
      value: data.totalEntities.toLocaleString(),
      description: 'All entities in system',
      icon: Database,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20'
    },
    {
      title: 'AutoCare Data Coverage',
      value: data.entitiesWithAutocare.toLocaleString(),
      description: `Data completeness: ${data.dataCompleteness}%`,
      icon: Target,
      color: 'text-green-600',
      bgColor: 'bg-green-50 dark:bg-green-900/20'
    },
    {
      title: 'Total Vehicles',
      value: data.vehicleStats.totalVehicles.toLocaleString(),
      description: `Match rate: ${data.vehicleStats.matchRate}%`,
      icon: Car,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20'
    },
    {
      title: 'Vehicle Matches',
      value: data.vehicleStats.matchedVehicles.toLocaleString(),
      description: `Avg confidence: ${data.vehicleStats.averageConfidence}%`,
      icon: TrendingUp,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50 dark:bg-indigo-900/20'
    },
    {
      title: 'Total Parts',
      value: data.partsStats.totalParts.toLocaleString(),
      description: `Match rate: ${data.partsStats.matchRate}%`,
      icon: Wrench,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20'
    },
    {
      title: 'Parts Matches',
      value: data.partsStats.matchedParts.toLocaleString(),
      description: `Avg confidence: ${data.partsStats.averageConfidence}%`,
      icon: Activity,
      color: 'text-teal-600',
      bgColor: 'bg-teal-50 dark:bg-teal-900/20'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map((card, index) => {
          const Icon = card.icon;
          return (
            <Card key={index} className="relative overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    {card.title}
                  </CardTitle>
                  <div className={`p-2 rounded-lg ${card.bgColor}`}>
                    <Icon className={`h-5 w-5 ${card.color}`} />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {card.value}
                  </div>
                  <CardDescription className="text-sm">
                    {card.description}
                  </CardDescription>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Car className="h-5 w-5 text-purple-600" />
              <span>Vehicle Matching Overview</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Total Vehicles</span>
                <span className="font-semibold">{data.vehicleStats.totalVehicles.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Successful Matches</span>
                <span className="font-semibold text-green-600">
                  {data.vehicleStats.matchedVehicles.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Match Rate</span>
                <span className="font-semibold">{data.vehicleStats.matchRate}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Avg Confidence</span>
                <span className="font-semibold">{data.vehicleStats.averageConfidence}%</span>
              </div>
              
              {/* Progress Bar */}
              <div className="mt-4">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                  <span>Match Progress</span>
                  <span>{data.vehicleStats.matchRate}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${data.vehicleStats.matchRate}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Wrench className="h-5 w-5 text-orange-600" />
              <span>Parts Matching Overview</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Total Parts</span>
                <span className="font-semibold">{data.partsStats.totalParts.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Successful Matches</span>
                <span className="font-semibold text-green-600">
                  {data.partsStats.matchedParts.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Match Rate</span>
                <span className="font-semibold">{data.partsStats.matchRate}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Avg Confidence</span>
                <span className="font-semibold">{data.partsStats.averageConfidence}%</span>
              </div>
              
              {/* Progress Bar */}
              <div className="mt-4">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                  <span>Match Progress</span>
                  <span>{data.partsStats.matchRate}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-orange-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${data.partsStats.matchRate}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Processing Time */}
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            Data processing time: {data.processingTime}ms
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

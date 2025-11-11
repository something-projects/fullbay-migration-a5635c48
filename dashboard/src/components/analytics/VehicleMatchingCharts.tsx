import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ScatterChart,
  Scatter,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, AlertTriangle, Target, Activity } from 'lucide-react';
import type { VehicleMatchingData, FilterOptions } from '@/types/analytics';

interface VehicleMatchingChartsProps {
  data: VehicleMatchingData | null;
  loading: boolean;
  filters: FilterOptions;
}

const COLORS = {
  exactMatches: '#10B981', // green
  fuzzyMatches: '#F59E0B', // amber
  noMatches: '#EF4444', // red
  primary: '#3B82F6', // blue
  secondary: '#8B5CF6', // purple
  accent: '#06B6D4' // cyan
};

export function VehicleMatchingCharts({ data, loading, filters }: VehicleMatchingChartsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
            </CardHeader>
            <CardContent>
              <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
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
            <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No vehicle matching data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Data is already filtered at API level, no need for client-side filtering
  const displayTotalVehicles = data.totalVehicles;
  const displayExactMatches = data.exactMatches;
  const displayFuzzyMatches = data.fuzzyMatches;
  const displayNoMatches = data.noMatches;

  const confidenceData = data.confidenceDistribution
    .filter(item => item.confidence > 0)
    .map(item => ({
      confidence: item.confidence,
      vehicles: item.vehicles,
      entityId: item.entityId
    }));

  const matchRateData = data.matchRateDistribution
    .sort((a, b) => a.matchRate - b.matchRate)
    .map((item, index) => ({
      index: index + 1,
      matchRate: item.matchRate,
      totalVehicles: item.totalVehicles,
      entityId: item.entityId
    }));

  // Prepare data for charts
  const matchingStatusData = [
    { name: 'Exact Matches', value: displayExactMatches, color: COLORS.exactMatches },
    { name: 'Fuzzy Matches', value: displayFuzzyMatches, color: COLORS.fuzzyMatches },
    { name: 'No Matches', value: displayNoMatches, color: COLORS.noMatches }
  ];

  const failureReasonsData = (data.failureReasons || [])
    .slice(0, 10)
    .map(item => ({
      reason: item.reason.replace(/_/g, ' '),
      count: Number(item.count) || 0
    }))
    .sort((a, b) => b.count - a.count); // Sort by count in descending order

  // Debug log
  console.log('VehicleMatching failureReasonsData:', failureReasonsData);
  console.log('Applied filters:', filters);
  
  // Force re-render key for charts
  const chartKey = `chart-${displayTotalVehicles}-${failureReasonsData.length}-${filters.entityIds?.join(',') || 'all'}`;


  const ScatterTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white/95 dark:bg-gray-800/95 p-2 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg backdrop-blur-sm text-xs">
          <p className="font-medium">Entity ID: {data.entityId}</p>
          <p>Confidence: {data.confidence}%</p>
          <p>Vehicles: {data.vehicles?.toLocaleString()}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Target className="h-5 w-5 text-green-600" />
              <div>
                <div className="text-2xl font-bold">{displayTotalVehicles.toLocaleString()}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Total Vehicles {filters.entityIds && filters.entityIds.length > 0 ? `(Entity: ${filters.entityIds.join(', ')})` : ''}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              <div>
                <div className="text-2xl font-bold text-green-600">{displayExactMatches.toLocaleString()}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Exact Matches</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Activity className="h-5 w-5 text-amber-600" />
              <div>
                <div className="text-2xl font-bold text-amber-600">{displayFuzzyMatches.toLocaleString()}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Fuzzy Matches</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div>
                <div className="text-2xl font-bold text-red-600">{displayNoMatches.toLocaleString()}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">No Matches</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Matching Status Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Match Status Distribution</CardTitle>
            <CardDescription>Vehicle matching success rate analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={matchingStatusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(1)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {matchingStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: any) => [value.toLocaleString(), 'Count']}
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '12px',
                    padding: '8px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Failure Reasons Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Failure Reasons</CardTitle>
            <CardDescription>Most common matching failure reasons analysis</CardDescription>
          </CardHeader>
          <CardContent>
            {failureReasonsData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[300px] text-gray-500 dark:text-gray-400">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No failure reasons data available</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={400} key={`vehicle-failure-${chartKey}`}>
                <BarChart
                  data={failureReasonsData}
                  layout="vertical"
                  margin={{ top: 20, right: 30, left: 200, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis 
                    type="number"
                    tickFormatter={(value) => value.toLocaleString()}
                  />
                  <YAxis 
                    dataKey="reason" 
                    type="category"
                    tick={{ fontSize: 12 }}
                    width={180}
                  />
                  <Tooltip 
                    formatter={(value: any) => [Number(value).toLocaleString(), 'Count']}
                    labelFormatter={(label) => label}
                  />
                  <Bar 
                    dataKey="count" 
                    name="Count"
                    fill={COLORS.primary}
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Vehicle Failure Analytics */}
        {data.failureAnalytics && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Advanced Failure Analytics</CardTitle>
              <CardDescription>
                Top failure patterns analysis - {data.failureAnalytics.uniqueFailureCount.toLocaleString()} unique failures
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.failureAnalytics.topFailurePatterns.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[300px] text-gray-500 dark:text-gray-400">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No failure patterns data available</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={400} key={`vehicle-analytics-${chartKey}`}>
                  <BarChart
                    data={data.failureAnalytics.topFailurePatterns.slice(0, 15)}
                    layout="vertical"
                    margin={{ top: 20, right: 60, left: 250, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis 
                      type="number"
                      tickFormatter={(value) => value.toLocaleString()}
                    />
                    <YAxis 
                      dataKey="pattern" 
                      type="category"
                      tick={{ fontSize: 11 }}
                      width={240}
                    />
                    <Tooltip 
                      formatter={(value: any, name: string) => [
                        Number(value).toLocaleString(), 
                        name === 'count' ? 'Failures' : name
                      ]}
                      labelFormatter={(label) => `Pattern: ${label}`}
                      contentStyle={{
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '12px'
                      }}
                    />
                    <Bar 
                      dataKey="count" 
                      name="Failures"
                      fill={COLORS.accent}
                      radius={[0, 4, 4, 0]}
                    />
                    <Bar 
                      dataKey="percentage" 
                      name="Percentage"
                      fill={COLORS.secondary}
                      radius={[0, 4, 4, 0]}
                      yAxisId="right"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}

        {/* Confidence Distribution Scatter Plot */}
        <Card>
          <CardHeader>
            <CardTitle>Confidence Distribution</CardTitle>
            <CardDescription>Match confidence vs vehicle count per entity</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart
                margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  type="number" 
                  dataKey="confidence" 
                  name="Confidence"
                  unit="%" 
                  domain={[0, 100]}
                />
                <YAxis 
                  type="number" 
                  dataKey="vehicles" 
                  name="Vehicles"
                  scale="log"
                  domain={['dataMin', 'dataMax']}
                />
                <Tooltip content={<ScatterTooltip />} />
                <Scatter data={confidenceData} fill={COLORS.secondary} />
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Match Rate Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Match Rate Distribution</CardTitle>
            <CardDescription>Match rate distribution across entities</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={matchRateData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="index" />
                <YAxis domain={[0, 100]} />
                <Tooltip 
                  formatter={(value: any, name: string) => [
                    name === 'matchRate' ? `${value}%` : value.toLocaleString(),
                    name === 'matchRate' ? 'Match Rate' : 'Vehicles'
                  ]}
                  labelFormatter={(label, payload) => {
                    if (payload && payload.length > 0) {
                      return `Entity ID: ${payload[0].payload.entityId}`;
                    }
                    return `Entity Rank: ${label}`;
                  }}
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '12px',
                    padding: '8px'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="matchRate" 
                  stroke={COLORS.accent} 
                  fill={COLORS.accent} 
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Statistics Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Statistics</CardTitle>
          <CardDescription>Detailed vehicle matching data analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left p-2">Metric</th>
                  <th className="text-right p-2">Value</th>
                  <th className="text-right p-2">Percentage</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className="p-2">Total Vehicles {filters.entityIds && filters.entityIds.length > 0 ? `(Entity: ${filters.entityIds.join(', ')})` : ''}</td>
                  <td className="text-right p-2">{displayTotalVehicles.toLocaleString()}</td>
                  <td className="text-right p-2">100.0%</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className="p-2">Exact Matches</td>
                  <td className="text-right p-2 text-green-600">{displayExactMatches.toLocaleString()}</td>
                  <td className="text-right p-2 text-green-600">
                    {displayTotalVehicles > 0 ? ((displayExactMatches / displayTotalVehicles) * 100).toFixed(1) : '0.0'}%
                  </td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className="p-2">Fuzzy Matches</td>
                  <td className="text-right p-2 text-amber-600">{displayFuzzyMatches.toLocaleString()}</td>
                  <td className="text-right p-2 text-amber-600">
                    {displayTotalVehicles > 0 ? ((displayFuzzyMatches / displayTotalVehicles) * 100).toFixed(1) : '0.0'}%
                  </td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className="p-2">No Matches</td>
                  <td className="text-right p-2 text-red-600">{displayNoMatches.toLocaleString()}</td>
                  <td className="text-right p-2 text-red-600">
                    {displayTotalVehicles > 0 ? ((displayNoMatches / displayTotalVehicles) * 100).toFixed(1) : '0.0'}%
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-medium">Overall Match Rate</td>
                  <td className="text-right p-2 font-medium">
                    {(displayExactMatches + displayFuzzyMatches).toLocaleString()}
                  </td>
                  <td className="text-right p-2 font-medium text-blue-600">
                    {displayTotalVehicles > 0 ? (((displayExactMatches + displayFuzzyMatches) / displayTotalVehicles) * 100).toFixed(1) : '0.0'}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

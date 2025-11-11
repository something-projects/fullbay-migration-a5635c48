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
import { Wrench, AlertTriangle, Target, Activity, TrendingUp } from 'lucide-react';
import type { PartsMatchingData, FilterOptions } from '@/types/analytics';

interface PartsMatchingChartsProps {
  data: PartsMatchingData | null;
  loading: boolean;
  filters: FilterOptions;
}

const COLORS = {
  exactMatches: '#10B981', // green
  fuzzyMatches: '#F59E0B', // amber
  descriptionMatches: '#8B5CF6', // purple
  keywordMatches: '#06B6D4', // cyan
  noMatches: '#EF4444', // red
  primary: '#3B82F6', // blue
  secondary: '#F97316' // orange
};

export function PartsMatchingCharts({ data, loading, filters }: PartsMatchingChartsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
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
            <Wrench className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No parts matching data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Data is already filtered at API level, no need for client-side filtering
  const displayTotalParts = data.totalParts;
  const displayExactMatches = data.exactMatches;
  const displayFuzzyMatches = data.fuzzyMatches;
  const displayDescriptionMatches = data.descriptionMatches;
  const displayKeywordMatches = data.keywordMatches;
  const displayNoMatches = data.noMatches;

  const confidenceData = data.confidenceDistribution
    .filter(item => item.confidence > 0)
    .map(item => ({
      confidence: item.confidence,
      parts: item.parts,
      entityId: item.entityId
    }));

  const matchRateData = data.matchRateDistribution
    .sort((a, b) => a.matchRate - b.matchRate)
    .map((item, index) => ({
      index: index + 1,
      matchRate: item.matchRate,
      totalParts: item.totalParts,
      entityId: item.entityId
    }));

  // Prepare data for charts
  const matchingStatusData = [
    { name: 'Exact Matches', value: displayExactMatches, color: COLORS.exactMatches },
    { name: 'Fuzzy Matches', value: displayFuzzyMatches, color: COLORS.fuzzyMatches },
    { name: 'Description Matches', value: displayDescriptionMatches, color: COLORS.descriptionMatches },
    { name: 'Keyword Matches', value: displayKeywordMatches, color: COLORS.keywordMatches },
    { name: 'No Matches', value: displayNoMatches, color: COLORS.noMatches }
  ].filter(item => item.value > 0);

  const failureReasonsData = (data.failureReasons || [])
    .slice(0, 8)
    .map(item => ({
      reason: item.reason.replace(/_/g, ' '),
      count: Number(item.count) || 0
    }))
    .sort((a, b) => b.count - a.count); // Sort by count in descending order

  const commonFailuresData = (data.commonFailures || [])
    .slice(0, 15)
    .map(item => ({
      partName: item.partName.length > 25 ? item.partName.substring(0, 25) + '...' : item.partName,
      fullName: item.partName,
      count: Number(item.count) || 0
    }))
    .sort((a, b) => b.count - a.count); // Sort by count in descending order

  // Debug logs
  console.log('PartsMatching failureReasonsData:', failureReasonsData);
  console.log('PartsMatching commonFailuresData:', commonFailuresData);
  console.log('Applied filters:', filters);
  
  // Force re-render key for charts
  const chartKey = `chart-${displayTotalParts}-${failureReasonsData.length}-${filters.entityIds?.join(',') || 'all'}`;


  const PartTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white/95 dark:bg-gray-800/95 p-2 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg backdrop-blur-sm text-xs max-w-xs">
          <p className="font-medium">{data.fullName}</p>
          <p>Failure count: {data.count.toLocaleString()}</p>
        </div>
      );
    }
    return null;
  };

  const ScatterTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white/95 dark:bg-gray-800/95 p-2 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg backdrop-blur-sm text-xs">
          <p className="font-medium">Entity ID: {data.entityId}</p>
          <p>Confidence: {data.confidence}%</p>
          <p>Parts: {data.parts.toLocaleString()}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Target className="h-5 w-5 text-blue-600" />
              <div>
                <div className="text-2xl font-bold">{displayTotalParts.toLocaleString()}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Total Parts {filters.entityIds && filters.entityIds.length > 0 ? `(Entity: ${filters.entityIds.join(', ')})` : ''}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
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
              <Wrench className="h-5 w-5 text-purple-600" />
              <div>
                <div className="text-2xl font-bold text-purple-600">{(displayDescriptionMatches + displayKeywordMatches).toLocaleString()}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Other Matches</div>
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
            <CardTitle>Parts Match Status Distribution</CardTitle>
            <CardDescription>Distribution of different matching types</CardDescription>
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
            <CardTitle>Match Failure Reasons</CardTitle>
            <CardDescription>Main reasons for parts matching failures</CardDescription>
          </CardHeader>
          <CardContent>
            {failureReasonsData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[300px] text-gray-500 dark:text-gray-400">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No failure reasons data available</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={400} key={`failure-${chartKey}`}>
                <BarChart
                  data={failureReasonsData}
                  layout="vertical"
                  margin={{ top: 20, right: 30, left: 180, bottom: 5 }}
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
                    width={170}
                  />
                  <Tooltip 
                    formatter={(value: any) => [Number(value).toLocaleString(), 'Count']}
                    labelFormatter={(label) => label}
                  />
                  <Bar 
                    dataKey="count" 
                    name="Count"
                    fill={COLORS.secondary}
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Common Failures Bar Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top 15 Failed Parts</CardTitle>
            <CardDescription>Most commonly failed part names</CardDescription>
          </CardHeader>
          <CardContent>
            {commonFailuresData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[400px] text-gray-500 dark:text-gray-400">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No common failures data available</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={500} key={`common-${chartKey}`}>
                <BarChart
                  data={commonFailuresData}
                  layout="vertical"
                  margin={{ top: 20, right: 30, left: 280, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis 
                    type="number"
                    tickFormatter={(value) => value.toLocaleString()}
                  />
                  <YAxis 
                    dataKey="partName" 
                    type="category"
                    tick={{ fontSize: 11 }}
                    width={270}
                  />
                  <Tooltip 
                    formatter={(value: any) => [Number(value).toLocaleString(), 'Failure Count']}
                    labelFormatter={(label) => label}
                  />
                  <Bar 
                    dataKey="count" 
                    name="Failure Count"
                    fill={COLORS.primary}
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Parts Failure Analytics */}
        {data.failureAnalytics && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Parts Failure Category Analytics</CardTitle>
              <CardDescription>
                Category-based failure analysis - {data.failureAnalytics.uniqueFailedParts.toLocaleString()} unique failed parts
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.failureAnalytics.failuresByCategory.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[300px] text-gray-500 dark:text-gray-400">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No category failure data available</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ResponsiveContainer width="100%" height={350} key={`parts-analytics-pie-${chartKey}`}>
                    <PieChart>
                      <Pie
                        data={data.failureAnalytics.failuresByCategory}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ category, percentage }) => `${category} ${percentage}%`}
                        outerRadius={120}
                        fill="#8884d8"
                        dataKey="count"
                      >
                        {data.failureAnalytics.failuresByCategory.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={Object.values(COLORS)[index % Object.keys(COLORS).length]} 
                          />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: any) => [Number(value).toLocaleString(), 'Failures']}
                        labelFormatter={(label) => `Category: ${label}`}
                        contentStyle={{
                          backgroundColor: 'rgba(255, 255, 255, 0.95)',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          fontSize: '12px'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  
                  <ResponsiveContainer width="100%" height={350} key={`parts-analytics-bar-${chartKey}`}>
                    <BarChart
                      data={data.failureAnalytics.failuresByCategory}
                      layout="vertical"
                      margin={{ top: 20, right: 30, left: 100, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis 
                        type="number"
                        tickFormatter={(value) => value.toLocaleString()}
                      />
                      <YAxis 
                        dataKey="category" 
                        type="category"
                        tick={{ fontSize: 12 }}
                        width={90}
                      />
                      <Tooltip 
                        formatter={(value: any, name: string) => [
                          Number(value).toLocaleString(), 
                          name === 'count' ? 'Failures' : name
                        ]}
                        labelFormatter={(label) => `Category: ${label}`}
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
                        fill={COLORS.secondary}
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Confidence Distribution Scatter Plot */}
        <Card>
          <CardHeader>
            <CardTitle>Confidence Distribution</CardTitle>
            <CardDescription>Parts matching confidence analysis per entity</CardDescription>
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
                  dataKey="parts" 
                  name="Parts"
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
            <CardDescription>Parts matching rate trends per entity</CardDescription>
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
                    name === 'matchRate' ? 'Match Rate' : 'Parts'
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
                  stroke={COLORS.secondary} 
                  fill={COLORS.secondary} 
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Match Type Statistics</CardTitle>
            <CardDescription>Detailed data for each matching type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left p-2">Match Type</th>
                    <th className="text-right p-2">Count</th>
                    <th className="text-right p-2">Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <td className="p-2">Exact Matches</td>
                    <td className="text-right p-2 text-green-600">{data.exactMatches.toLocaleString()}</td>
                    <td className="text-right p-2 text-green-600">
                      {((data.exactMatches / data.totalParts) * 100).toFixed(1)}%
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <td className="p-2">Fuzzy Matches</td>
                    <td className="text-right p-2 text-amber-600">{data.fuzzyMatches.toLocaleString()}</td>
                    <td className="text-right p-2 text-amber-600">
                      {((data.fuzzyMatches / data.totalParts) * 100).toFixed(1)}%
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <td className="p-2">Description Matches</td>
                    <td className="text-right p-2 text-purple-600">{data.descriptionMatches.toLocaleString()}</td>
                    <td className="text-right p-2 text-purple-600">
                      {((data.descriptionMatches / data.totalParts) * 100).toFixed(1)}%
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <td className="p-2">Keyword Matches</td>
                    <td className="text-right p-2 text-cyan-600">{data.keywordMatches.toLocaleString()}</td>
                    <td className="text-right p-2 text-cyan-600">
                      {((data.keywordMatches / data.totalParts) * 100).toFixed(1)}%
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <td className="p-2">No Matches</td>
                    <td className="text-right p-2 text-red-600">{data.noMatches.toLocaleString()}</td>
                    <td className="text-right p-2 text-red-600">
                      {((data.noMatches / data.totalParts) * 100).toFixed(1)}%
                    </td>
                  </tr>
                  <tr className="font-medium">
                    <td className="p-2">Total</td>
                    <td className="text-right p-2">{data.totalParts.toLocaleString()}</td>
                    <td className="text-right p-2">100.0%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Matching Performance Analysis</CardTitle>
            <CardDescription>Overall matching performance evaluation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600 dark:text-gray-400">Overall Match Rate</span>
                <span className="font-semibold text-lg">
                  {((data.matchedParts / data.totalParts) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                <div 
                  className="bg-gradient-to-r from-green-500 to-blue-500 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${(data.matchedParts / data.totalParts) * 100}%` }}
                ></div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {data.matchedParts.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Successful Matches</div>
                </div>
                <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">
                    {data.noMatches.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Failed Matches</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

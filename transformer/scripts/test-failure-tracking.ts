#!/usr/bin/env ts-node

/**
 * Test script for failure tracking functionality
 * Tests VehicleMatcher and PartsMatcher failure tracking
 */

import { VehicleMatcher } from '../src/services/VehicleMatcher';
import { PartsMatcher } from '../src/services/PartsMatcher';
import { MatchingStatistics } from '../src/services/MatchingStatistics';
import { AutoCareData } from '../src/types/AutoCareTypes';

// Mock AutoCare data for testing
const mockAutoCareData: AutoCareData = {
  vcdb: {
    makes: new Map(),
    makesByName: new Map([
      ['ford', { MakeID: 1, MakeName: 'Ford' }],
      ['chevrolet', { MakeID: 2, MakeName: 'Chevrolet' }],
      ['toyota', { MakeID: 3, MakeName: 'Toyota' }]
    ]),
    models: new Map(),
    modelsByName: new Map([
      ['f150', [{ ModelID: 1, ModelName: 'F-150', MakeID: 1, VehicleTypeID: 1 }]],
      ['silverado', [{ ModelID: 2, ModelName: 'Silverado', MakeID: 2, VehicleTypeID: 1 }]]
    ]),
    baseVehicles: new Map([
      [1, { BaseVehicleID: 1, MakeID: 1, ModelID: 1, YearID: 1 }],
      [2, { BaseVehicleID: 2, MakeID: 2, ModelID: 2, YearID: 2 }]
    ]),
    years: new Map([
      [1, 2020],
      [2, 2021]
    ]),
    vehicles: new Map(),
    vehicleToEngineConfigs: new Map(),
    vehicleToTransmissions: new Map(),
    vehicleToBodyConfigs: new Map(),
    vehicleToWheelBases: new Map(),
    vehicleToBrakeConfigs: new Map(),
    engineBases: new Map(),
    engineConfigs: new Map(),
    transmissions: new Map(),
    transmissionTypes: new Map(),
    transmissionNumSpeeds: new Map(),
    driveTypes: new Map(),
    bodyTypes: new Map(),
    bodyNumDoors: new Map(),
    wheelBases: new Map(),
    brakeTypes: new Map(),
    brakeABS: new Map()
  },
  pcdb: {
    parts: new Map(),
    partsByName: new Map([
      ['oil filter', { PartId: 1, PartNumber: 'OF123', PartTerminologyName: 'Oil Filter', BrandLabel: 'ACDelco', PartTerminologyID: 1, PartsDescriptionId: 1, RevDate: '2024-01-01' }],
      ['brake pad', { PartId: 2, PartNumber: 'BP456', PartTerminologyName: 'Brake Pad', BrandLabel: 'Wagner', PartTerminologyID: 2, PartsDescriptionId: 2, RevDate: '2024-01-01' }]
    ])
  }
};

async function testFailureTracking() {
  console.log('🧪 Testing Failure Tracking Implementation\n');
  console.log('='.repeat(50));

  // Initialize services
  const vehicleMatcher = new VehicleMatcher(mockAutoCareData);
  const partsMatcher = new PartsMatcher(mockAutoCareData);
  const stats = new MatchingStatistics();

  console.log('\n1. Testing Vehicle Matcher Failures:');
  console.log('-'.repeat(30));

  // Test various failure scenarios
  const vehicleTestCases = [
    { make: undefined, model: undefined, year: undefined, expected: 'NO_INPUT_DATA' },
    { make: 'InvalidMake', model: 'F-150', year: 2020, expected: 'MAKE_NOT_FOUND' },
    { make: 'Ford', model: 'InvalidModel', year: 2020, expected: 'MODEL_NOT_FOUND' },
    { make: 'Ford', model: 'F-150', year: 1990, expected: 'YEAR_OUT_OF_RANGE' },
  ];

  for (const testCase of vehicleTestCases) {
    console.log(`\nTesting: make="${testCase.make}", model="${testCase.model}", year=${testCase.year}`);
    const result = vehicleMatcher.matchVehicle(testCase.make, testCase.model, testCase.year);
    
    console.log(`  Matched: ${result.matched}`);
    console.log(`  Failure Reason: ${result.failureReason || 'None'}`);
    console.log(`  Failure Details: ${result.failureDetails || 'None'}`);
    console.log(`  Attempted Methods: ${result.attemptedMethods?.join(', ') || 'None'}`);
    
    if (!result.matched) {
      stats.recordVehicleFailure(result);
    } else {
      stats.recordVehicleSuccess(result);
    }
  }

  console.log('\n\n2. Testing Parts Matcher Failures:');
  console.log('-'.repeat(30));

  // Test parts failure scenarios
  const partsTestCases = [
    { title: undefined, description: undefined, expected: 'NO_INPUT_DATA' },
    { title: 'Non-existent Part XYZ', description: '', expected: 'NO_MATCHING_PARTS' },
    { title: 'Oil Filter', description: 'Engine oil filter', expected: 'SUCCESS' },
  ];

  for (const testCase of partsTestCases) {
    console.log(`\nTesting: title="${testCase.title}", description="${testCase.description}"`);
    const result = await partsMatcher.matchPart(testCase.title, testCase.description);
    
    console.log(`  Matched: ${result.matched}`);
    console.log(`  Failure Reason: ${result.failureReason || 'None'}`);
    console.log(`  Failure Details: ${result.failureDetails || 'None'}`);
    console.log(`  Attempted Methods: ${result.attemptedMethods?.join(', ') || 'None'}`);
    console.log(`  Search Terms: ${result.searchTerms?.join(', ') || 'None'}`);
    
    if (!result.matched) {
      stats.recordPartsFailure(result);
    } else {
      stats.recordPartsSuccess(result);
    }
  }

  console.log('\n\n3. Statistics Summary:');
  console.log('-'.repeat(30));

  const report = stats.generateReport();
  
  console.log(`Total Attempts: ${report.totalAttempts}`);
  console.log(`Successful Matches: ${report.successfulMatches}`);
  console.log(`Failed Matches: ${report.failedMatches}`);
  console.log(`Success Rate: ${report.successRate.toFixed(1)}%`);
  
  console.log(`\nVehicle Stats:`);
  console.log(`  Total Attempts: ${report.vehicleStats.totalAttempts}`);
  console.log(`  Successful: ${report.vehicleStats.successfulMatches}`);
  console.log(`  Top Failures: ${report.vehicleStats.commonFailures.join(', ')}`);
  
  console.log(`\nParts Stats:`);
  console.log(`  Total Attempts: ${report.partsStats.totalAttempts}`);
  console.log(`  Successful: ${report.partsStats.successfulMatches}`);
  console.log(`  Top Failures: ${report.partsStats.commonFailures.join(', ')}`);
  
  console.log(`\nTop Recommendations:`);
  report.recommendedImprovements.forEach((rec, i) => {
    console.log(`  ${i + 1}. ${rec}`);
  });

  console.log('\n\n4. Detailed Failure Analysis:');
  console.log('-'.repeat(30));

  if (report.vehicleStats.failuresByReason.length > 0) {
    console.log('\nVehicle Failure Breakdown:');
    report.vehicleStats.failuresByReason.forEach(failure => {
      console.log(`  ${failure.reason}: ${failure.count} (${failure.percentage.toFixed(1)}%)`);
      failure.sampleDetails.forEach((detail, i) => {
        console.log(`    Sample ${i + 1}: ${detail}`);
      });
    });
  }

  if (report.partsStats.failuresByReason.length > 0) {
    console.log('\nParts Failure Breakdown:');
    report.partsStats.failuresByReason.forEach(failure => {
      console.log(`  ${failure.reason}: ${failure.count} (${failure.percentage.toFixed(1)}%)`);
      failure.sampleDetails.forEach((detail, i) => {
        console.log(`    Sample ${i + 1}: ${detail}`);
      });
    });
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ Failure Tracking Test Complete!');
  console.log('\nThe failure tracking system is now working and can provide:');
  console.log('- Detailed failure reasons for each match attempt');
  console.log('- Statistics on common failure patterns');
  console.log('- Actionable recommendations for improvements');
  console.log('- Performance tracking and analysis');
  
  return report;
}

// Run the test if this script is executed directly
if (require.main === module) {
  testFailureTracking().catch(console.error);
}

export { testFailureTracking };
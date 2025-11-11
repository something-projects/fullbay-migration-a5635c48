import path from 'path';
import { loadFinancialMatches, summarizeFinancialFailures } from '../server/lib/financialLoader';

async function main() {
  const entityId = '416';
  const outputPath = path.join(process.cwd(), '..', 'output', entityId);

  console.log(`Testing financial data loading for Entity ${entityId}...`);
  console.log(`Output path: ${outputPath}\n`);

  try {
    const financials = await loadFinancialMatches(outputPath);
    const summary = summarizeFinancialFailures(financials);

    console.log('=== Financial Data Summary ===');
    console.log(`Total invoices: ${summary.totals.total}`);
    console.log(`Validated: ${summary.totals.validated}`);
    console.log(`Legacy: ${summary.totals.legacy}`);
    console.log(`Pending: ${summary.totals.pending}`);
    console.log();

    console.log('=== Top Issues ===');
    summary.topFailures.forEach((failure, index) => {
      console.log(`${index + 1}. ${failure.reason}: ${failure.count} invoices`);
    });
    console.log();

    // Show first 5 invoices as examples
    console.log('=== Sample Invoices (first 5) ===');
    financials.slice(0, 5).forEach((invoice, index) => {
      console.log(`\n${index + 1}. Invoice #${invoice.invoiceNumber} (ID: ${invoice.invoiceId})`);
      console.log(`   Customer: ${invoice.customerName || 'Unknown'}`);
      console.log(`   RO #: ${invoice.roNumber || 'N/A'}`);
      console.log(`   Total: $${invoice.totalAmount?.toFixed(2) || '0.00'}`);
      console.log(`   Paid: $${invoice.paidAmount?.toFixed(2) || '0.00'}`);
      console.log(`   Balance: $${invoice.balanceDue?.toFixed(2) || '0.00'}`);
      console.log(`   Status: ${invoice.paymentStatus || 'unknown'}`);
      console.log(`   Match Rate: ${(invoice.matchRate * 100).toFixed(0)}%`);
      console.log(`   Validation Status: ${invoice.status}`);
      if (invoice.issues && invoice.issues.length > 0) {
        console.log(`   Issues: ${invoice.issues.join(', ')}`);
      }
    });

  } catch (error) {
    console.error('Error loading financial data:', error);
    process.exit(1);
  }
}

main();

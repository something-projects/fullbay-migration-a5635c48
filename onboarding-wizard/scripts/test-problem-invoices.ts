import path from 'path';
import { loadFinancialMatches } from '../server/lib/financialLoader';

async function main() {
  const entityId = '416';
  const outputPath = path.join(process.cwd(), '..', 'output', entityId);

  const financials = await loadFinancialMatches(outputPath);

  // Find invoices with issues
  const problemInvoices = financials.filter(f => f.issues && f.issues.length > 0);

  console.log(`Found ${problemInvoices.length} invoices with issues:\n`);

  problemInvoices.forEach((invoice, index) => {
    console.log(`${index + 1}. Invoice #${invoice.invoiceNumber} (ID: ${invoice.invoiceId})`);
    console.log(`   Customer: ${invoice.customerName || 'Unknown'}`);
    console.log(`   RO #: ${invoice.roNumber || 'N/A'}`);
    console.log(`   Total: $${invoice.totalAmount?.toFixed(2) || '0.00'}`);
    console.log(`   Paid: $${invoice.paidAmount?.toFixed(2) || '0.00'}`);
    console.log(`   Status: ${invoice.paymentStatus || 'unknown'}`);
    console.log(`   Match Rate: ${(invoice.matchRate * 100).toFixed(0)}%`);
    console.log(`   Validation Status: ${invoice.status}`);
    console.log(`   Issues: ${invoice.issues?.join(', ')}`);
    console.log(`   Matched Attributes: ${invoice.matchedAttributes.join(', ')}`);
    console.log(`   Unmatched Attributes: ${invoice.unmatchedAttributes.join(', ')}`);
    console.log();
  });
}

main();

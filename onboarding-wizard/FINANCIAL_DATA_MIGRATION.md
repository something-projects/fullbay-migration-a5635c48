# Financial Data Migration Analysis

## Overview
Based on the conversation with Steve, financial data is the **highest priority** for migration. Customers care more about preserving financial records than perfect vehicle data.

## Key Insights from Transcript

### Priority Order:
1. **Financial/Invoice data** - MUST migrate perfectly
2. **Parts data** - Need for financial records
3. **Vehicle data** - Can be imported as "legacy" and fixed later
4. **Employee data** - Only billable hours matter

### Quote from Steve:
> "The really critical stuff that has to get into the system, the absolutely critical stuff is we've got to be able to pull financial data over, right, because we've got to be able to reconcile, we've got to be able to build"

## Main Invoice Table: RepairOrderInvoice

### Structure
The `RepairOrderInvoice` table contains comprehensive financial data with well-structured fields:

**Key Identifiers:**
- `repairOrderInvoiceId` - Primary key
- `repairOrderId` - Links to repair order (UNIQUE)
- `customerId` - Links to customer
- `entityLocationId` - Shop location

**Financial Totals:**
- `chargeTotal` - Total charged to customer
- `costTotal` - Total cost to shop
- `distanceTotal` - Distance charges
- `partsTotal` - Parts subtotal
- `laborHoursTotal` - Total labor hours
- `laborTotal` - Labor charges
- `suppliesTotal` - Supplies charges
- `taxTotal` - Tax amount
- `total` - Grand total
- `balance` - Remaining balance

**Metadata:**
- `invoiceDate` - When invoice was created
- `invoiceNumber` - Sequential invoice number
- `status` - Invoice status
- `exported` - Whether exported to accounting
- `quickBooksId` - QuickBooks integration ID

### Data Quality Assessment
✅ **Strengths:**
- Well-indexed with proper keys on critical fields
- Has `customerTitle`, `shopTitle` - preserves snapshot of names at invoice time
- Includes billing addresses and contact info
- Multiple totals for reconciliation
- Integration tracking (QuickBooks, FleetNet, IBS)

⚠️ **Considerations:**
- Links to `repairOrderId` which may have bad vehicle data
- Links to `customerId` which may have issues
- BUT financial data itself should be complete and accurate

## Migration Strategy

### Core Principle
**"Legacy Vehicle" approach allows us to:**
1. Import ALL invoices with full financial data
2. Link invoices to "Fullbay Legacy" vehicle type (read-only)
3. Preserve complete financial history
4. Not block migration on vehicle data cleanup

### Implementation Plan

1. **Import Invoices First**
   - RepairOrderInvoice table → New system invoices
   - Preserve all financial totals
   - Maintain invoice numbers and dates
   - Keep QuickBooks/integration IDs

2. **Handle Vehicle Links**
   - If vehicle data is good (>90% match) → link to proper vehicle
   - If vehicle data is bad → create "Fullbay Legacy" vehicle stub
   - Legacy vehicle contains: just enough info to display on invoice

3. **Parts References**
   - Import parts used on invoices
   - Use "Fullbay Generic Parts" for unmatched items
   - Preserve part costs and quantities

4. **Customer References**
   - Preserve customer snapshot data from invoice
   - Link to customer if available, or create minimal customer record

### Benefits of This Approach
- ✅ Zero data loss on financial records
- ✅ Can pass audits (all invoices preserved)
- ✅ Shop can operate immediately
- ✅ Customers aren't blocked by cleanup
- ✅ Fix vehicle data incrementally as needed

## Related Tables

### RepairOrderInvoicePayment
- Payment records against invoices
- Must migrate with invoices

### EntityInvoice & EntityInvoiceRow
- Internal shop invoicing
- Also needs migration

### Customer Part Orders
- Parts ordering history
- Useful for parts reconciliation

## Testing with McLam Customer (ID 1816)

Entity 1816 ("Mclam Mechanical Services") has:
- 190+ customers
- Many with poor vehicle data quality
- Examples: "CIMS", "Clean Harbors" as vehicle names

This is **perfect** for testing the legacy approach:
- Most vehicles will be marked legacy
- Financial data should still migrate cleanly
- Proves the "skip fixing now" workflow

## Next Steps

1. **Implement invoice data loader**
   - Read RepairOrderInvoice from test_db
   - Transform to new schema format
   - Handle legacy vehicle references

2. **Add invoice preview to onboarding wizard**
   - Show "X invoices will be imported"
   - Preview financial data quality
   - Link invoices to vehicles/customers

3. **Test end-to-end with mclam**
   - Mark most vehicles as legacy
   - Verify all invoices still import
   - Confirm financial totals preserved

## Key Quotes from Transcript

**On financial priority:**
> "I would guess this guy cares a whole lot more about the parts he used to fix that trailer and how much it cost him and how much he built than he does what the actual detail about that trailer is."

**On not forcing cleanup:**
> "if that's 25% of all of our customers, and that's how it kind of looks for them, there's no way, we're not going to get anybody to actually manually update this data on the way in"

**On invoice priority:**
> "if we get the invoices nailed down and the parts stuff nailed down, that's like a huge jump forward"

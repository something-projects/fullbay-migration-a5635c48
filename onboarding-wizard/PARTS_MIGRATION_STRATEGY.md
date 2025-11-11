# Parts Migration Strategy: "Fullbay Generic Parts"

## Problem Statement
From the transcript analysis, parts data has **very low match rates** (<10%) with PIES database. However, many parts are common across shops and follow predictable naming patterns.

### Examples from Data:
- "15W40 oil" appears 200+ times
- "Fuel filter" variants appear 14,000+ times
- "Zip ties", "rags", "supplies" are universal

## Solution: Fullbay Generic Parts

### Core Concept
Create a **"Fullbay Generic Parts" domain** separate from PIES that handles common, non-PIES-standardized parts.

### Quote from Steve:
> "If we find stuff that, this is definitely something Claude can do, if we find parts that are named a certain way that imply a certain type of part, right, we can auto-guess at it. Like, you had that one that was 15W30 oil in the one when you're showing Kirk, right? We should be able to say something that says something like, hey, if you see 15W30, that's a 15W30 oil part, and we can just make that part generic across all of Fullbay."

## Implementation Strategy

### Phase 1: Pattern Detection
Use AI/regex to detect common part patterns:

**Oil Products:**
```regex
/\d+W\d+/i  # Matches: 15W40, 10W30, 5W20
```
Examples:
- "15W40 oil" → "Fullbay Generic 15W40 Engine Oil"
- "Valvoline 10W30" → "Fullbay Generic 10W30 Engine Oil"

**Filters:**
```regex
/(fuel|oil|air|cabin)\s*filter/i
```
Examples:
- "main engine fuel filter" → "Fullbay Generic Fuel Filter"
- "oil filter" → "Fullbay Generic Oil Filter"
- "air filter" → "Fullbay Generic Air Filter"

**Supplies:**
```regex
/(zip\s*tie|rag|glove|shop\s*supply)/i
```
Examples:
- "zip ties" → "Fullbay Generic Zip Ties"
- "shop rags" → "Fullbay Generic Shop Rags"
- "nitrile gloves" → "Fullbay Generic Gloves"

**Fluids:**
```regex
/(coolant|antifreeze|brake\s*fluid|transmission\s*fluid)/i
```

### Phase 2: Vendor Part Number Recognition
Many part descriptions include vendor part numbers:

Example from data:
```
"VPV06711 Valvoline premium diesel engine oil 15w40"
```

Pattern: `VPV\d+` is likely the Valvoline part ID

**Strategy:**
- Extract vendor prefixes (VPV, ACDelco, etc.)
- Use as secondary identifier
- Link to Fullbay Generic part with vendor info preserved

### Phase 3: Top Parts Analysis

From the transcript, Steve mentioned analyzing the most common parts:

> "if we knock, like, all of those, I mean, that feels to me like 15 parts of Fullbay parts, right? And then that knocks off something like, like, approaching 30,000 fails, right?"

**Top Failures by Category:**
1. **Lubrication** - 300,000+ records
   - Oils (various weights)
   - Greases
   - Lubricants

2. **Filters** - High volume
   - Fuel filters
   - Oil filters
   - Air filters
   - Hydraulic filters

3. **Tires** - Common
4. **Other** - Misc supplies

**Action Items:**
- Generate report of top 50 most common part descriptions
- Create Fullbay Generic parts for top patterns
- This could cover 60-70% of unmatched parts

## Data Model

### Fullbay Generic Part Structure
```typescript
interface FullbayGenericPart {
  fullbayPartId: string;  // NOT a PIES ID - our own namespace
  category: 'oil' | 'filter' | 'fluid' | 'supply' | 'tire' | 'other';
  displayName: string;  // "Fullbay Generic 15W40 Engine Oil"
  searchTerms: string[];  // ["15W40", "15-40", "fifteen forty"]
  suggestedMatches?: string[];  // Hints for better matching
  preserveVendorInfo: boolean;  // Keep original vendor part numbers
}
```

### Migration Process
```
For each part in legacy system:
  1. Try to match with PIES → if match, use PIES part
  2. If no PIES match, try Fullbay Generic patterns
  3. If pattern matches, create Fullbay Generic part
  4. If no pattern, create shop-specific part (requires manual review)
```

## Benefits

### For Shop Owners:
- ✅ Don't have to manually map thousands of parts
- ✅ Common parts "just work"
- ✅ Can still operate immediately after migration
- ✅ Fix outliers incrementally

### For Fullbay:
- ✅ Reusable across all shops
- ✅ Network effect: Each shop improves the generic parts database
- ✅ Can build pricing suggestions over time
- ✅ Reduces support burden

### For Migration:
- ✅ Dramatically reduces unmatched parts
- ✅ Preserves financial history (parts costs preserved)
- ✅ Allows "good enough" migration
- ✅ Improves over time with ML/AI

## Pricing Considerations

From Steve's comments:
> "I think we want to have a Fullbay part definition of what it is, but not a default price for what it is, because... Oil prices can vary country, across the country, right, for the same thing."

**Strategy:**
- Fullbay Generic parts have NO default price
- Preserve historical pricing from invoices
- Let shops set their own pricing
- Can suggest pricing based on:
  - Shop's historical pricing
  - Regional averages (future feature)
  - Vendor catalogs (future feature)

## Unknown Part Types

Some parts have unclear meanings and need research:

### "Fridge" Category
From data: Appears frequently but unclear what it means

**Action Item:** Ask product team (Sarah) what "fridge" means in parts context
- Refrigeration parts?
- Freight/shipping category?
- Something else?

## Implementation Phases

### Phase 1 (Current Sprint):
1. ✅ Analyze top 100 most common part descriptions
2. ✅ Create pattern matching rules
3. ✅ Document Fullbay Generic part concept
4. ⏳ Build pattern detection module

### Phase 2 (Next Sprint):
1. Generate Fullbay Generic part definitions
2. Add to onboarding wizard UI
3. Show: "X parts matched to Fullbay Generic, Y need review"
4. Allow bulk acceptance/rejection

### Phase 3 (Future):
1. Machine learning for pattern recognition
2. Vendor catalog integration
3. Pricing intelligence
4. Shop-specific customization

## Testing with McLam (ID 1816)

Test the generic parts system with a real shop:
1. Analyze their parts database
2. Apply pattern matching
3. Measure coverage improvement
4. Identify gaps in pattern recognition

**Expected Outcomes:**
- Before: <10% PIES match
- After Fullbay Generic: 60-70% total match
- Remaining: Shop-specific or unusual parts

## Files to Create

1. `server/lib/partsMatcher.ts` - Pattern detection logic
2. `server/lib/fullbayGenericParts.ts` - Generic part definitions
3. `server/lib/partsAnalyzer.ts` - Top parts analysis
4. Update `server/lib/partLoader.ts` - Integrate generic matching

## Success Metrics

- % of parts matched (PIES + Fullbay Generic)
- Reduction in "needs review" parts
- Shop owner satisfaction
- Time to complete onboarding

## Key Quotes

**On not forcing precision:**
> "we're not going to be able to be that structured with it. Do you know what I mean?"

**On practical approach:**
> "I don't think we're going to be able to be that structured with it... we're creating, like, our own domain area, where we can put all these generic parts without having to interface with Pies."

**On common parts:**
> "I would bet you any money, there's a bunch of stuff in there that is valid and is going to be common across 80% of shops, right? Zip ties will be common, rags will be common, oil will be common."

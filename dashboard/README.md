# Fullbay Fleet Customer Dashboard

A TypeScript React application for repair shops to browse their fleet customer data exports.

## Setup

```bash
npm install
npm run dev
```

## Features

- Browse data exports by timestamp
- View repair shops (entities) within each export
- Browse fleet customers within each repair shop
- Unit-first navigation: view fleet vehicles first, then filter service orders by unit
- TypeScript for type safety
- URL routing for bookmarkable navigation

## Navigation Flow

1. **Homepage** - Select data export timestamp
2. **All Fleet Customers** - Browse all fleet customers across repair shops
3. **Customer Units** - View fleet vehicles for a specific customer company
4. **Service Orders** - View repair work performed on specific vehicles

**Business Context**:
- **Entity** = **Repair Shop** (Fullbay user/tenant)
- **Customer** = **Fleet Company** (repair shop's customer)
- **CustomerUnit** = **Fleet Vehicle** (brought to repair shop for service)

## Development

- `npm run dev` - Start development server on port 3002
- `npm run build` - Build for production
- `npm run type-check` - Check TypeScript types
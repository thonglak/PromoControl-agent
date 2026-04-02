---
name: frontend-design
description: Create distinctive, production-grade Angular 21 interfaces with high design quality for PromoControl. Use this skill when building components, pages, or dashboards. Generates polished, accessible UI using Angular Material 21 M3, Tailwind CSS 3, and corporate Navy premium theming. Focuses on Thai localization and exceptional UX details.
license: Complete terms in LICENSE.txt
---

This skill guides creation of distinctive, production-grade frontend interfaces for PromoControl using Angular 21 + Angular Material 21 + Tailwind CSS 3. Implement real working code with exceptional attention to aesthetic details, accessibility, and corporate design standards.

The user provides frontend requirements: a component, page, dashboard, or interface to build for PromoControl. They may include context about the purpose, audience, or business logic.

## PromoControl Technology Stack

**Framework & UI**:
- **Angular 21** - Standalone components only (`standalone: true`)
- **Angular Material 21** - M3 theme system
- **Tailwind CSS 3** - Utility-first styling (NO inline styles)
- **Icons** - Custom `<app-icon name="...">` component (NOT `mat-icon` or PrimeIcons)
- **Fonts** - Inter (primary) + Noto Sans Thai (Thai text)

**State Management**:
- `signal()` for reactive state
- `computed()` for derived values
- `effect()` for side effects
- Avoid RxJS observables unless needed for HTTP

**Control Flow** (Angular 21):
- `@if` condition { content } - NOT `*ngIf`
- `@for item of items; track item` - NOT `*ngFor` or `track $index`
- `@switch value { @case case1 {} }` - NOT `*ngSwitch`

**Theme: Corporate Navy Premium**
- **Primary**: #16324F (Navy 900) - Navigation, headers, key actions
- **Accent**: #C8A96B (Gold) - Call-to-action, highlights, premium feel
- **Semantic Colors**:
  - Green (#10B981) - Profit, success, positive values
  - Red (#EF4444) - Loss, error, negative values
  - Orange (#F97316) - Discounts, promotional offers
  - Blue (#3B82F6) - Budget info, informational states

**Layout Conventions**:
- Sidebar navigation (Navy gradient background, golden hover states)
- Topbar with user profile and actions
- Responsive grid: desktop-first with mobile breakpoints
- Consistent spacing: 4px base unit (Tailwind's `space-*`)

**Component Patterns**:
- KPI cards with trend indicators
- Data tables with pagination
- Forms with section grouping
- Breadcrumb trails
- Toast notifications
- Modal dialogs

## Design Thinking for PromoControl

Before coding, understand the business context and user needs:
- **Purpose**: What business problem does this interface solve? (e.g., budget tracking, promotion eligibility, sales reconciliation)
- **Audience**: Internal staff (finance, marketing, sales)
- **Data Context**: What metrics or records does the user need to see/edit?
- **Action Flow**: What decisions or actions should the interface enable?

Then implement working code that is:
- Production-grade, tested, and fully functional
- Accessible (WCAG 2.1 AA) - proper contrast, keyboard navigation, semantic HTML
- Visually cohesive with the Navy/Gold theme
- Responsive across desktop, tablet, mobile
- Thai-localized where needed (labels, placeholders, error messages)

## Implementation Guidelines

**Typography**:
- Use Inter for UI labels, headings, body text (English)
- Use Noto Sans Thai for Thai language text
- Maintain visual hierarchy through font size and weight

**Color & Theme**:
- Use Tailwind utilities for all colors (NOT hex values in code)
- Leverage Angular Material M3 theme for consistent component styling
- Navy (#16324F) for primary actions and navigation
- Gold (#C8A96B) for accents and premium interactions
- Respect semantic colors for data visualization

**Motion**:
- CSS transitions for smooth state changes
- Focus on practical micro-interactions (loading states, hover feedback)
- Page transitions should be subtle, not distracting
- Avoid excessive animations in data-heavy tables

**Spatial Composition**:
- Clean, predictable layouts aligned to 4px grid
- Generous whitespace to reduce cognitive load
- Clear visual hierarchy with typography and color
- Consistent padding and margins via Tailwind spacing

**Accessibility**:
- Semantic HTML elements (`<button>`, `<nav>`, `<form>`, etc.)
- ARIA labels where needed
- Color not the only indicator of state/meaning (use icons, text, patterns)
- Keyboard navigation fully supported
- Focus indicators visible

**Docker Development**:
- Run Angular dev server via Docker: `docker exec promo_frontend ng serve`
- Node 15 is NOT available on host - all Node commands run in container
- Hot reload works with mounted volume
- Use `docker logs promo_frontend` for debugging

## Reference Files

- **docs/** - Business logic and requirements
- **src/app/** - Existing component patterns
- **tailwind.config.ts** - Theme configuration
- **theme.scss** - Material M3 theme setup

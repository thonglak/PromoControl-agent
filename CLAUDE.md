# Claude Instructions

You are building a Promotion & Budget Management System for a real estate company.

Important rules:
1. Do NOT change business formulas.
2. Promotion categories must be: discount, premium, expense_support.
3. Premium items may convert to discount.
4. Budget source must be tracked separately from promotion category.
5. All budget changes must go through budget_movements ledger.
6. Never directly update balances; always derive from movements.
7. Always read the documentation in /docs before generating code.
8. ภาษา: Business logic (comments, docs, UI labels, error messages) เป็นภาษาไทย / Code (variables, functions, classes, DB columns, API paths) เป็นภาษาอังกฤษ